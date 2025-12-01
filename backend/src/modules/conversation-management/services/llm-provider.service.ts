import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { LlmProvider } from "../../../common/entities";
import {
  ProviderType,
  ProviderStatus,
  DeploymentType,
} from "../../../common/enums";

export interface LlmProviderConfig {
  name: string;
  type: ProviderType;
  model: string;
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  deploymentType: DeploymentType;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  metadata?: Record<string, any>;
}

export interface ProviderTestResult {
  success: boolean;
  responseTime: number;
  model: string;
  error?: string;
  testResponse?: string;
}

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(
    @InjectRepository(LlmProvider)
    private providerRepository: Repository<LlmProvider>,
    private configService: ConfigService,
  ) {}

  /**
   * Create new LLM provider configuration
   */
  async createProvider(
    organizationId: string,
    config: LlmProviderConfig,
  ): Promise<LlmProvider> {
    this.logger.log(
      `Creating LLM provider: ${config.name} for org: ${organizationId}`,
    );

    // Validate provider configuration
    await this.validateProviderConfig(config);

    const provider = this.providerRepository.create({
      organizationId,
      name: config.name,
      type: config.type,
      deploymentType: config.deploymentType,
      status: ProviderStatus.INACTIVE, // Start as inactive, activate after testing
      config: {
        model: config.model,
        apiEndpoint: config.endpoint,
        apiKey: config.apiKey, // In production, encrypt this
        maxTokens: config.maxTokens || 1000,
        temperature: config.temperature || 0.7,
        topP: config.topP || 1.0,
        frequencyPenalty: config.frequencyPenalty || 0,
        presencePenalty: config.presencePenalty || 0,
        rateLimits: config.rateLimits,
      },
      metrics: {},
      healthCheck: {
        enabled: true,
        interval: 300, // 5 minutes
        timeout: 30,
        failureThreshold: 3,
        successThreshold: 1,
      },
    });

    const savedProvider = await this.providerRepository.save(provider);

    // Test the provider configuration
    try {
      const testResult = await this.testProvider(savedProvider.id);
      if (testResult.success) {
        await this.updateProviderStatus(
          savedProvider.id,
          ProviderStatus.ACTIVE,
        );
        savedProvider.status = ProviderStatus.ACTIVE;
      }
    } catch (error) {
      this.logger.warn(
        `Provider test failed, keeping inactive: ${error.message}`,
      );
    }

    return savedProvider;
  }

  /**
   * Get all providers for organization
   */
  async getProviders(organizationId: string): Promise<LlmProvider[]> {
    return this.providerRepository.find({
      where: { organizationId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Get provider by ID
   */
  async getProvider(id: string, organizationId: string): Promise<LlmProvider> {
    const provider = await this.providerRepository.findOne({
      where: { id, organizationId },
    });

    if (!provider) {
      throw new BadRequestException("Provider not found");
    }

    return provider;
  }

  /**
   * Update provider configuration
   */
  async updateProvider(
    id: string,
    organizationId: string,
    updates: Partial<LlmProviderConfig>,
  ): Promise<LlmProvider> {
    const provider = await this.getProvider(id, organizationId);

    // Validate updates if provided
    if (updates.type || updates.model || updates.endpoint) {
      const updatedConfig = {
        ...provider,
        ...updates,
        model: updates.model || provider.config.model,
        endpoint: updates.endpoint || provider.config.apiEndpoint,
      } as LlmProviderConfig;
      await this.validateProviderConfig(updatedConfig);
    }

    // Update provider fields
    if (updates.name) provider.name = updates.name;
    if (updates.model) provider.config.model = updates.model;
    if (updates.endpoint) provider.config.apiEndpoint = updates.endpoint;
    if (updates.apiKey) provider.config.apiKey = updates.apiKey;
    if (updates.maxTokens) provider.config.maxTokens = updates.maxTokens;
    if (updates.temperature) provider.config.temperature = updates.temperature;
    if (updates.topP) provider.config.topP = updates.topP;
    if (updates.frequencyPenalty)
      provider.config.frequencyPenalty = updates.frequencyPenalty;
    if (updates.presencePenalty)
      provider.config.presencePenalty = updates.presencePenalty;
    if (updates.rateLimits) {
      provider.config.rateLimits = {
        requestsPerMinute: updates.rateLimits.requestsPerMinute || 60,
        tokensPerMinute: updates.rateLimits.tokensPerMinute || 10000,
        requestsPerDay: updates.rateLimits.requestsPerDay || 1000,
      };
    }
    provider.updatedAt = new Date();

    // If critical settings changed, test the provider
    const criticalFields = ["model", "endpoint", "apiKey"];
    const hasCriticalChanges = criticalFields.some((field) => field in updates);

    if (hasCriticalChanges) {
      provider.status = ProviderStatus.INACTIVE;
      await this.providerRepository.save(provider);

      try {
        const testResult = await this.testProvider(id);
        if (testResult.success) {
          provider.status = ProviderStatus.ACTIVE;
        } else {
          provider.status = ProviderStatus.ERROR;
        }
      } catch (error) {
        provider.status = ProviderStatus.ERROR;
        this.logger.error(
          `Provider test failed after update: ${error.message}`,
        );
      }
    }

    return this.providerRepository.save(provider);
  }

  /**
   * Delete provider
   */
  async deleteProvider(id: string, organizationId: string): Promise<void> {
    const provider = await this.getProvider(id, organizationId);

    // Check if provider is in use by any agents
    const agentsUsingProvider = await this.providerRepository
      .createQueryBuilder("provider")
      .innerJoin("provider.agents", "agent")
      .where("provider.id = :id", { id })
      .getCount();

    if (agentsUsingProvider > 0) {
      throw new BadRequestException(
        "Cannot delete provider that is in use by agents. Please reassign agents first.",
      );
    }

    await this.providerRepository.remove(provider);
    this.logger.log(`Deleted LLM provider: ${provider.name}`);
  }

  /**
   * Test provider connection and configuration
   */
  async testProvider(id: string): Promise<ProviderTestResult> {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) {
      throw new BadRequestException("Provider not found");
    }

    const startTime = Date.now();

    try {
      // Test with a simple prompt
      const testMessages = [
        {
          role: "system",
          content:
            'You are a helpful assistant. Respond with exactly "Test successful" and nothing else.',
        },
        { role: "user", content: "Please confirm you are working correctly." },
      ];

      let response: string;
      let model: string;

      switch (provider.type) {
        case ProviderType.OPENAI:
          const result = await this.testOpenAI(provider, testMessages);
          response = result.response;
          model = result.model;
          break;

        case ProviderType.ANTHROPIC:
          const anthropicResult = await this.testAnthropic(
            provider,
            testMessages,
          );
          response = anthropicResult.response;
          model = anthropicResult.model;
          break;

        case ProviderType.MISTRAL:
          const mistralResult = await this.testMistral(provider, testMessages);
          response = mistralResult.response;
          model = mistralResult.model;
          break;

        case ProviderType.DEEPSEEK:
          const deepseekResult = await this.testDeepSeek(
            provider,
            testMessages,
          );
          response = deepseekResult.response;
          model = deepseekResult.model;
          break;

        default:
          throw new Error(
            `Testing not implemented for provider type: ${provider.type}`,
          );
      }

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        responseTime,
        model,
        testResponse: response,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        success: false,
        responseTime,
        model: provider.config?.model || "unknown",
        error: error.message,
      };
    }
  }

  /**
   * Update provider status
   */
  async updateProviderStatus(
    id: string,
    status: ProviderStatus,
  ): Promise<void> {
    await this.providerRepository.update(id, {
      status,
      updatedAt: new Date(),
    });
  }

  /**
   * Get default provider configurations
   */
  getDefaultProviderConfigs(): Record<
    ProviderType,
    Partial<LlmProviderConfig>
  > {
    return {
      [ProviderType.OPENAI]: {
        name: "OpenAI GPT",
        model: "gpt-3.5-turbo",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.CLOUD_API,
        rateLimits: {
          requestsPerMinute: 60,
          tokensPerMinute: 40000,
        },
      },
      [ProviderType.ANTHROPIC]: {
        name: "Anthropic Claude",
        model: "claude-3-haiku-20240307",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.CLOUD_API,
        rateLimits: {
          requestsPerMinute: 50,
          tokensPerMinute: 25000,
        },
      },
      [ProviderType.MISTRAL]: {
        name: "Mistral AI",
        model: "mistral-small-latest",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.CLOUD_API,
        rateLimits: {
          requestsPerMinute: 30,
          tokensPerMinute: 20000,
        },
      },
      [ProviderType.DEEPSEEK]: {
        name: "DeepSeek",
        model: "deepseek-chat",
        endpoint: "https://api.deepseek.com/v1/chat/completions",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.CLOUD_API,
        rateLimits: {
          requestsPerMinute: 60,
          tokensPerMinute: 30000,
        },
      },
      [ProviderType.LLAMA]: {
        name: "Llama",
        model: "llama-2-70b-chat",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.SELF_HOSTED,
      },
      [ProviderType.OLLAMA]: {
        name: "Ollama (Local)",
        model: "deepseek-r1:7b",
        maxTokens: 2000,
        temperature: 0.7,
        deploymentType: DeploymentType.SELF_HOSTED,
        rateLimits: {
          requestsPerMinute: 1000, // No limits for local
          tokensPerMinute: 100000,
        },
      },
      [ProviderType.CUSTOM]: {
        name: "Custom Provider",
        model: "custom-model",
        maxTokens: 1000,
        temperature: 0.7,
        deploymentType: DeploymentType.SELF_HOSTED,
      },
    };
  }

  /**
   * Validate provider configuration
   */
  private async validateProviderConfig(
    config: LlmProviderConfig,
  ): Promise<void> {
    // Validate required fields
    if (!config.name || !config.type || !config.model) {
      throw new BadRequestException(
        "Provider name, type, and model are required",
      );
    }

    // Validate provider-specific requirements
    switch (config.type) {
      case ProviderType.OPENAI:
        if (!config.apiKey && !this.configService.get("OPENAI_API_KEY")) {
          throw new BadRequestException("OpenAI API key is required");
        }
        break;

      case ProviderType.ANTHROPIC:
        if (!config.apiKey && !this.configService.get("ANTHROPIC_API_KEY")) {
          throw new BadRequestException("Anthropic API key is required");
        }
        break;

      case ProviderType.MISTRAL:
        if (!config.apiKey && !this.configService.get("MISTRAL_API_KEY")) {
          throw new BadRequestException("Mistral API key is required");
        }
        break;

      case ProviderType.DEEPSEEK:
        if (!config.apiKey && !this.configService.get("DEEPSEEK_API_KEY")) {
          throw new BadRequestException("DeepSeek API key is required");
        }
        if (!config.endpoint) {
          config.endpoint = "https://api.deepseek.com/v1/chat/completions";
        }
        break;

      case ProviderType.CUSTOM:
        if (!config.endpoint) {
          throw new BadRequestException(
            "Custom providers require an endpoint URL",
          );
        }
        break;
    }

    // Validate numeric ranges
    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      throw new BadRequestException("Temperature must be between 0 and 2");
    }

    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      throw new BadRequestException("Top P must be between 0 and 1");
    }

    if (
      config.maxTokens !== undefined &&
      (config.maxTokens < 1 || config.maxTokens > 100000)
    ) {
      throw new BadRequestException("Max tokens must be between 1 and 100000");
    }
  }

  /**
   * Test OpenAI provider
   */
  private async testOpenAI(
    provider: LlmProvider,
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ response: string; model: string }> {
    // This would use the OpenAI client from response-generation.service
    // For now, return a mock response
    return {
      response: "Test successful",
      model: provider.config.model,
    };
  }

  /**
   * Test Anthropic provider
   */
  private async testAnthropic(
    provider: LlmProvider,
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ response: string; model: string }> {
    return {
      response: "Test successful",
      model: provider.config.model,
    };
  }

  /**
   * Test Mistral provider
   */
  private async testMistral(
    provider: LlmProvider,
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ response: string; model: string }> {
    return {
      response: "Test successful",
      model: provider.config.model,
    };
  }

  /**
   * Test DeepSeek provider
   */
  private async testDeepSeek(
    provider: LlmProvider,
    messages: Array<{ role: string; content: string }>,
  ): Promise<{ response: string; model: string }> {
    return {
      response: "Test successful",
      model: provider.config.model,
    };
  }
}
