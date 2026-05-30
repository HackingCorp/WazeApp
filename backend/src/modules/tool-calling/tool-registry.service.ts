import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition, ToolResult, ToolExecutionContext, ExternalApiToolConfig } from './interfaces/tool.interface';
import { InternalProductHandler } from './handlers/internal-product.handler';
import { InternalOrderHandler } from './handlers/internal-order.handler';
import { InternalAppointmentHandler } from './handlers/internal-appointment.handler';
import { ExternalApiHandler } from './handlers/external-api.handler';
import { AiAgent } from '@/common/entities';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly productHandler: InternalProductHandler,
    private readonly orderHandler: InternalOrderHandler,
    private readonly appointmentHandler: InternalAppointmentHandler,
    private readonly externalApiHandler: ExternalApiHandler,
  ) {}

  getToolDefinitions(agent: AiAgent, context: ToolExecutionContext): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    if (agent.ecommerceEnabled && agent.catalogs?.length > 0) {
      tools.push(...this.productHandler.getToolDefinitions(context));
    }

    if (agent.ecommerceEnabled) {
      tools.push(...this.orderHandler.getToolDefinitions(context));
    }

    if (agent.appointmentsEnabled) {
      tools.push(...this.appointmentHandler.getToolDefinitions(context));
    }

    const apiTools = (agent as any).apiTools as ExternalApiToolConfig[] | undefined;
    if (apiTools?.length) {
      for (const tool of apiTools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }

    return tools;
  }

  async executeTool(
    name: string,
    args: Record<string, any>,
    agent: AiAgent,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Check internal handlers first
      if (this.productHandler.handles(name)) {
        const result = await this.productHandler.executeTool(name, args, context);
        this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (internal/product)`);
        return result;
      }

      if (this.orderHandler.handles(name)) {
        const result = await this.orderHandler.executeTool(name, args, context);
        this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (internal/order)`);
        return result;
      }

      if (this.appointmentHandler.handles(name)) {
        const result = await this.appointmentHandler.executeTool(name, args, context);
        this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (internal/appointment)`);
        return result;
      }

      // Check external API tools
      const apiTools = (agent as any).apiTools as ExternalApiToolConfig[] | undefined;
      const externalTool = apiTools?.find(t => t.name === name);
      if (externalTool) {
        const result = await this.externalApiHandler.execute(externalTool, args);
        this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (external)`);
        return result;
      }

      return { success: false, error: `Unknown tool: ${name}` };
    } catch (error) {
      this.logger.error(`Tool ${name} failed after ${Date.now() - startTime}ms: ${error.message}`);
      return { success: false, error: `Tool execution failed: ${error.message}` };
    }
  }
}
