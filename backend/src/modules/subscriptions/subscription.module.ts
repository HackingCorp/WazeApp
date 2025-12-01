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
} from "../../common/entities";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { SubscriptionController } from "./subscription.controller";

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
    ]),
  ],
  controllers: [SubscriptionController],
  providers: [QuotaEnforcementService],
  exports: [QuotaEnforcementService],
})
export class SubscriptionModule {}
