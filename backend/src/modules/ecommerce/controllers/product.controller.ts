import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { Roles } from "@/common/decorators/roles.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { UserRole } from "@/common/enums";
import { User } from "@/common/entities";
import { ProductService } from "../services/product.service";
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  BulkDeleteDto,
  BulkStatusDto,
} from "../dto/product.dto";

@ApiTags("E-Commerce - Products")
@ApiBearerAuth()
@Controller("ecommerce/products")
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Create a product" })
  @ApiResponse({ status: 201, description: "Product created" })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateProductDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const product = await this.productService.create(
      organizationId,
      user.id,
      dto,
    );
    return { data: product };
  }

  @Get()
  @ApiOperation({ summary: "List products" })
  @ApiResponse({ status: 200, description: "Products list" })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ProductQueryDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const result = await this.productService.findAll(organizationId, query);
    return {
      data: result.data,
      total: result.total,
      page: query.page || 1,
      limit: query.limit || 20,
    };
  }

  @Get("stats")
  @ApiOperation({ summary: "Get product statistics" })
  @ApiResponse({ status: 200, description: "Product statistics" })
  async getStats(@CurrentUser() user: User) {
    const organizationId = (user as any).organizationId || null;
    const stats = await this.productService.getStats(organizationId);
    return { data: stats };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get product by ID" })
  @ApiResponse({ status: 200, description: "Product details" })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    const product = await this.productService.findOne(organizationId, id);
    return { data: product };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Update a product" })
  @ApiResponse({ status: 200, description: "Product updated" })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const product = await this.productService.update(
      organizationId,
      user.id,
      id,
      dto,
    );
    return { data: product };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete a product" })
  @ApiResponse({ status: 200, description: "Product deleted" })
  async delete(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.productService.delete(organizationId, user.id, id);
    return { message: "Product deleted" };
  }

  @Post("bulk-delete")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Bulk delete products" })
  @ApiResponse({ status: 200, description: "Products deleted" })
  async bulkDelete(
    @CurrentUser() user: User,
    @Body() dto: BulkDeleteDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const result = await this.productService.bulkDelete(
      organizationId,
      user.id,
      dto,
    );
    return { data: result };
  }

  @Post("bulk-status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Bulk update product status" })
  @ApiResponse({ status: 200, description: "Products updated" })
  async bulkUpdateStatus(
    @CurrentUser() user: User,
    @Body() dto: BulkStatusDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const result = await this.productService.bulkUpdateStatus(
      organizationId,
      user.id,
      dto,
    );
    return { data: result };
  }
}
