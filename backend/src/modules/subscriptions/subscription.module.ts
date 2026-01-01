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
  Invoice,
  Plan,
  MessageCredit,
} from "../../common/entities";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
import { InvoiceService } from "./invoice.service";
import { PlanService } from "./plan.service";
import { MessageCreditsService } from "./message-credits.service";
import { SubscriptionController } from "./subscription.controller";
import { BillingController } from "./billing.controller";
import { PlanController } from "./plan.controller";
import { MessageCreditsController } from "./message-credits.controller";
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
      Invoice,
      Plan,
      MessageCredit,
    ]),
    EmailModule,
  ],
  controllers: [SubscriptionController, BillingController, PlanController, MessageCreditsController],
  providers: [QuotaEnforcementService, QuotaAlertService, InvoiceService, PlanService, MessageCreditsService],
  exports: [QuotaEnforcementService, QuotaAlertService, InvoiceService, PlanService, MessageCreditsService],
})
export class SubscriptionModule {}
