import {
  BaseLLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamResponse,
  LLMProviderConfig,
  LLMProviderHealthStatus,
} from '../interfaces/llm-provider.interface';
import { Logger } from '@nestjs/common';

export interface RunPodConfig extends LLMProviderConfig {
  apiKey: string;
  endpointId: string;
  apiEndpoint?: string;
}

export class RunPodProvider extends BaseLLMProvider {
  private readonly logger = new Logger(RunPodProvider.name);
  private runpodConfig: RunPodConfig;

  constructor(config: RunPodConfig) {
    super({
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://api.runpod.ai/v2',
    }, `runpod-${config.model}`, 'runpod');
    
    this.runpodConfig = {
      ...config,
      apiEndpoint: config.apiEndpoint || 'https://api.runpod.ai/v2',
    };
  }


  async checkHealth(): Promise<LLMProviderHealthStatus> {
    // RunPod Serverless doesn't have a health endpoint, assume healthy if credentials exist
    try {
      if (this.runpodConfig.apiKey && this.runpodConfig.endpointId) {
        return {
          status: 'healthy',
          responseTime: 0,
          lastCheck: new Date(),
          errorRate: 0,
          uptime: 100
        };
      }

      return {
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date(),
        errorRate: 100,
        uptime: 0,
        details: { message: 'Missing RunPod credentials' },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: new Date(),
        errorRate: 100,
        uptime: 0,
        details: { message: error.message },
      };
    }
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    try {
      const messages = request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const payload = {
        input: {
          messages,
          max_tokens: request.maxTokens || this.runpodConfig.maxTokens || 2048,
          temperature: request.temperature ?? this.runpodConfig.temperature ?? 0.7,
          stream: false,
        },
      };

      this.logger.debug(`RunPod request to ${this.runpodConfig.endpointId}`);

      const response = await fetch(
        `${this.runpodConfig.apiEndpoint}/${this.runpodConfig.endpointId}/run`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.runpodConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.runpodConfig.timeout || 30000),
        }
      );

      if (!response.ok) {
        throw new Error(
          `RunPod API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      // RunPod serverless response structure
      if (data.status === 'COMPLETED' && data.output) {
        const content = data.output.choices?.[0]?.message?.content || 
                      data.output.response || 
                      data.output.text ||
                      data.output;

        return {
          id: data.id || 'runpod-' + Date.now(),
          content: typeof content === 'string' ? content : JSON.stringify(content),
          finishReason: 'stop',
          usage: {
            totalTokens: data.output.usage?.total_tokens || 0,
            promptTokens: data.output.usage?.prompt_tokens || 0,
            completionTokens: data.output.usage?.completion_tokens || 0,
          },
          model: this.config.model,
          created: Math.floor(Date.now() / 1000),
          metadata: {
            responseTime: data.executionTime || 0,
            provider: 'runpod',
          },
        };
      }

      // If job is still running, poll for completion
      if (data.status === 'IN_PROGRESS' || data.status === 'IN_QUEUE') {
        return this.pollForResult(data.id);
      }

      throw new Error(`RunPod job failed with status: ${data.status}`);

    } catch (error) {
      this.logger.error(`RunPod generation failed: ${error.message}`);
      throw error;
    }
  }

  async *generateStreamResponse(
    request: LLMRequest
  ): AsyncGenerator<LLMStreamResponse> {
    // RunPod ne supporte pas toujours le streaming, on fait du chunking simulé
    const response = await this.generateResponse(request);
    const chunks = this.chunkResponse(response.content);
    
    for (const chunk of chunks) {
      yield {
        id: 'runpod-stream-' + Date.now(),
        delta: { content: chunk },
      };
      
      // Petit délai pour simuler le streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private chunkResponse(content: string): string[] {
    const words = content.split(' ');
    const chunks: string[] = [];
    const wordsPerChunk = 3;
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunk = words.slice(i, i + wordsPerChunk).join(' ');
      chunks.push(chunk + (i + wordsPerChunk < words.length ? ' ' : ''));
    }
    
    return chunks;
  }

  async estimateCost(request: LLMRequest): Promise<number> {
    // RunPod pricing varies by instance type, return estimated cost
    const tokensEstimate = request.messages.reduce((acc, msg) => acc + msg.content.length / 4, 0);
    return tokensEstimate * 0.0001; // Rough estimate
  }

  async validateConfig(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  private async pollForResult(jobId: string, maxAttempts: number = 30): Promise<LLMResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(
          `${this.runpodConfig.apiEndpoint}/${this.runpodConfig.endpointId}/status/${jobId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.runpodConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to check job status: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.status === 'COMPLETED' && data.output) {
          const content = data.output.choices?.[0]?.message?.content || 
                        data.output.response || 
                        data.output.text ||
                        data.output;

          return {
            id: jobId,
            content: typeof content === 'string' ? content : JSON.stringify(content),
            finishReason: 'stop',
            usage: {
              totalTokens: data.output.usage?.total_tokens || 0,
              promptTokens: data.output.usage?.prompt_tokens || 0,
              completionTokens: data.output.usage?.completion_tokens || 0,
            },
            model: this.runpodConfig.model,
            created: Math.floor(Date.now() / 1000),
            metadata: {
              responseTime: data.executionTime || 0,
              provider: 'runpod',
            },
          };
        }

        if (data.status === 'FAILED') {
          throw new Error(`RunPod job failed: ${data.error}`);
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('RunPod job polling timeout');
  }
}