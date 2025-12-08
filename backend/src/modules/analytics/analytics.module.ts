import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import {
  User,
  Organization,
  AiAgent,
  AgentConversation,
  AgentMessage,
  WhatsAppSession,
  Subscription,
  UsageMetric,
  KnowledgeBase,
  KnowledgeDocument,
} from "@/common/entities";
import { SubscriptionModule } from "@/modules/subscriptions/subscription.module";

@Module({
  imports: [
    SubscriptionModule,
    TypeOrmModule.forFeature([
      User,
      Organization,
      AiAgent,
      AgentConversation,
      AgentMessage,
      WhatsAppSession,
      Subscription,
      UsageMetric,
      KnowledgeBase,
      KnowledgeDocument,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
