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
import { QuotaEnforcementService } from "@/modules/subscriptions/quota-enforcement.service";

@Module({
  imports: [TypeOrmModule.forFeature([
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
  ])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, QuotaEnforcementService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
