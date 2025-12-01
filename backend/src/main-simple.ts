import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { AppSimpleModule } from "./app-simple.module";

async function bootstrap() {
  const app = await NestFactory.create(AppSimpleModule, {
    logger: ["error", "warn", "log"],
  });

  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // Basic CORS
  app.enableCors();

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  const apiPrefix = configService.get("API_PREFIX", "api/v1");
  app.setGlobalPrefix(apiPrefix);

  // Basic Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("WizeApp API")
    .setDescription("WhatsApp AI Agents SaaS Platform API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  // Start server
  const port = configService.get("PORT", 3100);
  await app.listen(port);

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(
    `📖 Swagger documentation: http://localhost:${port}/${apiPrefix}/docs`,
  );
  logger.log(`🏥 Health check: http://localhost:${port}/${apiPrefix}/health`);
}

bootstrap().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
