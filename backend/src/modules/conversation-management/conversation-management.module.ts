import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

// Import LLM Providers Module for router service
import { LlmProvidersModule } from "../llm-providers/llm-providers.module";

// Entities
import {
  AgentConversation,
  AgentMessage,
  ConversationContext,
  MessageQueue,
  MediaAsset,
  WebhookEvent,
  AiAgent,
  KnowledgeBase,
  DocumentChunk,
  LlmProvider,
  Organization,
  Subscription,
  UsageMetric,
  WhatsAppSession,
  User,
} from "../../common/entities";

// Services
import { ConversationStateService } from "./services/conversation-state.service";
import { MessageProcessingService } from "./services/message-processing.service";
import { MediaHandlingService } from "./services/media-handling.service";
import { ExternalMediaService } from "./services/external-media.service";
import { ResponseGenerationService } from "./services/response-generation.service";
import { WebhookProcessorService } from "./services/webhook-processor.service";
import { LlmProviderService } from "./services/llm-provider.service";
import { CDNService } from "./services/cdn.service";
import { VectorEmbeddingService } from "./services/vector-embedding.service";

// Controllers
import { ConversationController } from "./controllers/conversation.controller";
import { WebhookController } from "./controllers/webhook.controller";
import { MediaController } from "./controllers/media.controller";
import { LlmProviderController } from "./controllers/llm-provider.controller";
import { VectorDatabaseController } from "./controllers/vector-database.controller";
import { MarketingChatController } from "./controllers/marketing-chat.controller";

// Processors
import {
  MessageProcessor,
  MediaProcessor,
  WebhookProcessor,
  ResponseProcessor,
  AnalyticsProcessor,
} from "./processors/conversation.processors";

// Gateway
import { ConversationGateway } from "./gateways/conversation.gateway";

@Module({
  imports: [
    // TypeORM entities
    TypeOrmModule.forFeature([
      AgentConversation,
      AgentMessage,
      ConversationContext,
      MessageQueue,
      MediaAsset,
      WebhookEvent,
      AiAgent,
      KnowledgeBase,
      DocumentChunk,
      LlmProvider,
      Organization,
      Subscription,
      UsageMetric,
      WhatsAppSession,
      User,
    ]),

    // Bull queues for background processing
    BullModule.registerQueueAsync(
      {
        name: "message-processing",
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD"),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000,
            },
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: "media-processing",
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD"),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000,
            },
            removeOnComplete: 50,
            removeOnFail: 25,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: "webhook-processing",
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD"),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
            removeOnComplete: 200,
            removeOnFail: 100,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: "response-generation",
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD"),
          },
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: "exponential",
              delay: 3000,
            },
            removeOnComplete: 50,
            removeOnFail: 25,
          },
        }),
        inject: [ConfigService],
      },
      {
        name: "conversation-analytics",
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          redis: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
            password: configService.get("REDIS_PASSWORD"),
          },
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: "fixed",
              delay: 5000,
            },
            removeOnComplete: 25,
            removeOnFail: 10,
          },
        }),
        inject: [ConfigService],
      },
    ),

    // HTTP module for external API calls
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),

    // Configuration module
    ConfigModule,

    // JWT module for authentication in gateway
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: "15m" },
    }),

    // LLM Providers Module for router service
    LlmProvidersModule,
  ],

  controllers: [
    ConversationController,
    WebhookController,
    MediaController,
    LlmProviderController,
    VectorDatabaseController,
    MarketingChatController,
  ],

  providers: [
    // Core services
    ConversationStateService,
    MessageProcessingService,
    MediaHandlingService,
    ExternalMediaService,
    ResponseGenerationService,
    WebhookProcessorService,
    LlmProviderService,
    CDNService,
    VectorEmbeddingService,

    // Queue processors
    MessageProcessor,
    MediaProcessor,
    WebhookProcessor,
    ResponseProcessor,
    AnalyticsProcessor,

    // WebSocket gateway
    ConversationGateway,
  ],

  exports: [
    // Export services that might be used by other modules
    ConversationStateService,
    MessageProcessingService,
    MediaHandlingService,
    ExternalMediaService,
    ResponseGenerationService,
    WebhookProcessorService,
    LlmProviderService,
    CDNService,
    VectorEmbeddingService,
    ConversationGateway,
  ],
})
export class ConversationManagementModule {}
