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

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get("User-Agent") || "";
    const userId = (request as any).user?.userId;

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log(
            `${method} ${url} - ${ip} - ${userAgent} - ${duration}ms${
              userId ? ` - User: ${userId}` : ""
            }`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `${method} ${url} - ${ip} - ${userAgent} - ${duration}ms - ERROR: ${error.message}${
              userId ? ` - User: ${userId}` : ""
            }`,
          );
        },
      }),
    );
  }
}
