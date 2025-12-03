import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { AppStandaloneModule } from "./app-standalone.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  try {
    const app = await NestFactory.create(AppStandaloneModule, {
      logger: ["error", "warn", "log"],
    });

    const configService = app.get(ConfigService);

    // Basic CORS
    app.enableCors();

    // Global pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // API prefix
    const apiPrefix = configService.get("API_PREFIX", "api/v1");
    app.setGlobalPrefix(apiPrefix);

    // Swagger documentation
    const config = new DocumentBuilder()
      .setTitle("WazeApp API (Standalone Mode)")
      .setDescription("WhatsApp AI Agents SaaS Platform - Standalone Demo")
      .setVersion("1.0.0")
      .addBearerAuth()
      .addTag("Health", "System health checks")
      .addTag("Authentication (Standalone)", "Mock authentication for demo")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    // Start server
    const port = configService.get("PORT", 3100);
    await app.listen(port);

    logger.log(
      `🚀 WazeApp Standalone is running on: http://localhost:${port}/${apiPrefix}`,
    );
    logger.log(`📖 Swagger Docs: http://localhost:${port}/${apiPrefix}/docs`);
    logger.log(`🏥 Health Check: http://localhost:${port}/${apiPrefix}/health`);
    logger.log(`🔐 Mock Auth: Login with admin@wazeapp.com / Admin123!`);
    logger.log(`💡 Mode: Standalone (no database required)`);
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

bootstrap();
