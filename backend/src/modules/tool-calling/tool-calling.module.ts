import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EcommerceModule } from '../ecommerce/ecommerce.module';
import { OrdersModule } from '../orders/orders.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { LlmProvidersModule } from '../llm-providers/llm-providers.module';
import { ToolRegistryService } from './tool-registry.service';
import { ToolExecutionService } from './tool-execution.service';
import { InternalProductHandler } from './handlers/internal-product.handler';
import { InternalOrderHandler } from './handlers/internal-order.handler';
import { InternalAppointmentHandler } from './handlers/internal-appointment.handler';
import { ExternalApiHandler } from './handlers/external-api.handler';

@Module({
  imports: [
    HttpModule.register({ timeout: 30000 }),
    EcommerceModule,
    OrdersModule,
    AppointmentsModule,
    LlmProvidersModule,
  ],
  providers: [
    ToolRegistryService,
    ToolExecutionService,
    InternalProductHandler,
    InternalOrderHandler,
    InternalAppointmentHandler,
    ExternalApiHandler,
  ],
  exports: [ToolExecutionService, ToolRegistryService],
})
export class ToolCallingModule {}
