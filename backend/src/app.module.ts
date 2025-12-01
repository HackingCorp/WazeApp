import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CacheModule } from "@nestjs/cache-manager";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { APP_GUARD } from "@nestjs/core";
import { redisStore } from "cache-manager-redis-yet";

// Core modules
import { DatabaseModule } from "./database/database.module";

// Feature modules
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module";
import { HealthModule } from "./modules/health/health.module";

// AI & Knowledge Base modules
import { KnowledgeBaseModule } from "./modules/knowledge-base/knowledge-base.module";
import { AiAgentsModule } from "./modules/ai-agents/ai-agents.module";
import { LlmProvidersModule } from "./modules/llm-providers/llm-providers.module";
import { VectorSearchModule } from "./modules/vector-search/vector-search.module";
import { SubscriptionModule } from "./modules/subscriptions/subscription.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PaymentsModule } from "./modules/payments/payments.module";

// Conversation Management
import { ConversationManagementModule } from "./modules/conversation-management/conversation-management.module";

// Guards
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { ThrottlerGuard } from "@nestjs/throttler";

// Controllers
import { AppController } from "./app.controller";

@Module({
  controllers: [AppController],
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Database
    DatabaseModule,

    // Throttling/Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: "default",
          ttl: configService.get("THROTTLE_TTL", 60) * 1000, // Convert to ms
          limit: configService.get("THROTTLE_LIMIT", 300), // Increased for WhatsApp sync
        },
        {
          name: "whatsapp",
          ttl: configService.get("WHATSAPP_THROTTLE_TTL", 60) * 1000,
          limit: configService.get("WHATSAPP_THROTTLE_LIMIT", 500), // Higher limit for WhatsApp
        },
      ],
    }),

    // Caching with Redis
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          socket: {
            host: configService.get("REDIS_HOST", "localhost"),
            port: configService.get("REDIS_PORT", 6379),
          },
          password: configService.get("REDIS_PASSWORD"),
        }),
        ttl: configService.get("REDIS_TTL", 3600) * 1000, // Convert to milliseconds
        max: 100,
      }),
    }),

    // Event emitter
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: ".",
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Bull Queue (Redis-based job queues)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
          password: configService.get("REDIS_PASSWORD"),
        },
      }),
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WhatsAppModule,
    HealthModule,

    // AI & Knowledge Base modules
    KnowledgeBaseModule,
    AiAgentsModule,
    LlmProvidersModule,
    VectorSearchModule,
    SubscriptionModule,
    AnalyticsModule,

    // Payments Module
    PaymentsModule,

    // Conversation Management
    ConversationManagementModule,
  ],
  providers: [
    // Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// TODO: Add the following modules when implementing additional features:
// - StorageModule (MinIO/S3 integration)
// - EmailModule (nodemailer integration)
// - NotificationsModule (webhooks, real-time updates)
// - AnalyticsModule (usage analytics, reporting)
