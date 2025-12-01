import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import {
  BaseLLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  LLMProviderConfig,
  LLMProviderHealthStatus,
} from "../interfaces/llm-provider.interface";

@Injectable()
export class OpenAIProvider extends BaseLLMProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private client: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config, "OpenAI GPT", "openai");

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiEndpoint || "https://api.openai.com/v1",
      timeout: config.timeout || 30000,
    });
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      const payload = this.buildOpenAIPayload(request);

      const response = (await this.client.chat.completions.create(
        payload,
      )) as any;

      const responseTime = Date.now() - startTime;

      return this.parseOpenAIResponse(response, responseTime);
    } catch (error) {
      this.logger.error(`OpenAI generation failed: ${error.message}`);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }

  async *generateStreamResponse(
    request: LLMRequest,
  ): AsyncGenerator<LLMStreamResponse> {
    try {
      const payload = { ...this.buildOpenAIPayload(request), stream: true };

      const stream = (await this.client.chat.completions.create(
        payload,
      )) as any;

      for await (const chunk of stream) {
        yield this.parseOpenAIStreamResponse(chunk);
      }
    } catch (error) {
      this.logger.error(`OpenAI stream generation failed: ${error.message}`);
      throw new Error(`OpenAI stream generation failed: ${error.message}`);
    }
  }

  async checkHealth(): Promise<LLMProviderHealthStatus> {
    const startTime = Date.now();

    try {
      // Simple health check with minimal request
      await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1,
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
    const inputTokens = this.estimateTokens(
      request.messages.map((m) => m.content).join(" "),
    );
    const outputTokens = request.maxTokens || 1000;

    // GPT-4 pricing (adjust based on actual model)
    let inputCostPerToken = 0.00003; // $0.03 per 1K tokens
    let outputCostPerToken = 0.00006; // $0.06 per 1K tokens

    // Adjust pricing based on model
    if (this.config.model.includes("gpt-3.5")) {
      inputCostPerToken = 0.0015 / 1000; // $0.0015 per 1K tokens
      outputCostPerToken = 0.002 / 1000; // $0.002 per 1K tokens
    } else if (this.config.model.includes("gpt-4o")) {
      inputCostPerToken = 0.005 / 1000; // $0.005 per 1K tokens
      outputCostPerToken = 0.015 / 1000; // $0.015 per 1K tokens
    }

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

  private buildOpenAIPayload(
    request: LLMRequest,
  ): OpenAI.Chat.Completions.ChatCompletionCreateParams {
    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.config.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.maxTokens || this.config.maxTokens || 2000,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      top_p: request.topP ?? this.config.topP ?? 0.9,
      frequency_penalty:
        request.frequencyPenalty ?? this.config.frequencyPenalty ?? 0,
      presence_penalty:
        request.presencePenalty ?? this.config.presencePenalty ?? 0,
    };

    if (request.functions) {
      payload.functions = request.functions;
      payload.function_call = request.functionCall || "auto";
    }

    return payload;
  }

  private parseOpenAIResponse(
    apiResponse: OpenAI.Chat.Completions.ChatCompletion,
    responseTime: number,
  ): LLMResponse {
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
      functionCall: choice?.message?.function_call
        ? {
            name: choice.message.function_call.name,
            arguments: choice.message.function_call.arguments,
          }
        : undefined,
      metadata: {
        responseTime,
        provider: "openai",
        confidence: 0.95, // OpenAI models are generally high confidence
      },
    };
  }

  private parseOpenAIStreamResponse(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  ): LLMStreamResponse {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    return {
      id: chunk.id,
      delta: {
        content: delta?.content || undefined,
        functionCall: delta?.function_call
          ? {
              name: delta.function_call.name,
              arguments: delta.function_call.arguments,
            }
          : undefined,
      },
      finishReason: choice?.finish_reason
        ? this.mapFinishReason(choice.finish_reason)
        : undefined,
      usage: chunk.usage
        ? {
            promptTokens: chunk.usage.prompt_tokens || 0,
            completionTokens: chunk.usage.completion_tokens || 0,
            totalTokens: chunk.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  private mapFinishReason(
    reason: string | null,
  ): "stop" | "length" | "function_call" | "content_filter" {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "function_call":
        return "function_call";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }

  private estimateTokens(text: string): number {
    // More accurate estimation for OpenAI models
    // GPT models use ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  // Additional methods for OpenAI-specific features
  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data.map((model) => model.id);
    } catch (error) {
      this.logger.error(`Failed to list OpenAI models: ${error.message}`);
      return [];
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings: ${error.message}`);
      throw error;
    }
  }
}
