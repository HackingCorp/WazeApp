import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ExternalApiToolConfig, ToolResult } from '../interfaces/tool.interface';
import * as net from 'net';
import * as url from 'url';

const MAX_RESPONSE_SIZE = 50 * 1024; // 50KB
const DEFAULT_TIMEOUT = 10000; // 10s
const MAX_TIMEOUT = 30000; // 30s

@Injectable()
export class ExternalApiHandler {
  private readonly logger = new Logger(ExternalApiHandler.name);

  constructor(
    private readonly httpService: HttpService,
  ) {}

  async execute(toolConfig: ExternalApiToolConfig, args: Record<string, any>): Promise<ToolResult> {
    try {
      // Validate URL against SSRF
      const validationError = this.validateUrl(toolConfig.url);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Build the final URL, substituting path params from args
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
      this.logger.error(`External API call to ${toolConfig.url} failed: ${error.message}`);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: `API call failed: ${error.message}` };
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
      // 127.0.0.0/8
      if (parts[0] === 127) return true;
      // 10.0.0.0/8
      if (parts[0] === 10) return true;
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 0.0.0.0
      if (parts[0] === 0) return true;
      // 169.254.0.0/16 (link-local)
      if (parts[0] === 169 && parts[1] === 254) return true;
    }

    if (net.isIPv6(ip)) {
      // ::1 (loopback)
      if (ip === '::1' || ip === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
      // fe80::/10 (link-local)
      if (ip.toLowerCase().startsWith('fe80')) return true;
      // fc00::/7 (unique local)
      if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
    }

    return false;
  }
}
