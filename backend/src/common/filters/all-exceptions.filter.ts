import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        message = (exceptionResponse as Record<string, unknown>).message as string || exception.message;
        errors = (exceptionResponse as Record<string, unknown>).errors;
      } else {
        message = exceptionResponse as string;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Internal server error";
    }

    // Log error details
    const errorType = exception instanceof Error ? exception.constructor.name : typeof exception;
    const originalMessage = exception instanceof Error ? exception.message : String(exception);
    const errorInfo = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      errorType,
      originalMessage,
      ...(errors && { errors }),
    };

    if (status >= 500) {
      this.logger.error(
        `Server Error [${errorType}]: ${originalMessage} | ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : "",
      );
    } else if (status >= 400) {
      this.logger.warn(`Client Error: ${JSON.stringify(errorInfo)}`);
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(errors && { errors }),
      ...(process.env.NODE_ENV === "development" &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    };

    response.status(status).json(errorResponse);
  }
}
