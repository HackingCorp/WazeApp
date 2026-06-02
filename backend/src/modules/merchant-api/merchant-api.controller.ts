import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { ApiKeyPermission } from '@/common/entities/api-key.entity';
import { OrderSource } from '@/common/enums';
import { ProductService } from '@/modules/ecommerce/services/product.service';
import { CategoryService } from '@/modules/ecommerce/services/category.service';
import { OrderService } from '@/modules/orders/services/order.service';
import { MerchantApiKeyGuard } from './guards/merchant-api-key.guard';
import { RequireMerchantPermission, MerchantAuth } from './decorators/merchant-permission.decorator';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

interface MerchantAuthData {
  organizationId: string;
  permissions: ApiKeyPermission[];
  keyId: string;
  keyName: string;
}

@ApiTags('Merchant API')
@ApiHeader({ name: 'X-API-Key', description: 'Merchant API key', required: true })
@Controller('merchant')
@Public()
@UseGuards(MerchantApiKeyGuard)
export class MerchantApiController {
  private readonly logger = new Logger(MerchantApiController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly orderService: OrderService,
  ) {}

  // ==========================================
  // PRODUCTS
  // ==========================================

  @Get('products')
  @RequireMerchantPermission(ApiKeyPermission.PRODUCTS_READ)
  @ApiOperation({ summary: 'List products' })
  async listProducts(
    @MerchantAuth() auth: MerchantAuthData,
    @Query() query: QueryProductsDto,
  ) {
    this.logger.debug(`Merchant API: listing products for org=${auth.organizationId}`);
    return this.productService.findAll(auth.organizationId, query as any);
  }

  @Get('products/:id')
  @RequireMerchantPermission(ApiKeyPermission.PRODUCTS_READ)
  @ApiOperation({ summary: 'Get product by ID' })
  async getProduct(
    @MerchantAuth() auth: MerchantAuthData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productService.findOne(auth.organizationId, id);
  }

  // ==========================================
  // CATEGORIES
  // ==========================================

  @Get('categories')
  @RequireMerchantPermission(ApiKeyPermission.PRODUCTS_READ)
  @ApiOperation({ summary: 'List product categories' })
  async listCategories(
    @MerchantAuth() auth: MerchantAuthData,
    @Query() query: QueryProductsDto,
  ) {
    return this.categoryService.findAll(auth.organizationId, {
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  // ==========================================
  // ORDERS
  // ==========================================

  @Post('orders')
  @RequireMerchantPermission(ApiKeyPermission.ORDERS_CREATE)
  @ApiOperation({ summary: 'Create a new order' })
  async createOrder(
    @MerchantAuth() auth: MerchantAuthData,
    @Body() dto: CreateOrderDto,
  ) {
    this.logger.debug(`Merchant API: creating order for org=${auth.organizationId}`);
    return this.orderService.create(auth.organizationId, {
      ...dto,
      source: OrderSource.API,
    });
  }

  @Get('orders')
  @RequireMerchantPermission(ApiKeyPermission.ORDERS_READ)
  @ApiOperation({ summary: 'List orders' })
  async listOrders(
    @MerchantAuth() auth: MerchantAuthData,
    @Query() query: QueryOrdersDto,
  ) {
    return this.orderService.findAll(auth.organizationId, query);
  }

  @Get('orders/:id')
  @RequireMerchantPermission(ApiKeyPermission.ORDERS_READ)
  @ApiOperation({ summary: 'Get order by ID' })
  async getOrder(
    @MerchantAuth() auth: MerchantAuthData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderService.findOne(id, auth.organizationId);
  }

  @Patch('orders/:id/status')
  @RequireMerchantPermission(ApiKeyPermission.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Update order status' })
  async updateOrderStatus(
    @MerchantAuth() auth: MerchantAuthData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(
      id,
      auth.organizationId,
      dto.status,
      dto.cancellationReason,
    );
  }
}
