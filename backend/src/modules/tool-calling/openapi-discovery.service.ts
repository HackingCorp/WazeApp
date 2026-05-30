import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DiscoveredTool } from './interfaces/tool.interface';
import * as net from 'net';
import * as url from 'url';

const SPEC_PATHS = [
  '/openapi.json',
  '/swagger.json',
  '/api-docs',
  '/v1/openapi.json',
  '/docs/openapi.json',
  '/.well-known/openapi.json',
  '/v2/api-docs',
  '/v3/api-docs',
];

const MAX_SPEC_SIZE = 1 * 1024 * 1024; // 1MB
const DISCOVERY_TIMEOUT = 15000; // 15s
const MAX_TOOLS = 20;

// Patterns to skip (admin, auth, health endpoints)
const SKIP_PATTERNS = [
  /\/health/i,
  /\/ready/i,
  /\/alive/i,
  /\/metrics/i,
  /\/admin/i,
  /\/internal/i,
  /\/auth\/login/i,
  /\/auth\/register/i,
  /\/auth\/logout/i,
  /\/auth\/token/i,
];

@Injectable()
export class OpenApiDiscoveryService {
  private readonly logger = new Logger(OpenApiDiscoveryService.name);

  constructor(private readonly httpService: HttpService) {}

  async discoverTools(
    baseUrl: string,
    apiKey?: string,
    authType: string = 'none',
    authHeaderName?: string,
  ): Promise<{ tools: DiscoveredTool[]; specVersion: string }> {
    // Validate base URL
    const urlError = this.validateUrl(baseUrl);
    if (urlError) {
      throw new Error(urlError);
    }

    // Normalize base URL (remove trailing slash)
    const normalizedBase = baseUrl.replace(/\/+$/, '');

    // Build auth headers for the discovery request
    const authHeaders = this.buildAuthHeaders(apiKey, authType, authHeaderName);

    // Try to find and fetch the spec
    const spec = await this.fetchSpec(normalizedBase, authHeaders);
    if (!spec) {
      throw new Error(
        'Could not find an OpenAPI/Swagger specification. Tried: ' +
        SPEC_PATHS.map(p => normalizedBase + p).join(', '),
      );
    }

    // Determine spec version
    const specVersion = spec.openapi || spec.swagger || 'unknown';
    const isSwagger2 = specVersion.startsWith('2');

    // Parse paths into tool definitions
    const tools = this.parseSpec(spec, isSwagger2);

    return { tools, specVersion };
  }

  private async fetchSpec(
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<any | null> {
    for (const path of SPEC_PATHS) {
      const specUrl = baseUrl + path;
      try {
        const response = await firstValueFrom(
          this.httpService.get(specUrl, {
            headers: {
              Accept: 'application/json',
              ...headers,
            },
            timeout: DISCOVERY_TIMEOUT,
            maxContentLength: MAX_SPEC_SIZE,
            validateStatus: (status) => status >= 200 && status < 300,
          }),
        );

        if (response.data && (response.data.openapi || response.data.swagger || response.data.paths)) {
          this.logger.log(`Found OpenAPI spec at ${specUrl}`);
          return response.data;
        }
      } catch {
        // Try next path
      }
    }
    return null;
  }

  private parseSpec(spec: any, isSwagger2: boolean): DiscoveredTool[] {
    const tools: DiscoveredTool[] = [];
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      // Skip filtered paths
      if (SKIP_PATTERNS.some(pattern => pattern.test(path))) continue;

      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = (pathItem as any)[method];
        if (!operation) continue;

        // Stop if we hit the max
        if (tools.length >= MAX_TOOLS) break;

        const toolName = this.generateToolName(operation.operationId, method, path);
        const description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;

        // Parse parameters
        const parameters = this.parseParameters(operation, pathItem, spec, isSwagger2);

        tools.push({
          name: toolName,
          description: description.substring(0, 200),
          path,
          method: method.toUpperCase() as DiscoveredTool['method'],
          parameters,
          enabled: true,
        });
      }

      if (tools.length >= MAX_TOOLS) break;
    }

