import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { useContainer } from "class-validator";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters";
import {
  LoggingInterceptor,
  TransformInterceptor,
} from "./common/interceptors";
import { BaileysService } from "./modules/whatsapp/baileys.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  // Enable CORS with permissive settings for development
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

  // Security disabled temporarily for debugging
  // app.use(helmet({
  //   crossOriginResourcePolicy: { policy: 'cross-origin' },
  //   crossOriginEmbedderPolicy: false,
  // }));

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

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Enable DI for class-validator
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  // API prefix
  const apiPrefix = configService.get("API_PREFIX", "api/v1");
  app.setGlobalPrefix(apiPrefix);

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("WazeApp API")
    .setDescription("Production-ready WhatsApp AI Agents SaaS Platform API")
    .setVersion("1.0")
    .addBearerAuth()
    .addTag("Authentication", "User authentication and authorization")
    .addTag("Users", "User management")
    .addTag("Organizations", "Organization and team management")
    .addTag("Subscriptions", "Subscription and billing management")
    .addTag("WhatsApp", "WhatsApp session and messaging")
    .addTag("Health", "Health check endpoints")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Setup graceful shutdown
  const baileysService = app.get(BaileysService);
  
  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
    
    try {
      // Cleanup WhatsApp sessions
      logger.log("🧹 Cleaning up WhatsApp sessions...");
      await baileysService.cleanup();
      
      // Close the application
      logger.log("👋 Closing application...");
      await app.close();
      
      logger.log("✅ Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error("❌ Error during graceful shutdown:", error);
      process.exit(1);
    }
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start server
  const port = configService.get("PORT", 3100);
  const host = "0.0.0.0"; // Explicitly bind to all interfaces
  await app.listen(port, host);

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(
    `📖 Swagger documentation: http://localhost:${port}/${apiPrefix}/docs`,
  );
  logger.log(`🏥 Health check: http://localhost:${port}/${apiPrefix}/health`);
  logger.log(`🔄 WhatsApp sessions will auto-restore on startup`);
}

bootstrap().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
