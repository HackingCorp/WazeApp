import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionContext } from './interfaces/tool.interface';
import { LLMRouterService } from '../llm-providers/llm-router.service';
import { AiAgent } from '@/common/entities';
import { LLMResponse } from '../llm-providers/interfaces/llm-provider.interface';

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, any>;
  result: any;
  durationMs: number;
}

export interface ToolExecutionResult {
  finalResponse: LLMResponse;
  toolCalls: ToolCallRecord[];
  totalTokensUsed: number;
}

const MAX_TOOL_ITERATIONS = 5;

@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly llmRouterService: LLMRouterService,
  ) {}

  async executeWithTools(
    messages: Array<{ role: string; content: string; name?: string }>,
    agent: AiAgent,
    context: ToolExecutionContext,
    llmParams: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
    },
  ): Promise<ToolExecutionResult> {
    const toolDefinitions = this.toolRegistry.getToolDefinitions(agent, context);

    if (toolDefinitions.length === 0) {
      // No tools available, just call LLM normally
      const response = await this.llmRouterService.generateResponse({
        messages: messages as any,
        ...llmParams,
        organizationId: context.organizationId,
        agentId: context.agentId,
        priority: 'high',
      });
      return { finalResponse: response, toolCalls: [], totalTokensUsed: response.usage?.totalTokens || 0 };
    }

    const functions = toolDefinitions.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    const conversationMessages = [...messages];
    const toolCalls: ToolCallRecord[] = [];
    let totalTokensUsed = 0;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;

      const response = await this.llmRouterService.generateResponse({
        messages: conversationMessages as any,
        functions,
        functionCall: isLastIteration ? 'none' : 'auto',
        ...llmParams,
        organizationId: context.organizationId,
        agentId: context.agentId,
        priority: 'high',
        requiresFunctionCalling: true,
      });

      totalTokensUsed += response.usage?.totalTokens || 0;

      if (response.finishReason !== 'function_call' || !response.functionCall) {
        // LLM produced a text response — we're done
        return { finalResponse: response, toolCalls, totalTokensUsed };
      }

      // Execute the tool
      const { name: toolName, arguments: toolArgsStr } = response.functionCall;
      let toolArgs: Record<string, any>;
      try {
        toolArgs = JSON.parse(toolArgsStr);
      } catch {
        this.logger.warn(`Failed to parse tool arguments for ${toolName}: ${toolArgsStr}`);
        toolArgs = {};
      }

      this.logger.log(`🔧 Executing tool: ${toolName}(${JSON.stringify(toolArgs).substring(0, 200)})`);

      const startTime = Date.now();
      const result = await this.toolRegistry.executeTool(toolName, toolArgs, agent, context);
      const durationMs = Date.now() - startTime;

      toolCalls.push({
        name: toolName,
        arguments: toolArgs,
        result: result.success ? result.data : { error: result.error },
        durationMs,
      });

      // Add assistant message with function_call, then function result
      conversationMessages.push({
        role: 'assistant',
        content: '',
        name: toolName,
      });
      conversationMessages.push({
        role: 'function',
        content: JSON.stringify(result.success ? result.data : { error: result.error }),
        name: toolName,
      });

      this.logger.log(`🔧 Tool ${toolName} completed in ${durationMs}ms (success: ${result.success})`);
    }

    // If we exhausted iterations, do one final call with no functions
    const finalResponse = await this.llmRouterService.generateResponse({
      messages: conversationMessages as any,
      ...llmParams,
      organizationId: context.organizationId,
      agentId: context.agentId,
      priority: 'high',
    });
    totalTokensUsed += finalResponse.usage?.totalTokens || 0;

    return { finalResponse, toolCalls, totalTokensUsed };
  }
}
