import {
  BaseLLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  LLMProviderConfig,
  LLMProviderHealthStatus,
} from "../interfaces/llm-provider.interface";
import axios, { AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";

export interface OllamaConfig extends LLMProviderConfig {
  apiEndpoint?: string;
  model: string;
  timeout?: number;
}

export class OllamaProvider extends BaseLLMProvider {
  private httpClient: AxiosInstance;

  constructor(config: OllamaConfig) {
    super(config, `ollama-${config.model}`, "ollama");

    this.httpClient = axios.create({
      baseURL: config.apiEndpoint || "http://localhost:11434",
      timeout: config.timeout || 60000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Format messages for Ollama
      const prompt = this.formatMessagesForOllama(request.messages);

      const response = await this.httpClient.post("/api/generate", {
        model: this.config.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          num_predict: request.maxTokens ?? this.config.maxTokens ?? 2000,
          top_p: request.topP ?? this.config.topP ?? 1.0,
          frequency_penalty:
            request.frequencyPenalty ?? this.config.frequencyPenalty ?? 0,
          presence_penalty:
            request.presencePenalty ?? this.config.presencePenalty ?? 0,
        },
      });

      const responseTime = Date.now() - startTime;
      const rawContent = response.data.response || "";

      // Clean DeepSeek R1 thinking process from response
      const content = this.cleanDeepSeekResponse(rawContent);

      // Estimate tokens (Ollama doesn't always provide this info)
      const promptTokens = this.estimateTokens(prompt);
      const completionTokens = this.estimateTokens(content);

      return {
        id: requestId,
        content,
        finishReason: response.data.done ? "stop" : "length",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        model: this.config.model,
        created: Math.floor(startTime / 1000),
        metadata: {
          responseTime,
          provider: "ollama",
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      throw new Error(
        `Ollama generation failed after ${responseTime}ms: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  async *generateStreamResponse(
    request: LLMRequest,
  ): AsyncGenerator<LLMStreamResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      // Format messages for Ollama
      const prompt = this.formatMessagesForOllama(request.messages);

      const response = await this.httpClient.post(
        "/api/generate",
        {
          model: this.config.model,
          prompt: prompt,
          stream: true,
          options: {
            temperature: request.temperature ?? this.config.temperature ?? 0.7,
            num_predict: request.maxTokens ?? this.config.maxTokens ?? 2000,
            top_p: request.topP ?? this.config.topP ?? 1.0,
            frequency_penalty:
              request.frequencyPenalty ?? this.config.frequencyPenalty ?? 0,
            presence_penalty:
              request.presencePenalty ?? this.config.presencePenalty ?? 0,
          },
        },
        {
          responseType: "stream",
        },
      );

      let buffer = "";
      let totalTokens = 0;

      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);

              if (parsed.response) {
                totalTokens += this.estimateTokens(parsed.response);

                yield {
                  id: requestId,
                  delta: { content: parsed.response },
                  finishReason: parsed.done ? "stop" : undefined,
                  usage: parsed.done
                    ? {
                        promptTokens: this.estimateTokens(prompt),
                        completionTokens: totalTokens,
                        totalTokens: this.estimateTokens(prompt) + totalTokens,
                      }
                    : undefined,
                };
              }

              if (parsed.done) {
                return;
              }
            } catch (parseError) {
              // Skip malformed JSON lines
              continue;
            }
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Ollama stream generation failed: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  async checkHealth(): Promise<LLMProviderHealthStatus> {
    const startTime = Date.now();

    try {
      // Check if Ollama service is running
      const response = await this.httpClient.get("/api/version");
      const responseTime = Date.now() - startTime;

      // Test model availability
      const modelResponse = await this.httpClient.post("/api/generate", {
        model: this.config.model,
        prompt: "Hello",
        stream: false,
        options: { num_predict: 1 },
      });

      return {
        status: "healthy",
        responseTime,
        lastCheck: new Date(),
        errorRate: 0,
        uptime: 1,
        details: {
          message: `Ollama ${response.data.version} - Model ${this.config.model} available`,
        },
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
          message: error.response?.data?.error || error.message,
          errors: [error.message],
        },
      };
    }
  }

  async estimateCost(request: LLMRequest): Promise<number> {
    // Ollama is free when self-hosted
    return 0;
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Check if API endpoint is reachable
      await this.httpClient.get("/api/version", { timeout: 5000 });

      // Check if model is available
      const response = await this.httpClient.post(
        "/api/generate",
        {
          model: this.config.model,
          prompt: "test",
          stream: false,
          options: { num_predict: 1 },
        },
        { timeout: 10000 },
      );

      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private formatMessagesForOllama(
    messages: Array<{ role: string; content: string }>,
  ): string {
    // Convert OpenAI-style messages to a single prompt for Ollama
    const formattedMessages = messages.map((msg) => {
      switch (msg.role) {
        case "system":
          return `System: ${msg.content}`;
        case "user":
          return `User: ${msg.content}`;
        case "assistant":
          return `Assistant: ${msg.content}`;
        default:
          return msg.content;
      }
    });

    const prompt = formattedMessages.join("\n\n") + "\n\nAssistant:";

    // Add specific instruction for AI models to avoid showing thinking process
    return `CRITICAL INSTRUCTIONS:
- Respond ONLY with your final answer in the user's language
- Do NOT show your thinking process, reasoning, or analysis
- Do NOT include phrases like "Alright, let me figure out", "I see that", "Looking at", "First, I", etc.
- Do NOT explain what the user said or translate their message
- Do NOT include <think> tags or meta-commentary
- Answer directly and helpfully in the same language as the user's question

${prompt}`;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private cleanDeepSeekResponse(response: string): string {
    // Remove DeepSeek R1 thinking process and AI reasoning text
    let cleaned = response;

    // Remove <think>...</think> blocks (including multiline)
    cleaned = cleaned.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "");

    // Remove any standalone thinking markers
    cleaned = cleaned.replace(/^\s*<think>.*$/gim, "");
    cleaned = cleaned.replace(/^\s*<\/think>.*$/gim, "");

    // Remove English AI reasoning patterns that appear in the screenshot
    const reasoningPatterns = [
      // Remove text that starts with "Alright, let me try to figure out"
      /^Alright,?\s+let me try to figure out.*$/gim,
      // Remove text that explains what the user said in English
      /^.*The user just said.*which means.*$/gim,
      // Remove analysis of conversation history
      /^.*Looking at the history.*$/gim,
      // Remove meta-commentary about language detection
      /^.*they've been using \w+, so I should respond in that language.*$/gim,
      // Remove system analysis text
      /^First,?\s+I see that the system provided.*$/gim,
      // Remove reasoning about what to address
      /^I need to address.*$/gim,
      // Remove any sentence starting with reasoning keywords
      /^(First|Then|Next|Also|Additionally|Furthermore|Moreover|I think|I see|I notice|Looking at|Based on|From the|It seems|It appears).*$/gim,
      // Remove sentences that mention "the guide" or "system provided"
      /^.*the (guide|system provided|system).*$/gim,
      // Remove meta-analysis of the request
      /^.*They're probably looking for.*$/gim,
      // Remove reasoning about inference
      /^.*From the guide, I can infer.*$/gim,
    ];

    // Apply all reasoning pattern removals
    reasoningPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, "");
    });

    // Remove paragraphs that are purely reasoning (contain reasoning keywords but no useful content)
    const lines = cleaned.split("\n");
    const filteredLines = lines.filter((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return true; // Keep empty lines

      // Skip lines that are purely meta-commentary in English
      const isReasoningLine =
        /^(Alright|Looking|First|I see|I need|I think|Based on|From|It seems|The user|They're|This|That)/.test(
          trimmedLine,
        );
      return !isReasoningLine;
    });

    cleaned = filteredLines.join("\n");

    // Clean up extra whitespace and newlines
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");
    cleaned = cleaned.trim();

    // If the response is empty after cleaning, provide a fallback
    if (!cleaned || cleaned.length < 3) {
      return "Je suis désolé, je n'ai pas pu traiter votre demande correctement. Pouvez-vous reformuler ?";
    }

    return cleaned;
  }
}
