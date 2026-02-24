import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { EcommerceStore } from "@/common/entities";
import { EcommercePlatform, ProductStatus } from "@/common/enums";
import * as crypto from "crypto";

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  categories: { id: number; name: string; slug: string }[];
  tags: { id: number; name: string; slug: string }[];
  images: { id: number; src: string; name: string; alt: string }[];
  attributes: { id: number; name: string; options: string[] }[];
  variations: number[];
}

interface WooVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  attributes: { name: string; option: string }[];
  image: { src: string; alt: string } | null;
}

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  private getAuthHeaders(store: EcommerceStore): string {
    const { consumerKey, consumerSecret } = store.credentials;
    return Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  }

  private getBaseUrl(store: EcommerceStore): string {
    return `${store.storeUrl.replace(/\/$/, "")}/wp-json/wc/v3`;
  }

  async testConnection(
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
  ): Promise<boolean> {
    const baseUrl = `${storeUrl.replace(/\/$/, "")}/wp-json/wc/v3`;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
      "base64",
    );

    try {
      const response = await fetch(`${baseUrl}/system_status`, {
        headers: { Authorization: `Basic ${auth}` },
      });

      if (!response.ok) {
        throw new BadRequestException(
          `WooCommerce connection failed: ${response.statusText}`,
        );
      }
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Cannot connect to WooCommerce store: ${error.message}`,
      );
    }
  }

  async fetchAllProducts(store: EcommerceStore): Promise<WooProduct[]> {
    const products: WooProduct[] = [];
    let page = 1;
    const perPage = 100;
    const auth = this.getAuthHeaders(store);
    const baseUrl = this.getBaseUrl(store);

    while (true) {
      const response = await fetch(
        `${baseUrl}/products?per_page=${perPage}&page=${page}`,
        {
          headers: { Authorization: `Basic ${auth}` },
        },
      );

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.statusText}`);
      }

      const data: WooProduct[] = await response.json();
      products.push(...data);

      if (data.length < perPage) break;
      page++;
    }

    return products;
  }

  async fetchVariations(
    store: EcommerceStore,
    productId: number,
  ): Promise<WooVariation[]> {
    const auth = this.getAuthHeaders(store);
    const baseUrl = this.getBaseUrl(store);

    const response = await fetch(
      `${baseUrl}/products/${productId}/variations?per_page=100`,
      {
        headers: { Authorization: `Basic ${auth}` },
      },
    );

    if (!response.ok) return [];
    return response.json();
  }

  mapToProduct(
    wooProduct: WooProduct,
    store: EcommerceStore,
    variations?: WooVariation[],
  ): {
    product: Record<string, any>;
    variants: Record<string, any>[];
    images: Record<string, any>[];
  } {
    return {
      product: {
        name: wooProduct.name,
        description:
          wooProduct.description?.replace(/<[^>]+>/g, "") || null,
        shortDescription:
          wooProduct.short_description?.replace(/<[^>]+>/g, "") || null,
        source: EcommercePlatform.WOOCOMMERCE,
        externalId: String(wooProduct.id),
        externalUrl: wooProduct.permalink,
        price: wooProduct.price ? parseFloat(wooProduct.price) : null,
        compareAtPrice:
          wooProduct.regular_price &&
          wooProduct.sale_price &&
          wooProduct.regular_price !== wooProduct.price
            ? parseFloat(wooProduct.regular_price)
            : null,
        currency: "USD",
        sku: wooProduct.sku || null,
        stockQuantity: wooProduct.stock_quantity,
        inStock: wooProduct.stock_status === "instock",
        status:
          wooProduct.status === "publish"
            ? ProductStatus.ACTIVE
            : wooProduct.status === "draft"
              ? ProductStatus.DRAFT
              : ProductStatus.ARCHIVED,
        tags: wooProduct.tags?.map((t) => t.name) || [],
        metadata: {
          productType: wooProduct.type,
        },
      },
      variants: (variations || []).map((v, i) => ({
        name: v.attributes.map((a) => a.option).join(" / ") || `Variant ${i + 1}`,
        sku: v.sku || null,
        price: v.price ? parseFloat(v.price) : null,
        compareAtPrice:
          v.regular_price && v.sale_price
            ? parseFloat(v.regular_price)
            : null,
        stockQuantity: v.stock_quantity,
        inStock: v.stock_status === "instock",
        externalId: String(v.id),
        options: v.attributes.reduce(
          (acc, a) => ({ ...acc, [a.name]: a.option }),
          {},
        ),
        imageUrl: v.image?.src || null,
        sortOrder: i,
      })),
      images: wooProduct.images.map((img, i) => ({
        url: img.src,
        altText: img.alt || img.name || null,
        sortOrder: i,
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