    return tools;
  }

  private generateToolName(operationId: string | undefined, method: string, path: string): string {
    // Use operationId only if it's human-readable (not a hash or UUID)
    if (operationId && !/^[0-9a-f]{16,}$/i.test(operationId) && !/^[0-9a-f-]{36}$/i.test(operationId)) {
      // Clean operationId: replace non-alphanumeric with underscore, lowercase
      return operationId
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .substring(0, 64);
    }

    // Generate from method + path: GET /v1/weather/{city} -> get_v1_weather_city
    const cleanPath = path
      .replace(/\{([^}]+)\}/g, '$1') // Remove braces from path params
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();

    return `${method}_${cleanPath}`.substring(0, 64);
  }

  private parseParameters(
    operation: any,
    pathItem: any,
    spec: any,
    isSwagger2: boolean,
  ): DiscoveredTool['parameters'] {
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    const required: string[] = [];

    // Collect parameters from both path-level and operation-level
    const params = [
      ...(pathItem.parameters || []),
      ...(operation.parameters || []),
    ];

    for (const param of params) {
      const resolved = this.resolveRef(param, spec);
      if (!resolved || resolved.in === 'header') continue; // Skip header params (we handle auth separately)

      const paramSchema = resolved.schema || resolved;
      const paramType = paramSchema.type || 'string';
      const paramDesc = resolved.description || resolved.name || '';

      properties[resolved.name] = {
        type: paramType,
        description: paramDesc.substring(0, 200),
      };

      if (paramSchema.enum) {
        properties[resolved.name].enum = paramSchema.enum;
      }

      if (resolved.required) {
        required.push(resolved.name);
      }
    }

    // Handle request body (OpenAPI 3.x)
    if (!isSwagger2 && operation.requestBody) {
      const body = this.resolveRef(operation.requestBody, spec);
      const jsonContent = body?.content?.['application/json'];
      if (jsonContent?.schema) {
        const schema = this.resolveRef(jsonContent.schema, spec);
        if (schema?.properties) {
          for (const [propName, propDef] of Object.entries(schema.properties)) {
            const prop = this.resolveRef(propDef, spec);
            properties[propName] = {
              type: (prop as any)?.type || 'string',
              description: ((prop as any)?.description || propName).substring(0, 200),
            };
            if ((prop as any)?.enum) {
              properties[propName].enum = (prop as any).enum;
            }
          }
          if (schema.required) {
            required.push(...schema.required.filter((r: string) => !required.includes(r)));
          }
        }
      }
    }

    // Handle body param (Swagger 2.x)
    if (isSwagger2) {
      const bodyParam = params.find((p: any) => (this.resolveRef(p, spec))?.in === 'body');
      if (bodyParam) {
        const resolved = this.resolveRef(bodyParam, spec);
        const schema = this.resolveRef(resolved?.schema, spec);
        if (schema?.properties) {
          for (const [propName, propDef] of Object.entries(schema.properties)) {
            const prop = this.resolveRef(propDef, spec);
            properties[propName] = {
              type: (prop as any)?.type || 'string',
              description: ((prop as any)?.description || propName).substring(0, 200),
            };
            if ((prop as any)?.enum) {
              properties[propName].enum = (prop as any).enum;
            }
          }
          if (schema.required) {
            required.push(...schema.required.filter((r: string) => !required.includes(r)));
          }
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private resolveRef(obj: any, spec: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (!obj.$ref) return obj;

    const refPath = obj.$ref.replace('#/', '').split('/');
    let resolved = spec;
    for (const part of refPath) {
      resolved = resolved?.[part];
    }
    return resolved || obj;
  }

  private buildAuthHeaders(
    apiKey?: string,
    authType?: string,
    authHeaderName?: string,
  ): Record<string, string> {
    if (!apiKey || authType === 'none') return {};

    switch (authType) {
      case 'bearer':
        return { Authorization: `Bearer ${apiKey}` };
      case 'api-key-header':
        return { [authHeaderName || 'X-API-Key']: apiKey };
      case 'basic':
        return { Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}` };
      default:
        return {};
    }
  }

  private validateUrl(rawUrl: string): string | null {
    try {
      const parsed = new url.URL(rawUrl);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return `Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`;
      }

      const hostname = parsed.hostname;

      if (['localhost', 'host.docker.internal', 'kubernetes.default.svc'].includes(hostname)) {
        return 'Access to internal hosts is not allowed';
      }

      if (net.isIP(hostname)) {
        if (this.isPrivateIp(hostname)) {
          return 'Access to private IP addresses is not allowed';
        }
      }

      return null;
    } catch {
      return 'Invalid URL format';
    }
  }

  private isPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      if (parts[0] === 127) return true;
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 0) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
    }
    if (net.isIPv6(ip)) {
      if (ip === '::1' || ip === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
      if (ip.toLowerCase().startsWith('fe80')) return true;
      if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
    }
    return false;
  }
}
