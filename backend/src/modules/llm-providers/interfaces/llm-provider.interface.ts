export interface LLMRequest {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  functions?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  functionCall?: "auto" | "none" | { name: string };
}

export interface LLMResponse {
  id: string;
  content: string;
  finishReason: "stop" | "length" | "function_call" | "content_filter";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  created: number;
  functionCall?: {
    name: string;
    arguments: string;
  };
  metadata?: {
    responseTime: number;
    provider: string;
    confidence?: number;
  };
}

export interface LLMStreamResponse {
  id: string;
  delta: {
    content?: string;
    functionCall?: {
      name?: string;
      arguments?: string;
    };
  };
  finishReason?: "stop" | "length" | "function_call" | "content_filter";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProviderConfig {
  apiEndpoint?: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;
  retryAttempts?: number;
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay: number;
  };
  supportedFeatures?: {
    streaming: boolean;
    functionCalling: boolean;
    imageAnalysis: boolean;
    codeGeneration: boolean;
  };
}

export interface LLMProviderHealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  responseTime: number;
  lastCheck: Date;
  errorRate: number;
  uptime: number;
  details?: {
    message?: string;
    errors?: string[];
  };
}

export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;
  protected name: string;
  protected type: string;

  constructor(config: LLMProviderConfig, name: string, type: string) {
    this.config = config;
    this.name = name;
    this.type = type;
  }

  abstract generateResponse(request: LLMRequest): Promise<LLMResponse>;
  abstract generateStreamResponse(
    request: LLMRequest,
  ): AsyncGenerator<LLMStreamResponse>;
  abstract checkHealth(): Promise<LLMProviderHealthStatus>;
  abstract estimateCost(request: LLMRequest): Promise<number>;
  abstract validateConfig(): Promise<boolean>;

  getName(): string {
    return this.name;
  }

  getType(): string {
    return this.type;
  }

  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
