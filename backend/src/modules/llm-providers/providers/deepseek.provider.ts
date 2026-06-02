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
export class DeepSeekProvider extends BaseLLMProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);
  private httpClient: AxiosInstance;

  constructor(config: LLMProviderConfig) {
    super(config, `DeepSeek (${config.model || 'v4-flash'})`, "deepseek");

    this.httpClient = axios.create({
      baseURL: config.apiEndpoint,
      timeout: config.timeout || 30000,
      headers: {
        "Content-Type": "application/json",
        Authorization: config.apiKey ? `Bearer ${config.apiKey}` : undefined,
      },
    });

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use((config) => {
      this.logger.debug(
        `Making request to DeepSeek: ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(`DeepSeek API error: ${error.message}`);
        throw error;
      },
    );
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const payload = this.buildRequestPayload(request);

        const response = await this.httpClient.post(
          "/v1/chat/completions",
          payload,
        );

        const responseTime = Date.now() - startTime;

        return this.parseResponse(response.data, responseTime);
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const errorBody = error.response?.data;
        const isRateLimited = status === 429 || error.message?.includes('rate limit');

        // Log detailed error for debugging
        if (errorBody) {
          this.logger.error(`DeepSeek API error ${status}: ${JSON.stringify(errorBody)}`);
        }

        // Don't retry on 400 (bad request) - it won't succeed
        if (status === 400) {
          const detail = errorBody?.error?.message || error.message;
          throw new Error(`DeepSeek generation failed (400): ${detail}`);
        }

        if (isRateLimited && attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const waitTime = Math.pow(2, attempt) * 1000;
          this.logger.warn(`DeepSeek rate limited, waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        this.logger.error(`DeepSeek generation failed: ${error.message}`);
        throw new Error(`DeepSeek generation failed: ${error.message}`);
      }
    }

    throw new Error(`DeepSeek generation failed after ${maxRetries} retries: ${lastError?.message}`);
  }

  async *generateStreamResponse(
    request: LLMRequest,
  ): AsyncGenerator<LLMStreamResponse> {
    try {
      const payload = { ...this.buildRequestPayload(request), stream: true };

      const response = await this.httpClient.post(
        "/v1/chat/completions",
        payload,
        {
          responseType: "stream",
        },
      );

      // Parse Server-Sent Events stream
      const lines = response.data.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);

          if (data === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(data);
            yield this.parseStreamResponse(parsed);
          } catch (e) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    } catch (error) {
      this.logger.error(`DeepSeek stream generation failed: ${error.message}`);
      throw new Error(`DeepSeek stream generation failed: ${error.message}`);
    }
  }

  async checkHealth(): Promise<LLMProviderHealthStatus> {
    const startTime = Date.now();

    try {
      // Simple health check with minimal request and timeout
      await Promise.race([
        this.httpClient.post("/v1/chat/completions", {
          model: this.config.model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 1,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
        )
      ]);

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
      const isNetworkError = error.message?.includes('EAI_AGAIN') || 
                            error.message?.includes('ECONNREFUSED') ||
                            error.message?.includes('ENOTFOUND');

      this.logger.warn(`DeepSeek health check failed: ${error.message} (network: ${isNetworkError})`);

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
    // Estimate token usage
    const inputTokens = this.estimateTokens(
      request.messages.map((m) => m.content).join(" "),
    );
    const outputTokens = request.maxTokens || 1000;

    // DeepSeek-R1 pricing (example - adjust based on actual pricing)
    const inputCostPerToken = 0.00001; // $0.01 per 1K tokens
    const outputCostPerToken = 0.00002; // $0.02 per 1K tokens

    return inputTokens * inputCostPerToken + outputTokens * outputCostPerToken;
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.checkHealth();
      return true;
    } catch {
      return false;
    }
  }

  private buildRequestPayload(request: LLMRequest): any {
    const payload: any = {
      model: this.config.model,
      messages: request.messages.map((msg: any) => {
        const m: any = { role: msg.role, content: msg.content };
        if (msg.name) m.name = msg.name;
        if (msg.tool_calls) m.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
        return m;
      }),
      max_tokens: request.maxTokens || this.config.maxTokens || 2000,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      top_p: request.topP ?? this.config.topP ?? 0.9,
      frequency_penalty:
        request.frequencyPenalty ?? this.config.frequencyPenalty ?? 0,
      presence_penalty:
        request.presencePenalty ?? this.config.presencePenalty ?? 0,
      stream: request.stream || false,
    };

    // Disable thinking mode for V4 models (not needed for chat, causes errors with tool calls)
    if (this.config.model?.includes('v4')) {
      payload.thinking = { type: 'disabled' };
    }

    // Use modern 'tools' format (DeepSeek API is OpenAI-compatible)
    if (request.functions?.length) {
      payload.tools = request.functions.map(fn => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));
      if (request.functionCall === 'none') {
        payload.tool_choice = 'none';
      } else if (request.functionCall === 'auto' || !request.functionCall) {
        payload.tool_choice = 'auto';
      } else if (typeof request.functionCall === 'object' && request.functionCall.name) {
        payload.tool_choice = { type: 'function', function: { name: request.functionCall.name } };
      }
    }

    return payload;
  }

  private parseResponse(apiResponse: any, responseTime: number): LLMResponse {
    const choice = apiResponse.choices?.[0];

    return {
      id: apiResponse.id,
      content: choice?.message?.content || "",
      finishReason: this.mapFinishReason(choice?.finish_reason),
      usage: {
        promptTokens: apiResponse.usage?.prompt_tokens || 0,
        completionTokens: apiResponse.usage?.completion_tokens || 0,
        totalTokens: apiResponse.usage?.total_tokens || 0,
      },
      model: apiResponse.model,
      created: apiResponse.created,
      functionCall: choice?.message?.tool_calls?.[0]?.function
        ? {
            name: choice.message.tool_calls[0].function.name,
            arguments: choice.message.tool_calls[0].function.arguments,
          }
        : undefined,
      metadata: {
        responseTime,
        provider: "deepseek",
        confidence: 0.9, // DeepSeek-R1 is generally high confidence
      },
    };
  }

  private parseStreamResponse(apiResponse: any): LLMStreamResponse {
    const choice = apiResponse.choices?.[0];
    const delta = choice?.delta || {};

    return {
      id: apiResponse.id,
      delta: {
        content: delta.content,
        functionCall: delta.tool_calls?.[0]?.function
          ? {
              name: delta.tool_calls[0].function.name,
              arguments: delta.tool_calls[0].function.arguments,
            }
          : undefined,
      },
      finishReason: choice?.finish_reason
        ? this.mapFinishReason(choice.finish_reason)
        : undefined,
      usage: apiResponse.usage
        ? {
            promptTokens: apiResponse.usage.prompt_tokens || 0,
            completionTokens: apiResponse.usage.completion_tokens || 0,
            totalTokens: apiResponse.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  private mapFinishReason(
    reason: string,
  ): "stop" | "length" | "function_call" | "content_filter" {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "function_call":
      case "tool_calls":
        return "function_call";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for most models
    return Math.ceil(text.length / 4);
  }
}
