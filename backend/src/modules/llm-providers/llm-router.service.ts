import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LlmProvider, Organization, UsageMetric } from "../../common/entities";
import {
  ProviderType,
  ProviderStatus,
  SubscriptionPlan,
  UsageMetricType,
} from "../../common/enums";
import {
  BaseLLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
} from "./interfaces/llm-provider.interface";
import { DeepSeekProvider } from "./providers/deepseek.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { RunPodProvider } from "./providers/runpod.provider";

export interface RouterRequest extends LLMRequest {
  organizationId: string | null;
  userId?: string;
  agentId?: string;
  priority?: "low" | "normal" | "high";
  requiresFunctionCalling?: boolean;
  requiresImageAnalysis?: boolean;
}

@Injectable()
export class LLMRouterService implements OnModuleInit {
  private readonly logger = new Logger(LLMRouterService.name);
  private providerInstances = new Map<string, BaseLLMProvider>();
  private rateLimiters = new Map<
    string,
    { requests: number; tokens: number; resetTime: number }
  >();

  constructor(
    @InjectRepository(LlmProvider)
    private readonly providerRepository: Repository<LlmProvider>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,
  ) {}

  async onModuleInit() {
    await this.initializeProviders();
    this.startHealthChecks();
  }

  async generateResponse(request: RouterRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const availableProviders = Array.from(this.providerInstances.values());

    // Try each provider in order of priority
    for (let i = 0; i < availableProviders.length; i++) {
      try {
        const provider = i === 0 
          ? await this.selectProvider(request)
          : await this.selectFallbackProvider(request);
        
        if (!provider) {
          continue;
        }

        // Skip rate limit check for fallback attempts
        if (i === 0) {
          await this.checkRateLimit(provider.getName(), request);
        }

        this.logger.log(`Attempting generation with provider: ${provider.getName()}`);

        // Generate response with increased timeout for network issues
        const response = await Promise.race([
          provider.generateResponse(request),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 45000)
          )
        ]) as LLMResponse;

        // Track usage
        await this.trackUsage(
          request.organizationId,
          provider.getName(),
          response.usage,
        );

        // Update rate limiter
        this.updateRateLimit(provider.getName(), response.usage.totalTokens);

        this.logger.log(`✅ Successfully generated response with ${provider.getName()}`);
        return response;

      } catch (error) {
        const isNetworkError = error.message?.includes('EAI_AGAIN') || 
                              error.message?.includes('ECONNREFUSED') ||
                              error.message?.includes('ENOTFOUND') ||
                              error.message?.includes('timeout');
        
        this.logger.warn(`Provider failed (${isNetworkError ? 'network' : 'other'}): ${error.message}`);
        
        // Continue to next provider for network errors or last attempt
        if (isNetworkError || i < availableProviders.length - 1) {
          continue;
        }
        
        // Re-throw error if it's the last provider and not a network issue
        throw error;
      }
    }

    throw new Error('All LLM providers failed. No response could be generated.');
  }

  async *generateStreamResponse(
    request: RouterRequest,
  ): AsyncGenerator<LLMStreamResponse> {
    try {
      const provider = await this.selectProvider(request);
      await this.checkRateLimit(provider.getName(), request);

      let totalTokens = 0;

      for await (const chunk of provider.generateStreamResponse(request)) {
        if (chunk.usage) {
          totalTokens = chunk.usage.totalTokens;
        }
        yield chunk;
      }

      // Track final usage
      if (totalTokens > 0) {
        await this.trackUsage(request.organizationId, provider.getName(), {
          totalTokens,
        });
        this.updateRateLimit(provider.getName(), totalTokens);
      }
    } catch (error) {
      this.logger.error(`LLM stream generation failed: ${error.message}`);
      throw error;
    }
  }

  async getProviderHealth(): Promise<Record<string, any>> {
    const healthStatus = {};

    for (const [name, provider] of this.providerInstances) {
      try {
        healthStatus[name] = await provider.checkHealth();
      } catch (error) {
        healthStatus[name] = {
          status: "unhealthy",
          error: error.message,
          lastCheck: new Date(),
        };
      }
    }

    return healthStatus;
  }

  private async initializeProviders(): Promise<void> {
    this.logger.log("Initializing LLM providers...");

    const providers = await this.providerRepository.find({
      where: { status: ProviderStatus.ACTIVE },
    });

    for (const providerConfig of providers) {
      try {
        const provider = this.createProviderInstance(providerConfig);
        if (provider) {
          this.providerInstances.set(providerConfig.name, provider);
          this.logger.log(`Initialized provider: ${providerConfig.name}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to initialize provider ${providerConfig.name}: ${error.message}`,
        );
      }
    }

    // Initialize default providers if none exist
    if (this.providerInstances.size === 0) {
      await this.initializeDefaultProviders();
    }
  }

  private async initializeDefaultProviders(): Promise<void> {
    // Create DeepSeek API as primary provider (with API key from env)
    const deepseekConfig = {
      apiKey: process.env.DEEPSEEK_API_KEY,
      apiEndpoint: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: "deepseek-chat",
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 30000,
      supportedFeatures: {
        streaming: true,
        functionCalling: true,
        imageAnalysis: false,
        codeGeneration: true,
      },
    };

    if (deepseekConfig.apiKey && deepseekConfig.apiKey !== 'disabled') {
      const deepseekProvider = new DeepSeekProvider(deepseekConfig);
      this.providerInstances.set("deepseek-fallback", deepseekProvider);
      this.logger.log("Initialized DeepSeek as fallback provider");
    } else {
      this.logger.warn("DeepSeek API key not found or disabled, skipping fallback provider");
    }

    // Create fallback Ollama provider if available
    const ollamaConfig = {
      apiEndpoint: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "qwen2.5:7b",
      maxTokens: 2000,
      temperature: 0.7,
      timeout: 60000, // Increased timeout for better performance
      supportedFeatures: {
        streaming: true,
        functionCalling: false,
        imageAnalysis: false,
        codeGeneration: true,
      },
    };

    try {
      const ollamaProvider = new OllamaProvider(ollamaConfig);
      // Test if Ollama is available
      await ollamaProvider.checkHealth();
      this.providerInstances.set("ollama-primary", ollamaProvider);
      this.logger.log("Initialized primary Ollama provider");
    } catch (error) {
      this.logger.warn(`Ollama not available: ${error.message}, skipping primary provider`);
    }
  }

  private createProviderInstance(config: LlmProvider): BaseLLMProvider | null {
    switch (config.type) {
      case ProviderType.DEEPSEEK:
        return new DeepSeekProvider(config.config);

      case ProviderType.MISTRAL:
        return new MistralProvider(config.config);

      case ProviderType.OPENAI:
        return new OpenAIProvider(config.config);

      case ProviderType.OLLAMA:
        return new OllamaProvider(config.config);

      case 'RUNPOD' as ProviderType:
        return new RunPodProvider({
          ...config.config,
          apiKey: process.env.RUNPOD_API_KEY,
          endpointId: process.env.RUNPOD_ENDPOINT_ID,
          apiEndpoint: process.env.RUNPOD_BASE_URL || 'https://api.runpod.ai/v2',
        });

      default:
        this.logger.warn(`Unknown provider type: ${config.type}`);
        return null;
    }
  }

  private async selectProvider(
    request: RouterRequest,
  ): Promise<BaseLLMProvider> {
    let organization = null;
    if (request.organizationId) {
      organization = await this.organizationRepository.findOne({
        where: { id: request.organizationId },
        relations: ["subscriptions"],
      });
    }

    const subscription = organization?.subscriptions?.[0];
    const plan = subscription?.plan || SubscriptionPlan.FREE;

    // Route based on subscription tier and request requirements
    const availableProviders = Array.from(this.providerInstances.values());

    // Filter providers based on plan
    let eligibleProviders = this.filterProvidersByPlan(
      availableProviders,
      plan,
    );

    // Filter by feature requirements
    if (request.requiresFunctionCalling) {
      eligibleProviders = eligibleProviders.filter(
        (p) => p.getConfig().supportedFeatures?.functionCalling,
      );
    }

    if (request.requiresImageAnalysis) {
      eligibleProviders = eligibleProviders.filter(
        (p) => p.getConfig().supportedFeatures?.imageAnalysis,
      );
    }

    if (eligibleProviders.length === 0) {
      throw new Error("No eligible providers available for this request");
    }

    // Select based on current load and health
    return this.selectBestProvider(eligibleProviders, request);
  }

  private filterProvidersByPlan(
    providers: BaseLLMProvider[],
    plan: SubscriptionPlan,
  ): BaseLLMProvider[] {
    switch (plan) {
      case SubscriptionPlan.FREE:
        // Use DeepSeek as primary, fallback to Ollama/Mistral for free tier
        return providers.filter(
          (p) => p.getType() === "deepseek" || p.getType() === "ollama" || p.getType() === "mistral",
        );

      case SubscriptionPlan.STANDARD:
        // Use DeepSeek as primary, Ollama and Mistral as fallbacks
        return providers.filter(
          (p) => p.getType() === "deepseek" || p.getType() === "ollama" || p.getType() === "mistral",
        );

      case SubscriptionPlan.PRO:
        // Use DeepSeek as primary, all others as fallbacks
        return providers.filter(
          (p) =>
            p.getType() === "deepseek" ||
            p.getType() === "ollama" ||
            p.getType() === "mistral" ||
            p.getType() === "openai",
        );

      case SubscriptionPlan.ENTERPRISE:
        // All providers available for enterprise with DeepSeek prioritized
        return providers;

      default:
        // Default to DeepSeek first, then fallback to free options
        return providers.filter(
          (p) => p.getType() === "deepseek" || p.getType() === "ollama" || p.getType() === "mistral",
        );
    }
  }

  private async selectBestProvider(
    providers: BaseLLMProvider[],
    request: RouterRequest,
  ): Promise<BaseLLMProvider> {
    // Priority order: Ollama primary > DeepSeek fallback > autres
    const nameOrder = ["ollama-primary", "deepseek-fallback", "ollama-fallback", "qwen-fallback", "mistral-secondary-fallback"];
    
    // Sort providers by name priority
    const sortedProviders = providers.sort((a, b) => {
      const priorityA = nameOrder.indexOf(a.getName());
      const priorityB = nameOrder.indexOf(b.getName());
      
      // If name not in priority list, put it at the end
      const adjustedPriorityA = priorityA === -1 ? 999 : priorityA;
      const adjustedPriorityB = priorityB === -1 ? 999 : priorityB;
      
      return adjustedPriorityA - adjustedPriorityB;
    });

    // Select first healthy provider based on priority
    for (const provider of sortedProviders) {
      try {
        const health = await provider.checkHealth();
        if (health.status === "healthy") {
          this.logger.log(`Selected provider: ${provider.getName()} (${provider.getType()})`);
          return provider;
        }
      } catch (error) {
        this.logger.warn(
          `Provider ${provider.getName()} health check failed: ${error.message}`,
        );
      }
    }

    // If no healthy providers, return the first available without health check
    this.logger.warn("No healthy providers found, using first available provider");
    return sortedProviders[0];
  }

  private async selectFallbackProvider(
    request: RouterRequest,
  ): Promise<BaseLLMProvider | null> {
    const availableProviders = Array.from(this.providerInstances.values());
    
    // Sort by fallback priority: Ollama > DeepSeek > Mistral > others
    const fallbackOrder = ["ollama-primary", "deepseek-fallback", "mistral-secondary-fallback"];
    
    const sortedProviders = availableProviders.sort((a, b) => {
      const priorityA = fallbackOrder.indexOf(a.getName());
      const priorityB = fallbackOrder.indexOf(b.getName());
      
      const adjustedPriorityA = priorityA === -1 ? 999 : priorityA;
      const adjustedPriorityB = priorityB === -1 ? 999 : priorityB;
      
      return adjustedPriorityA - adjustedPriorityB;
    });

    // Return first available provider (skip health check to avoid delays)
    for (const provider of sortedProviders) {
      this.logger.log(`Trying fallback provider: ${provider.getName()}`);
      return provider;
    }

    return sortedProviders[0] || null;
  }

  private async checkRateLimit(
    providerName: string,
    request: RouterRequest,
  ): Promise<void> {
    const rateLimiter = this.rateLimiters.get(providerName);
    if (!rateLimiter) return;

    const now = Date.now();

    // Reset counters if time window has passed
    if (now > rateLimiter.resetTime) {
      rateLimiter.requests = 0;
      rateLimiter.tokens = 0;
      rateLimiter.resetTime = now + 60000; // 1 minute window
    }

    // Check limits (these would come from provider config)
    const estimatedTokens = this.estimateTokens(
      request.messages.map((m) => m.content).join(" "),
    );

    if (
      rateLimiter.requests >= 100 ||
      rateLimiter.tokens + estimatedTokens > 10000
    ) {
      throw new Error(`Rate limit exceeded for provider ${providerName}`);
    }

    rateLimiter.requests += 1;
    rateLimiter.tokens += estimatedTokens;
  }

  private updateRateLimit(providerName: string, tokensUsed: number): void {
    let rateLimiter = this.rateLimiters.get(providerName);
    if (!rateLimiter) {
      rateLimiter = { requests: 0, tokens: 0, resetTime: Date.now() + 60000 };
      this.rateLimiters.set(providerName, rateLimiter);
    }

    rateLimiter.tokens = Math.max(
      0,
      rateLimiter.tokens + tokensUsed - this.estimateTokens(""),
    );
  }

  private async trackUsage(
    organizationId: string | null,
    providerName: string,
    usage: { totalTokens: number },
  ): Promise<void> {
    // Skip usage tracking if no organization (e.g., for public endpoints)
    if (!organizationId) {
      return;
    }

    const metric = this.usageMetricRepository.create({
      organizationId,
      type: UsageMetricType.LLM_TOKENS,
      value: usage.totalTokens,
      date: new Date().toISOString().split("T")[0],
      metadata: { provider: providerName },
    });

    await this.usageMetricRepository.save(metric);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    setInterval(async () => {
      for (const [name, provider] of this.providerInstances) {
        try {
          const health = await provider.checkHealth();
          if (health.status !== "healthy") {
            this.logger.warn(
              `Provider ${name} is unhealthy: ${health.details?.message}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Health check failed for provider ${name}: ${error.message}`,
          );
        }
      }
    }, 300000); // 5 minutes
  }
}
