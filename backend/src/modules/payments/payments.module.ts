import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3PService } from './s3p.service';
import { EnkapService } from './enkap.service';
import { CurrencyService } from './currency.service';
import { SubscriptionUpgradeService } from './subscription-upgrade.service';
import { MobileMoneyController } from './mobile-money.controller';
import { PricingController } from './pricing.controller';
import { Subscription, User, Organization, Invoice } from '../../common/entities';
import { EmailModule } from '../email/email.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    TypeOrmModule.forFeature([Subscription, User, Organization, Invoice]),
    EmailModule,
    forwardRef(() => SubscriptionModule), // Import SubscriptionModule for PlanService
  ],
  controllers: [MobileMoneyController, PricingController],
  providers: [S3PService, EnkapService, CurrencyService, SubscriptionUpgradeService],
  exports: [S3PService, EnkapService, CurrencyService, SubscriptionUpgradeService],
})
export class PaymentsModule {}