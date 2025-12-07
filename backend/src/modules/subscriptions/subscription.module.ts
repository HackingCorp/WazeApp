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
} from "../../common/entities";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
import { InvoiceService } from "./invoice.service";
import { SubscriptionController } from "./subscription.controller";
import { BillingController } from "./billing.controller";
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
    ]),
    EmailModule,
  ],
  controllers: [SubscriptionController, BillingController],
  providers: [QuotaEnforcementService, QuotaAlertService, InvoiceService],
  exports: [QuotaEnforcementService, QuotaAlertService, InvoiceService],
})
export class SubscriptionModule {}
