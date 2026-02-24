import { IsString, IsOptional, IsUrl, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConnectShopifyDto {
  @ApiProperty({ description: "Shopify store domain (e.g. mystore.myshopify.com)" })
  @IsString()
  shopDomain: string;
}

export class ConnectWooCommerceDto {
  @ApiProperty({ description: "WooCommerce store URL" })
  @IsString()
  storeUrl: string;

  @ApiProperty({ description: "WooCommerce Consumer Key" })
  @IsString()
  consumerKey: string;

  @ApiProperty({ description: "WooCommerce Consumer Secret" })
  @IsString()
  consumerSecret: string;

  @ApiPropertyOptional({ description: "Store name" })
  @IsOptional()
  @IsString()
  name?: string;
}

export class ConnectEMarketDto {
  @ApiProperty({ description: "E-Market store URL" })
  @IsString()
  storeUrl: string;

  @ApiPropertyOptional({ description: "Store name" })
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateManualCatalogDto {
  @ApiProperty({ description: "Catalog name" })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: "Catalog description" })
  @IsOptional()
  @IsString()
  description?: string;
}
