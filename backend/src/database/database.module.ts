import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  User,
  Organization,
  OrganizationMember,
  Subscription,
  UsageMetric,
  AuditLog,
  WhatsAppSession,
  WhatsAppContact,
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
  AiAgent,
  AgentConversation,
  AgentMessage,
  LlmProvider,
  ConversationContext,
  MessageQueue,
  MediaAsset,
  WebhookEvent,
  // Broadcast entities
  BroadcastContact,
  MessageTemplate,
  BroadcastCampaign,
  BroadcastMessage,
  ApiKey,
  WebhookConfig,
} from "../common/entities";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get("DATABASE_HOST"),
        port: +configService.get("DATABASE_PORT"),
        username: configService.get("DATABASE_USERNAME"),
        password: configService.get("DATABASE_PASSWORD"),
        database: configService.get("DATABASE_NAME"),
        entities: [
          User,
          Organization,
          OrganizationMember,
          Subscription,
          UsageMetric,
          AuditLog,
          WhatsAppSession,
          WhatsAppContact,
          KnowledgeBase,
          KnowledgeDocument,
          DocumentChunk,
          AiAgent,
          AgentConversation,
          AgentMessage,
          LlmProvider,
          ConversationContext,
          MessageQueue,
          MediaAsset,
          WebhookEvent,
          // Broadcast entities
          BroadcastContact,
          MessageTemplate,
          BroadcastCampaign,
          BroadcastMessage,
          ApiKey,
          WebhookConfig,
        ],
        synchronize:
          configService.get("DATABASE_SYNCHRONIZE", "true") === "true",
        logging: configService.get("NODE_ENV") === "development",
        ssl:
          configService.get("DATABASE_SSL_ENABLED") === "true"
            ? {
                rejectUnauthorized:
                  configService.get("DATABASE_REJECT_UNAUTHORIZED") !== "false",
              }
            : false,
        maxQueryExecutionTime: 1000,
        extra: {
          max: +configService.get("DATABASE_MAX_CONNECTIONS", 20),
          min: 1,
          idleTimeoutMillis: 30000,
          acquireTimeoutMillis: 60000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
