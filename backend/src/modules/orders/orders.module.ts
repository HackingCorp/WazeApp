import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem, Product, ProductVariant } from '@/common/entities';
import { OrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderTagParserService } from './services/order-tag-parser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Product, ProductVariant])],
  controllers: [OrderController],
  providers: [OrderService, OrderTagParserService],
  exports: [OrderService, OrderTagParserService],
})
export class OrdersModule {}
