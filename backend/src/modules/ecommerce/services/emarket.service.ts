import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EcommerceStore } from "@/common/entities";
import { EcommercePlatform, ProductStatus } from "@/common/enums";
import * as crypto from "crypto";

interface EMarketProduct {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  sku?: string;
  status: string;
  stockQuantity?: number;
  inStock: boolean;
  url?: string;
  tags?: string[];
  images?: { url: string; alt?: string; isPrimary?: boolean }[];
  variants?: {
    id: string;
    name: string;
    price: number;
    sku?: string;
    stockQuantity?: number;
    inStock: boolean;
    options?: Record<string, string>;
  }[];
  categories?: string[];
}

interface EMarketResponse {
  products: EMarketProduct[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class EMarketService {
  private readonly logger = new Logger(EMarketService.name);

  constructor(private readonly configService: ConfigService) {}

  generateAuthUrl(storeUrl: string, organizationId: string, name?: string): string {
    const clientId = this.configService.get<string>("EMARKET_CLIENT_ID");
    const authUrl = this.configService.get<string>("EMARKET_AUTH_URL");
    const scopes = this.configService.get<string>("EMARKET_SCOPES", "");
    const redirectUri = `${this.configService.get<string>("API_URL", "https://api.wazeapp.xyz")}/api/v1/ecommerce/stores/emarket/callback`;

    const state = Buffer.from(
      JSON.stringify({ organizationId, storeUrl, name }),
    ).toString("base64");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });

    if (scopes) {
      params.set("scope", scopes);
    }

    return `${authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const tokenUrl = this.configService.get<string>("EMARKET_TOKEN_URL");
    const clientId = this.configService.get<string>("EMARKET_CLIENT_ID");
    const clientSecret = this.configService.get<string>("EMARKET_CLIENT_SECRET");
    const redirectUri = `${this.configService.get<string>("API_URL", "https://api.wazeapp.xyz")}/api/v1/ecommerce/stores/emarket/callback`;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new BadRequestException(
        `E-Market OAuth token exchange failed: ${errorText}`,
      );
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new BadRequestException(
        "E-Market OAuth response missing access_token",
      );
    }

    return data.access_token;
  }

  async testConnection(
    storeUrl: string,
    accessToken: string,
  ): Promise<boolean> {
    const baseUrl = storeUrl.replace(/\/$/, "");

    try {
      const response = await fetch(`${baseUrl}/products?limit=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new BadRequestException(
          `E-Market connection failed: ${response.statusText}`,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Cannot connect to E-Market store: ${error.message}`,
      );
    }
  }

  async fetchAllProducts(store: EcommerceStore): Promise<EMarketProduct[]> {
    const products: EMarketProduct[] = [];
    let page = 1;
    const limit = 100;
    const baseUrl = store.storeUrl.replace(/\/$/, "");
    const headers = { Authorization: `Bearer ${store.credentials.accessToken}` };

    while (true) {
      const response = await fetch(
        `${baseUrl}/products?page=${page}&limit=${limit}`,
        { headers },
      );

      if (!response.ok) {
        throw new Error(`E-Market API error: ${response.statusText}`);
      }

      const data: EMarketResponse = await response.json();
      products.push(...data.products);

      if (data.products.length < limit) break;
      page++;
    }

    return products;
  }

  mapToProduct(
    ext: EMarketProduct,
    store: EcommerceStore,
  ): {
    product: Record<string, any>;
    variants: Record<string, any>[];
    images: Record<string, any>[];
  } {
    return {
      product: {
        name: ext.name,
        description: ext.description || null,
        shortDescription: ext.shortDescription || null,
        source: EcommercePlatform.EMARKET,
        externalId: String(ext.id),
        externalUrl: ext.url || null,
        price: ext.price ?? null,
        compareAtPrice: ext.compareAtPrice ?? null,
        currency: ext.currency || "XAF",
        sku: ext.sku || null,
        stockQuantity: ext.stockQuantity ?? null,
        inStock: ext.inStock ?? true,
        status:
          ext.status === "active"
            ? ProductStatus.ACTIVE
            : ext.status === "draft"
              ? ProductStatus.DRAFT
              : ProductStatus.ARCHIVED,
        tags: ext.tags || [],
        metadata: {
          categories: ext.categories || [],
        },
      },
      variants: (ext.variants || []).map((v, i) => ({
        name: v.name || `Variant ${i + 1}`,
        sku: v.sku || null,
        price: v.price ?? null,
        compareAtPrice: null,
        stockQuantity: v.stockQuantity ?? null,
        inStock: v.inStock ?? true,
        externalId: String(v.id),
        options: v.options || {},
        imageUrl: null,
        sortOrder: i,
      })),
      images: (ext.images || []).map((img, i) => ({
        url: img.url,
        altText: img.alt || null,
        sortOrder: i,
        isPrimary: img.isPrimary ?? i === 0,
      })),
    };
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");
    try {
      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
