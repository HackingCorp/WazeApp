import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition, ToolResult, ToolExecutionContext, ApiConnection } from './interfaces/tool.interface';
import { InternalProductHandler } from './handlers/internal-product.handler';
import { InternalOrderHandler } from './handlers/internal-order.handler';
import { InternalAppointmentHandler } from './handlers/internal-appointment.handler';
import { ExternalApiHandler } from './handlers/external-api.handler';
import { AiAgent } from '@/common/entities';
import { decrypt, isEncrypted } from '@/common/utils/crypto.util';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly productHandler: InternalProductHandler,
    private readonly orderHandler: InternalOrderHandler,
    private readonly appointmentHandler: InternalAppointmentHandler,
    private readonly externalApiHandler: ExternalApiHandler,
    private readonly configService: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.configService.get<string>('TOOL_ENCRYPTION_KEY') || '';
  }

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

    // External API tools from the new connection-based structure
    const apiTools = agent.apiTools as ApiConnection[] | undefined;
    if (apiTools?.length) {
      for (const connection of apiTools) {
        if (!connection.tools?.length) continue;
        for (const tool of connection.tools) {
          if (!tool.enabled) continue;
          tools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          });
        }
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

      // Check external API tools from connections
      const apiTools = agent.apiTools as ApiConnection[] | undefined;
      if (apiTools?.length) {
        for (const connection of apiTools) {
          const tool = connection.tools?.find(t => t.name === name && t.enabled);
          if (tool) {
            // Decrypt apiKey at execution time (agent may have been loaded without decryption)
            const decryptedConnection = { ...connection };
            if (decryptedConnection.apiKey && isEncrypted(decryptedConnection.apiKey)) {
              decryptedConnection.apiKey = decrypt(decryptedConnection.apiKey, this.encryptionKey);
            }
            const result = await this.externalApiHandler.execute(decryptedConnection, tool, args);
            this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (external)`);
            return result;
          }
        }
      }

      return { success: false, error: `Unknown tool: ${name}` };
    } catch (error) {
      this.logger.error(`Tool ${name} failed after ${Date.now() - startTime}ms: ${error.message}`);
      return { success: false, error: `Tool execution failed: ${error.message}` };
    }
  }
}
