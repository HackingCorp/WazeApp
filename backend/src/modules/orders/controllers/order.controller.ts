import { Controller, Get, Post, Patch, Param, Query, Body, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from '../services/order.service';
import { CreateOrderDto, UpdateOrderStatusDto, OrderQueryDto } from '../dto/order.dto';
import { OrderSource } from '@/common/enums';
import { QuotaEnforcementService } from '../../subscriptions/quota-enforcement.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly quotaEnforcementService: QuotaEnforcementService,
  ) {}

  @Get()
  async findAll(@Req() req: any, @Query() query: OrderQueryDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.orderService.findAll(organizationId, query);
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.orderService.getStats(organizationId);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.orderService.findOne(id, organizationId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.orderService.updateStatus(id, organizationId, dto.status, dto.cancellationReason);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateOrderDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    await this.quotaEnforcementService.enforceFeatureAccess(organizationId, 'ecommerce');
    return this.orderService.create(organizationId, {
      ...dto,
      source: dto.source || OrderSource.DASHBOARD,
    });
  }
}
