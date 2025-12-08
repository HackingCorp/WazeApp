import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import {
  Organization,
  OrganizationMember,
  User,
  Subscription,
  WhatsAppSession,
  UsageMetric,
  AuditLog,
} from "@/common/entities";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { SubscriptionModule } from "../subscriptions/subscription.module";

@Module({
  imports: [
    SubscriptionModule,
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMember,
      User,
      Subscription,
      WhatsAppSession,
      UsageMetric,
      AuditLog,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, AuditService, EmailService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
