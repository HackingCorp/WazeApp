import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppMinimalModule } from "./app-minimal.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  try {
    const app = await NestFactory.create(AppMinimalModule, {
      logger: ["error", "warn", "log"],
    });

    const configService = app.get(ConfigService);

    // Enable CORS with permissive settings for debugging
    app.enableCors({
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization", 
        "Accept",
        "Origin",
        "X-Requested-With",
      ],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });

    // Global pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    // API prefix
    app.setGlobalPrefix("api/v1");

    // Start server
    const port = configService.get("PORT", 3100);
    const host = "0.0.0.0"; // Explicitly bind to all interfaces
    await app.listen(port, host);

    logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
    logger.log(`🏥 Health check: http://localhost:${port}/api/v1/health`);
    logger.log(`🌐 CORS enabled for all origins`);
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

bootstrap();
