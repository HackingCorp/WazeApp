import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiConnection, DiscoveredTool, ToolResult } from '../interfaces/tool.interface';
import * as net from 'net';
import * as url from 'url';

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB
const DEFAULT_TIMEOUT = 20000; // 20s (accommodates external API cold starts)
const MAX_TIMEOUT = 30000; // 30s

@Injectable()
export class ExternalApiHandler {
  private readonly logger = new Logger(ExternalApiHandler.name);

  constructor(
    private readonly httpService: HttpService,
  ) {}

  /**
   * Execute a legacy-format tool (pre-refactor: url + method + headers at top level).
   */
  async executeLegacy(toolConfig: { url: string; method: string; headers?: Record<string, string>; timeout?: number }, args: Record<string, any>): Promise<ToolResult> {
    try {
      const validationError = this.validateUrl(toolConfig.url);
      if (validationError) {
        return { success: false, error: validationError };
      }

      let finalUrl = toolConfig.url;
      const queryParams: Record<string, string> = {};
      const bodyParams: Record<string, any> = {};

      for (const [key, value] of Object.entries(args)) {
        if (finalUrl.includes(`{${key}}`)) {
          finalUrl = finalUrl.replace(`{${key}}`, encodeURIComponent(String(value)));
        } else if (toolConfig.method === 'GET' || toolConfig.method === 'DELETE') {
          queryParams[key] = String(value);
        } else {
          bodyParams[key] = value;
        }
      }

      const timeout = Math.min(toolConfig.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);

      const response = await firstValueFrom(
        this.httpService.request({
          method: toolConfig.method,
          url: finalUrl,
          headers: toolConfig.headers || {},
          params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          data: Object.keys(bodyParams).length > 0 ? bodyParams : undefined,
          timeout,
          maxContentLength: MAX_RESPONSE_SIZE,
          maxBodyLength: MAX_RESPONSE_SIZE,
          validateStatus: () => true,
        }),
      );

      let responseData = response.data;
      const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
      if (responseStr.length > MAX_RESPONSE_SIZE) {
        responseData = { truncated: true, data: responseStr.substring(0, MAX_RESPONSE_SIZE) };
      }

      if (response.status >= 200 && response.status < 300) {
        return { success: true, data: responseData };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${typeof responseData === 'string' ? responseData.substring(0, 500) : JSON.stringify(responseData).substring(0, 500)}`,
        };
      }
    } catch (error) {
      this.logger.error(`External API call to ${toolConfig.url} failed: ${error.message}`);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: `API call failed: ${error.message}` };
    }
  }

  async execute(connection: ApiConnection, tool: DiscoveredTool, args: Record<string, any>): Promise<ToolResult> {
    try {
      // Build the full URL from baseUrl + tool path
      const fullUrl = connection.baseUrl.replace(/\/+$/, '') + tool.path;

      // Validate URL against SSRF
      const validationError = this.validateUrl(fullUrl);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Substitute path params and split remaining into query/body
      let finalUrl = fullUrl;
      const queryParams: Record<string, string> = {};
      const bodyParams: Record<string, any> = {};

      for (const [key, value] of Object.entries(args)) {
        if (finalUrl.includes(`{${key}}`)) {
          finalUrl = finalUrl.replace(`{${key}}`, encodeURIComponent(String(value)));
        } else if (tool.method === 'GET' || tool.method === 'DELETE') {
          queryParams[key] = String(value);
        } else {
          bodyParams[key] = value;
        }
      }

      // Add query param auth if needed
      if (connection.authType === 'query-param' && connection.apiKey) {
        const paramName = connection.authQueryParam || 'api_key';
        queryParams[paramName] = connection.apiKey;
      }

      // Build auth headers
      const headers = this.buildAuthHeaders(connection);

      const response = await firstValueFrom(
        this.httpService.request({
          method: tool.method,
          url: finalUrl,
          headers,
          params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          data: Object.keys(bodyParams).length > 0 ? bodyParams : undefined,
          timeout: Math.min(DEFAULT_TIMEOUT, MAX_TIMEOUT),
          maxContentLength: MAX_RESPONSE_SIZE,
          maxBodyLength: MAX_RESPONSE_SIZE,
          validateStatus: () => true, // Don't throw on non-2xx
        }),
      );

      // Truncate response if needed
      let responseData = response.data;
      const responseStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
      if (responseStr.length > MAX_RESPONSE_SIZE) {
        responseData = { truncated: true, data: responseStr.substring(0, MAX_RESPONSE_SIZE) };
      }

      if (response.status >= 200 && response.status < 300) {
        return { success: true, data: responseData };
      } else {
        return {
          success: false,
          error: `HTTP ${response.status}: ${typeof responseData === 'string' ? responseData.substring(0, 500) : JSON.stringify(responseData).substring(0, 500)}`,
        };
      }
    } catch (error) {
      this.logger.error(`External API call failed: ${error.message}`);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: `API call failed: ${error.message}` };
    }
  }

  private buildAuthHeaders(connection: ApiConnection): Record<string, string> {
    if (!connection.apiKey || connection.authType === 'none' || connection.authType === 'query-param') {
      return {};
    }

    switch (connection.authType) {
      case 'bearer':
        return { Authorization: `Bearer ${connection.apiKey}` };
      case 'api-key-header':
        return { [connection.authHeaderName || 'X-API-Key']: connection.apiKey };
      case 'basic':
        return { Authorization: `Basic ${Buffer.from(connection.apiKey).toString('base64')}` };
      default:
        return {};
    }
  }

  private validateUrl(rawUrl: string): string | null {
    try {
      const parsed = new url.URL(rawUrl);

      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return `Invalid protocol: ${parsed.protocol}. Only HTTP(S) allowed.`;
      }

      const hostname = parsed.hostname;

      // Block localhost and common internal hostnames
      if (['localhost', 'host.docker.internal', 'kubernetes.default.svc'].includes(hostname)) {
        return 'Access to internal hosts is not allowed';
      }

      // Block private IP ranges
      if (net.isIP(hostname)) {
        if (this.isPrivateIp(hostname)) {
          return 'Access to private IP addresses is not allowed';
        }
      }

      return null; // URL is valid
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
