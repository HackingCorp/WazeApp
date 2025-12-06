import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Organization,
  Subscription,
  UsageMetric,
  AiAgent,
  KnowledgeBase,
  KnowledgeDocument,
  WhatsAppSession,
  User,
  AgentConversation,
  AgentMessage,
} from "../../common/entities";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
import { SubscriptionController } from "./subscription.controller";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      Subscription,
      UsageMetric,
      AiAgent,
      KnowledgeBase,
      KnowledgeDocument,
      WhatsAppSession,
      User,
      AgentConversation,
      AgentMessage,
    ]),
    EmailModule,
  ],
  controllers: [SubscriptionController],
  providers: [QuotaEnforcementService, QuotaAlertService],
  exports: [QuotaEnforcementService, QuotaAlertService],
})
export class SubscriptionModule {}
