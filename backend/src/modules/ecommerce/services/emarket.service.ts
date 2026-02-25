import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { EcommerceStore } from "@/common/entities";
import { EcommercePlatform, ProductStatus } from "@/common/enums";
import * as crypto from "crypto";

interface EMarketProduct {
  id: number;
  name: string;
  description: string;
  short_description?: string;
  sku?: string;
  price: number;
  compare_at_price?: number;
  tax_rate?: number;
  currency: string;
  stock_quantity?: number;
  total_stock?: number;
  in_stock: boolean;
  is_active: boolean;
  product_type?: string;
  images?: { url: string; position: number }[];
  variants?: {
    id: number;
    name: string;
    sku?: string;
    price: number;
    stock_quantity?: number;
    total_stock?: number;
    attributes?: Record<string, string>;
  }[];
  category?: { id: number; name: string };
  product_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface EMarketResponse {
  data: EMarketProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

@Injectable()
export class EMarketService {
  private readonly logger = new Logger(EMarketService.name);

  async testConnection(storeUrl: string, apiKey: string): Promise<boolean> {
    const baseUrl = storeUrl.replace(/\/$/, "");

    try {
      const response = await fetch(`${baseUrl}/products?limit=1`, {
        headers: { "X-API-Key": apiKey },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new BadRequestException(
          `E-Market connection failed (${response.status}): ${errorBody || response.statusText}`,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Cannot connect to E-Market store: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async fetchWithRetry(
    url: string,
    headers: Record<string, string>,
    retries = 5,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if ((response.status >= 500 || response.status === 404 || response.status === 401) && attempt < retries) {
          this.logger.warn(
            `E-Market API returned ${response.status} for ${url}, retrying (${attempt}/${retries})...`,
          );
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }

        return response;
      } catch (error) {
        if (attempt < retries) {
          this.logger.warn(
            `E-Market API request failed: ${error instanceof Error ? error.message : error}, retrying (${attempt}/${retries})...`,
          );
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error("E-Market API: max retries exceeded");
  }

  async fetchAllProducts(store: EcommerceStore): Promise<EMarketProduct[]> {
    const products: EMarketProduct[] = [];
    const limit = 5;
    let failedPages = 0;
    const baseUrl = store.storeUrl.replace(/\/$/, "");
    const headers = { "X-API-Key": store.credentials.apiKey };

    // First: probe to get total pages count
    let totalPages: number;
    try {
      const probe = await this.fetchWithRetry(
        `${baseUrl}/products?page=1&limit=${limit}`,
        headers,
      );
      if (!probe.ok) {
        throw new Error(`E-Market API probe failed: ${probe.status}`);
      }
      const probeData: EMarketResponse = await probe.json();
      totalPages = probeData.pagination.total_pages;
      products.push(...probeData.data);
      this.logger.log(
        `E-Market sync: probe OK — ${probeData.pagination.total} products across ${totalPages} pages`,
      );
    } catch (error) {
      throw new Error(
        `E-Market sync: cannot reach API — ${error instanceof Error ? error.message : error}`,
      );
    }

    // Then: fetch remaining pages (start at 2 since page 1 is already fetched)
    for (let page = 2; page <= totalPages; page++) {
      await new Promise((r) => setTimeout(r, 3000));

      try {
        const response = await this.fetchWithRetry(
          `${baseUrl}/products?page=${page}&limit=${limit}`,
          headers,
        );

        if (!response.ok) {
          this.logger.warn(
            `E-Market sync: page ${page}/${totalPages} failed with ${response.status}, skipping`,
          );
          failedPages++;
          continue;
        }

        const data: EMarketResponse = await response.json();
        products.push(...data.data);

        this.logger.log(
          `E-Market sync: fetched page ${page}/${totalPages} (${products.length} products so far)`,
        );
      } catch (error) {
        this.logger.warn(
          `E-Market sync: page ${page}/${totalPages} error: ${error instanceof Error ? error.message : error}, skipping`,
        );
        failedPages++;
      }
    }

    this.logger.log(
      `E-Market sync: done — ${products.length} products fetched, ${failedPages}/${totalPages} pages failed`,
    );

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
        shortDescription: ext.short_description || null,
        source: EcommercePlatform.EMARKET,
        externalId: String(ext.id),
        externalUrl: ext.product_url || null,
        price: ext.price ?? null,
        compareAtPrice: ext.compare_at_price ?? null,
        currency: ext.currency || "XAF",
        sku: ext.sku || null,
        stockQuantity: ext.stock_quantity ?? ext.total_stock ?? null,
        inStock: ext.in_stock ?? true,
        status: ext.is_active ? ProductStatus.ACTIVE : ProductStatus.ARCHIVED,
        tags: [],
        metadata: {
          category: ext.category ? ext.category.name : null,
          productType: ext.product_type || null,
          taxRate: ext.tax_rate ?? null,
        },
      },
      variants: (ext.variants || []).map((v, i) => ({
        name: v.name || `Variant ${i + 1}`,
        sku: v.sku || null,
        price: v.price ?? null,
        compareAtPrice: null,
        stockQuantity: v.stock_quantity ?? v.total_stock ?? null,
        inStock: (v.stock_quantity ?? v.total_stock ?? 0) > 0,
        externalId: String(v.id),
        options: v.attributes || {},
        imageUrl: null,
        sortOrder: i,
      })),
      images: (ext.images || [])
        .sort((a, b) => a.position - b.position)
        .map((img, i) => ({
          url: img.url,
          altText: null,
          sortOrder: img.position,
          isPrimary: i === 0,
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
