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
  @ApiProperty({ description: "E-Market store API URL (products endpoint)" })
  @IsString()
  storeUrl: string;

  @ApiProperty({ description: "OAuth2 Authorization URL" })
  @IsString()
  authUrl: string;

  @ApiProperty({ description: "OAuth2 Token endpoint URL" })
  @IsString()
  tokenUrl: string;

  @ApiProperty({ description: "OAuth2 Client ID" })
  @IsString()
  clientId: string;

  @ApiProperty({ description: "OAuth2 Client Secret" })
  @IsString()
  clientSecret: string;

  @ApiPropertyOptional({ description: "OAuth2 scopes (e.g. read_products)" })
  @IsOptional()
  @IsString()
  scopes?: string;

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
