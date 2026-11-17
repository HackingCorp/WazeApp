import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Order,
  OrderItem,
  Product,
  ProductVariant,
  OrganizationMember,
  User,
} from '@/common/entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderTagParserService } from './services/order-tag-parser.service';
import { OrderNotificationService } from './services/order-notification.service';
import { SubscriptionModule } from '../subscriptions/subscription.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Product,
      ProductVariant,
      OrganizationMember,
      User,
    ]),
    SubscriptionModule,
    EmailModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderTagParserService, OrderNotificationService],
  exports: [OrderService, OrderTagParserService],
})
export class OrdersModule {}
