import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { EcommerceStore } from "@/common/entities";
import { EcommercePlatform, ProductStatus } from "@/common/enums";
import * as crypto from "crypto";
import { decrypt } from "@/common/utils/crypto.util";
import { ConfigService } from "@nestjs/config";

interface EMarketProduct {
  id: number;
  name: string;
  description: string;
  short_description?: string;
  sku?: string;
  price: number;
  sale_price?: number;
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
  /**
   * Read one credential, decrypting it when needed. Values written before
   * credentials were encrypted at rest pass through unchanged.
   */
  private credential(store: { credentials?: Record<string, any> }, field: string): string {
    const raw = store?.credentials?.[field];
    if (typeof raw !== "string" || !raw) return raw as any;
    const key = this.configService.get<string>("TOOL_ENCRYPTION_KEY") || "";
    return key ? decrypt(raw, key) : raw;
  }

  private readonly logger = new Logger(EMarketService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Shown whenever the configured URL turns out not to be the API. */
  private static readonly URL_HINT =
    "Indiquez l'URL de base de l'API E-Market, par exemple https://api.maboutique.com/api/v1/external — pas l'adresse d'une page du site.";

  /**
   * A 200 is not proof of a connection.
   *
   * The test used to accept any successful response, so the URL of an admin
   * page passed: the site answered 200 with HTML, the store was saved as
   * "connected", and the sync then died on `Unexpected token '<'`. Redirects
   * are no longer followed either, since they are what turned a wrong path
   * into an HTML page. The body must parse as JSON and carry a `data` array,
   * which is what the sync reads.
   */
  async testConnection(storeUrl: string, apiKey: string): Promise<boolean> {
    const baseUrl = storeUrl.replace(/\/+$/, "");

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/products?limit=1`, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        redirect: "manual",
      });
    } catch (error) {
      throw new BadRequestException(
        `Impossible de joindre l'API E-Market : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new BadRequestException(
        `Cette adresse redirige (HTTP ${response.status}) au lieu de répondre. ${EMarketService.URL_HINT}`,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const detail = errorBody.trim().slice(0, 200) || response.statusText;
      throw new BadRequestException(
        `L'API E-Market a refusé la requête (HTTP ${response.status}) : ${detail}`,
      );
    }

    const body = await response.text().catch(() => "");
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new BadRequestException(
        `Cette adresse renvoie une page web, pas du JSON. ${EMarketService.URL_HINT}`,
      );
    }

    if (!Array.isArray(payload?.data)) {
      throw new BadRequestException(
        `Réponse inattendue de l'API E-Market : le champ "data" est absent. ${EMarketService.URL_HINT}`,
      );
    }

    return true;
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

        // Only transient failures deserve a retry. 401 means the credentials
        // are refused and 404 that the URL is wrong — retrying those five
        // times just delays the real answer and ends up reported as
        // "cannot reach API", which sent us hunting for an outage while the
        // service was answering perfectly.
        const isTransient = response.status >= 500 || response.status === 408 || response.status === 429;

        if (isTransient && attempt < retries) {
          this.logger.warn(
            `E-Market API returned ${response.status} for ${url}, retrying (${attempt}/${retries})...`,
          );
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          this.logger.error(
            `E-Market API refused the credentials (${response.status}) for ${url} — check the store's API key.`,
          );
        } else if (response.status === 404) {
          this.logger.error(
            `E-Market API returned 404 for ${url} — check the store URL.`,
          );
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
    const headers = { "X-API-Key": this.credential(store, "apiKey") };

    // First: probe to get total pages count
    let totalPages: number;
    try {
      const probe = await this.fetchWithRetry(
        `${baseUrl}/products?page=1&limit=${limit}`,
        headers,
      );
      if (!probe.ok) {
        // The API answered — say what it answered rather than implying it was
        // unreachable.
        const reason =
          probe.status === 401 || probe.status === 403
            ? "credentials refused"
            : probe.status === 404
              ? "endpoint not found (check the store URL)"
              : `HTTP ${probe.status}`;
        throw new Error(`E-Market API rejected the request: ${reason}`);
      }
      const raw = await probe.text();
      let probeData: EMarketResponse;
      try {
        probeData = JSON.parse(raw);
      } catch {
        // An HTML page answers 200 just as happily as the API does.
        throw new Error(
          `the URL does not point to the E-Market API (HTML received instead of JSON). ${EMarketService.URL_HINT}`,
        );
      }
      if (!Array.isArray(probeData?.data)) {
        throw new Error(
          `unexpected response from the E-Market API ("data" is missing). ${EMarketService.URL_HINT}`,
        );
      }
      totalPages = probeData.pagination?.total_pages || 1;
      products.push(...probeData.data);
      this.logger.log(
        `E-Market sync: probe OK — ${probeData.pagination?.total ?? probeData.data.length} products across ${totalPages} pages`,
      );
    } catch (error) {
      // "cannot reach" was wrong whenever the API had in fact answered.
      throw new Error(
        `E-Market sync failed — ${error instanceof Error ? error.message : error}`,
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
        if (!Array.isArray(data?.data)) {
          this.logger.warn(
            `E-Market sync: page ${page}/${totalPages} returned an unexpected body, skipping`,
          );
          failedPages++;
          continue;
        }
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
        price: ext.sale_price ?? ext.price ?? null,
        compareAtPrice: ext.sale_price ? (ext.price ?? null) : (ext.compare_at_price ?? null),
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
