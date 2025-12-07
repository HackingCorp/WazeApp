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
} from "../../common/entities";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
import { InvoiceService } from "./invoice.service";
import { PlanService } from "./plan.service";
import { SubscriptionController } from "./subscription.controller";
import { BillingController } from "./billing.controller";
import { PlanController } from "./plan.controller";
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
    ]),
    EmailModule,
  ],
  controllers: [SubscriptionController, BillingController, PlanController],
  providers: [QuotaEnforcementService, QuotaAlertService, InvoiceService, PlanService],
  exports: [QuotaEnforcementService, QuotaAlertService, InvoiceService, PlanService],
})
export class SubscriptionModule {}
