import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { ProductStatus, ProductType } from "@/common/enums";

export class CreateProductVariantDto {
  @ApiProperty({ description: "Variant name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Variant SKU" })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: "Variant price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: "Compare at price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ description: "Stock quantity" })
  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @ApiPropertyOptional({ description: "In stock" })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "Variant options" })
  @IsOptional()
  options?: Record<string, string>;

  @ApiPropertyOptional({ description: "Image URL" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: "Sort order" })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateProductImageDto {
  @ApiProperty({ description: "Image URL" })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: "Alt text" })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ description: "Sort order" })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: "Is primary image" })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ description: "Product name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Product description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Short description" })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional({ description: "SKU code" })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: "Price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: "Compare at price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ description: "Currency", default: "XAF" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: "Status", enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: "Product type", enum: ProductType, default: ProductType.PRODUCT })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ description: "Store/catalog ID to assign product to" })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: "Tags", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Stock quantity" })
  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @ApiPropertyOptional({ description: "In stock" })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "Product metadata" })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: "Variants", type: [CreateProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

  @ApiPropertyOptional({ description: "Images", type: [CreateProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @ApiPropertyOptional({ description: "Category IDs", type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  categoryIds?: string[];
}

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ description: "Variant ID (for existing variants)" })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: "Variant name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Variant SKU" })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: "Variant price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: "Compare at price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ description: "Stock quantity" })
  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @ApiPropertyOptional({ description: "In stock" })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "Variant options" })
  @IsOptional()
  options?: Record<string, string>;

  @ApiPropertyOptional({ description: "Image URL" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: "Sort order" })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: "External ID" })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ description: "Product ID" })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: "Created at" })
  @IsOptional()
  createdAt?: any;

  @ApiPropertyOptional({ description: "Updated at" })
  @IsOptional()
  updatedAt?: any;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: "Product name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Product description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Short description" })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional({ description: "SKU code" })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: "Price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: "Compare at price" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ description: "Currency" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: "Status", enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: "Product type", enum: ProductType, default: ProductType.PRODUCT })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ description: "Store/catalog ID to assign product to" })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: "Tags", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Stock quantity" })
  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @ApiPropertyOptional({ description: "In stock" })
  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "Product metadata" })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: "Variants", type: [UpdateProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductVariantDto)
  variants?: UpdateProductVariantDto[];

  @ApiPropertyOptional({ description: "Images", type: [CreateProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @ApiPropertyOptional({ description: "Category IDs", type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  categoryIds?: string[];
}

export class ProductQueryDto {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by status", enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: "Filter by category ID" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: "Filter by store ID" })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: "Filter by source" })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: "Filter by type", enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ description: "Minimum price" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional({ description: "Maximum price" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({ description: "Page number", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional({ description: "Sort field" })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: "Sort order" })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class BulkDeleteDto {
  @ApiProperty({ description: "Product IDs to delete", type: [String] })
  @IsArray()
  @IsUUID("4", { each: true })
  ids: string[];
}

export class BulkStatusDto {
  @ApiProperty({ description: "Product IDs", type: [String] })
  @IsArray()
  @IsUUID("4", { each: true })
  ids: string[];

  @ApiProperty({ description: "New status", enum: ProductStatus })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
