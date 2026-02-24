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
import { CategoryService } from "../services/category.service";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from "../dto/category.dto";

@ApiTags("E-Commerce - Categories")
@ApiBearerAuth()
@Controller("ecommerce/categories")
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Create a category" })
  @ApiResponse({ status: 201, description: "Category created" })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateCategoryDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const category = await this.categoryService.create(
      organizationId,
      user.id,
      dto,
    );
    return { data: category };
  }

  @Get()
  @ApiOperation({ summary: "List categories" })
  @ApiResponse({ status: 200, description: "Categories list" })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: CategoryQueryDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const result = await this.categoryService.findAll(organizationId, query);
    return { data: result.data, total: result.total };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get category by ID" })
  @ApiResponse({ status: 200, description: "Category details" })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    const category = await this.categoryService.findOne(organizationId, id);
    return { data: category };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Update a category" })
  @ApiResponse({ status: 200, description: "Category updated" })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const organizationId = (user as any).organizationId || null;
    const category = await this.categoryService.update(
      organizationId,
      user.id,
      id,
      dto,
    );
    return { data: category };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete a category" })
  @ApiResponse({ status: 200, description: "Category deleted" })
  async delete(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.categoryService.delete(organizationId, user.id, id);
    return { message: "Category deleted" };
  }
}
