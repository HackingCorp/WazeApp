import { Module } from '@nestjs/common';
import { MerchantApiController } from './merchant-api.controller';
import { MerchantApiKeyGuard } from './guards/merchant-api-key.guard';
import { EcommerceModule } from '@/modules/ecommerce/ecommerce.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { BroadcastModule } from '@/modules/broadcast/broadcast.module';

@Module({
  imports: [EcommerceModule, OrdersModule, BroadcastModule],
  controllers: [MerchantApiController],
  providers: [MerchantApiKeyGuard],
})
export class MerchantApiModule {}
