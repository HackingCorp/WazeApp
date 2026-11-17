import { IsString, IsOptional, IsUrl, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Accept the store URL as people actually paste it.
 *
 * `new URL(storeUrl)` is used downstream to derive the store name, and a
 * value without a scheme ("api.maboutique.com") made it throw
 * `TypeError: Invalid URL` — a 500 on a form the user could not get past.
 * The scheme is added here, once, at the edge, so both the connection test
 * and the creation see a usable absolute URL.
 */
const normaliseStoreUrl = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
};

const STORE_URL_MESSAGE =
  "storeUrl doit etre une URL valide, par exemple https://api.maboutique.com";

export class ConnectShopifyDto {
  @ApiProperty({ description: "Shopify store domain (e.g. mystore.myshopify.com)" })
  @IsString()
  shopDomain: string;
}

export class ConnectWooCommerceDto {
  @ApiProperty({
    description: "WooCommerce store URL",
    example: "https://maboutique.com",
  })
  @Transform(normaliseStoreUrl)
  @IsUrl({ require_protocol: true, require_tld: false }, { message: STORE_URL_MESSAGE })
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
  @ApiProperty({
    description: "E-Market API base URL (products are fetched from <storeUrl>/products)",
    example: "https://api.maboutique.com/api/v1/external",
  })
  @Transform(normaliseStoreUrl)
  @IsUrl({ require_protocol: true, require_tld: false }, { message: STORE_URL_MESSAGE })
  storeUrl: string;

  @ApiProperty({ description: "API Key" })
  @IsString()
  apiKey: string;

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
