import { IsString, IsOptional, IsUrl, MaxLength, IsIn } from "class-validator";
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
  @ApiProperty({ description: "E-Market store base URL" })
  @IsString()
  storeUrl: string;

  @ApiProperty({
    description: "Authentication method",
    enum: ["api_key", "bearer", "oauth2"],
    default: "api_key",
  })
  @IsOptional()
  @IsIn(["api_key", "bearer", "oauth2"])
  authMethod?: "api_key" | "bearer" | "oauth2";

  @ApiPropertyOptional({ description: "API Key (for api_key or bearer auth)" })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ description: "OAuth2 Client ID" })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: "OAuth2 Client Secret" })
  @IsOptional()
  @IsString()
  clientSecret?: string;

  @ApiPropertyOptional({
    description: "OAuth2 Token URL (e.g. https://auth.example.com/oauth/token)",
  })
  @IsOptional()
  @IsString()
  tokenUrl?: string;

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
