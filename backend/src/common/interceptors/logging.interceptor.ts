import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request } from "express";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  private static readonly SENSITIVE_PARAMS = /^(token|key|secret|password|authorization|api_key|apikey|access_token|refresh_token)$/i;

  private sanitizeUrl(rawUrl: string): string {
    try {
      const [path, queryString] = rawUrl.split("?");
      if (!queryString) return rawUrl;

      const params = new URLSearchParams(queryString);
      for (const name of [...params.keys()]) {
        if (LoggingInterceptor.SENSITIVE_PARAMS.test(name)) {
          params.set(name, "[REDACTED]");
        }
      }
      return `${path}?${params.toString()}`;
    } catch {
      return rawUrl;
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, ip } = request;
    const sanitizedUrl = this.sanitizeUrl(request.url);
    const userAgent = request.get("User-Agent") || "";
    const userId = (request as Request & { user?: { userId?: string } }).user?.userId;

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log(
            `${method} ${sanitizedUrl} - ${ip} - ${userAgent} - ${duration}ms${
              userId ? ` - User: ${userId}` : ""
            }`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `${method} ${sanitizedUrl} - ${ip} - ${userAgent} - ${duration}ms - ERROR: ${error.message}${
              userId ? ` - User: ${userId}` : ""
            }`,
          );
        },
      }),
    );
  }
}
