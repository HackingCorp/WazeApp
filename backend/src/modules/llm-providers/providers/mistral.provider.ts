import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import {
  BaseLLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  LLMProviderConfig,
  LLMProviderHealthStatus,
} from "../interfaces/llm-provider.interface";

@Injectable()
export class MistralProvider extends BaseLLMProvider {
  private readonly logger = new Logger(MistralProvider.name);
  private httpClient: AxiosInstance;

  constructor(config: LLMProviderConfig) {
    super(config, "Mistral-7B", "mistral");

    this.httpClient = axios.create({
      baseURL: config.apiEndpoint, // Ollama endpoint: http://localhost:11434
      timeout: config.timeout || 60000, // Longer timeout for local models
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.httpClient.interceptors.request.use((config) => {
      this.logger.debug(
        `Making request to Mistral: ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(`Mistral API error: ${error.message}`);
        throw error;
      },
    );
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const payload = this.buildOllamaPayload(request);

      const response = await this.httpClient.post("/api/chat", payload);

      const responseTime = Date.now() - startTime;

      return this.parseOllamaResponse(response.data, responseTime);
    } catch (error) {
      this.logger.error(`Mistral generation failed: ${error.message}`);
      throw new Error(`Mistral generation failed: ${error.message}`);
    }
  }

  async *generateStreamResponse(
    request: LLMRequest,
  ): AsyncGenerator<LLMStreamResponse> {
    try {
      const payload = { ...this.buildOllamaPayload(request), stream: true };

      const response = await this.httpClient.post("/api/chat", payload, {
        responseType: "stream",
      });

      // Parse JSONL stream from Ollama
      const lines = response.data.toString().split("\n");

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            yield this.parseOllamaStreamResponse(parsed);
          } catch (e) {
            continue;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Mistral stream generation failed: ${error.message}`);
      throw new Error(`Mistral stream generation failed: ${error.message}`);
    }
  }

  async checkHealth(): Promise<LLMProviderHealthStatus> {
    const startTime = Date.now();

    try {
      // Check if Ollama is running and model is loaded
      await this.httpClient.get("/api/tags");

      // Test a simple generation
      await this.httpClient.post("/api/chat", {
        model: this.config.model,
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
        options: { num_predict: 1 },
      });

      const responseTime = Date.now() - startTime;

      return {
        status: "healthy",
        responseTime,
        lastCheck: new Date(),
        errorRate: 0,
        uptime: 1,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: "unhealthy",
        responseTime,
        lastCheck: new Date(),
        errorRate: 1,
        uptime: 0,
        details: {
          message: error.message,
          errors: [error.toString()],
        },
      };
    }
  }

  async estimateCost(request: LLMRequest): Promise<number> {
    // Self-hosted models have no direct cost per token
    // But we can estimate compute cost based on token usage
    const inputTokens = this.estimateTokens(
      request.messages.map((m) => m.content).join(" "),
    );
    const outputTokens = request.maxTokens || 1000;

    // Estimate compute cost (example: $0.001 per 1K tokens for self-hosted)
    const costPerToken = 0.000001;

    return (inputTokens + outputTokens) * costPerToken;
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Check if model exists in Ollama
      const response = await this.httpClient.get("/api/tags");
      const models = response.data.models || [];

      return models.some((model: any) => model.name === this.config.model);
    } catch {
      return false;
    }
  }

  private buildOllamaPayload(request: LLMRequest): any {
    return {
      model: this.config.model,
      messages: request.messages,
      stream: request.stream || false,
      options: {
        num_predict: request.maxTokens || this.config.maxTokens || 2000,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        top_p: request.topP ?? this.config.topP ?? 0.9,
        frequency_penalty:
          request.frequencyPenalty ?? this.config.frequencyPenalty ?? 0,
        presence_penalty:
          request.presencePenalty ?? this.config.presencePenalty ?? 0,
      },
    };
  }

  private parseOllamaResponse(
    apiResponse: any,
    responseTime: number,
  ): LLMResponse {
    return {
      id: `mistral-${Date.now()}`,
      content: apiResponse.message?.content || "",
      finishReason: apiResponse.done ? "stop" : "length",
      usage: {
        promptTokens: apiResponse.prompt_eval_count || 0,
        completionTokens: apiResponse.eval_count || 0,
        totalTokens:
          (apiResponse.prompt_eval_count || 0) + (apiResponse.eval_count || 0),
      },
      model: this.config.model,
      created: Math.floor(Date.now() / 1000),
      metadata: {
        responseTime,
        provider: "mistral",
        confidence: 0.85, // Mistral 7B is good but not as reliable as larger models
      },
    };
  }

  private parseOllamaStreamResponse(apiResponse: any): LLMStreamResponse {
    return {
      id: `mistral-${Date.now()}`,
      delta: {
        content: apiResponse.message?.content || "",
      },
      finishReason: apiResponse.done ? "stop" : undefined,
      usage: apiResponse.done
        ? {
            promptTokens: apiResponse.prompt_eval_count || 0,
            completionTokens: apiResponse.eval_count || 0,
            totalTokens:
              (apiResponse.prompt_eval_count || 0) +
              (apiResponse.eval_count || 0),
          }
        : undefined,
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // Additional method to pull/install model if needed
  async pullModel(): Promise<boolean> {
    try {
      this.logger.log(`Pulling Mistral model: ${this.config.model}`);

      const response = await this.httpClient.post("/api/pull", {
        name: this.config.model,
        stream: false,
      });

      return response.status === 200;
    } catch (error) {
      this.logger.error(`Failed to pull Mistral model: ${error.message}`);
      return false;
    }
  }
}
