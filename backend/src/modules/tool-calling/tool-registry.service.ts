import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolDefinition, ToolResult, ToolExecutionContext, ApiConnection } from './interfaces/tool.interface';
import { InternalProductHandler } from './handlers/internal-product.handler';
import { InternalOrderHandler } from './handlers/internal-order.handler';
import { InternalAppointmentHandler } from './handlers/internal-appointment.handler';
import { ExternalApiHandler } from './handlers/external-api.handler';
import { AiAgent } from '@/common/entities';
import { decrypt, isEncrypted } from '@/common/utils/crypto.util';

/**
 * Legacy format (pre-refactor): tools stored as flat objects at top level
 */
interface LegacyApiTool {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  timeout?: number;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

function isLegacyTool(entry: any): entry is LegacyApiTool {
  return entry && typeof entry.url === 'string' && typeof entry.method === 'string' && !entry.baseUrl;
}

function isNewConnection(entry: any): entry is ApiConnection {
  return entry && typeof entry.baseUrl === 'string' && Array.isArray(entry.tools);
}

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

    // External API tools — support both legacy and new formats
    const apiTools = (agent as any).apiTools as any[] | undefined;
    this.logger.log(`🔧 getToolDefinitions: apiTools count = ${apiTools?.length ?? 'undefined'}, type = ${typeof apiTools}`);
    if (apiTools?.length) {
      for (const entry of apiTools) {
        this.logger.log(`🔧 Entry check: isLegacy=${isLegacyTool(entry)}, isNew=${isNewConnection(entry)}, baseUrl=${entry.baseUrl || 'N/A'}, toolsCount=${entry.tools?.length || 0}`);
        if (isLegacyTool(entry)) {
          // Legacy format: tool definition is at top level
          tools.push({
            name: entry.name,
            description: entry.description,
            parameters: entry.parameters,
          });
        } else if (isNewConnection(entry)) {
          // New format: iterate nested tools
          for (const tool of entry.tools) {
            if (!tool.enabled) continue;
            // If the stored name is a hash (not human-readable), regenerate from method+path
            let toolName = tool.name;
            if (/^[0-9a-f]{16,}$/i.test(toolName)) {
              const cleanPath = (tool.path || '')
                .replace(/\{([^}]+)\}/g, '$1')
                .replace(/[^a-zA-Z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase();
              toolName = `${(tool.method || 'get').toLowerCase()}_${cleanPath}`.substring(0, 64);
            }
            tools.push({
              name: toolName,
              description: tool.description,
              parameters: tool.parameters,
            });
          }
        }
      }
    }

    this.logger.log(`🔧 Total tool definitions generated: ${tools.length} (names: ${tools.map(t => t.name).join(', ')})`);
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

      // Check external API tools — support both formats
      const apiTools = (agent as any).apiTools as any[] | undefined;
      if (apiTools?.length) {
        for (const entry of apiTools) {
          if (isLegacyTool(entry) && entry.name === name) {
            // Legacy format: decrypt header values if encrypted, then execute directly
            const decryptedHeaders: Record<string, string> = {};
            if (entry.headers) {
              for (const [k, v] of Object.entries(entry.headers)) {
                decryptedHeaders[k] = isEncrypted(v) ? decrypt(v, this.encryptionKey) : v;
              }
            }
            const result = await this.externalApiHandler.executeLegacy(
              { ...entry, headers: decryptedHeaders },
              args,
            );
            this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (external/legacy)`);
            return result;
          }

          if (isNewConnection(entry)) {
            // Match by stored name OR by regenerated name (for hash->readable migration)
            const tool = entry.tools?.find(t => {
              if (!t.enabled) return false;
              if (t.name === name) return true;
              // Check if stored name is a hash and the called name matches the regenerated path-based name
              if (/^[0-9a-f]{16,}$/i.test(t.name)) {
                const cleanPath = (t.path || '')
                  .replace(/\{([^}]+)\}/g, '$1')
                  .replace(/[^a-zA-Z0-9]/g, '_')
                  .replace(/_+/g, '_')
                  .replace(/^_|_$/g, '')
                  .toLowerCase();
                const regenerated = `${(t.method || 'get').toLowerCase()}_${cleanPath}`.substring(0, 64);
                return regenerated === name;
              }
              return false;
            });
            if (tool) {
              // Decrypt apiKey at execution time
              const decryptedConnection = { ...entry };
              if (decryptedConnection.apiKey && isEncrypted(decryptedConnection.apiKey)) {
                decryptedConnection.apiKey = decrypt(decryptedConnection.apiKey, this.encryptionKey);
              }
              const result = await this.externalApiHandler.execute(decryptedConnection, tool, args);
              this.logger.log(`Tool ${name} executed in ${Date.now() - startTime}ms (external)`);
              return result;
            }
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
