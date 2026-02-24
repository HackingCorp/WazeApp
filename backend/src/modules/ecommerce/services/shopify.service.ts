import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EcommerceStore } from "@/common/entities";
import { EcommercePlatform, ProductStatus } from "@/common/enums";
import * as crypto from "crypto";

interface ShopifyProduct {
  id: string;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  tags: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  image_id: number | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private readonly configService: ConfigService) {}

  generateAuthUrl(shopDomain: string, organizationId: string): string {
    const apiKey = this.configService.get<string>("SHOPIFY_API_KEY");
    const scopes = this.configService.get<string>(
      "SHOPIFY_SCOPES",
      "read_products,read_inventory",
    );
    const redirectUri = `${this.configService.get<string>("API_URL", "https://api.wazeapp.xyz")}/api/v1/ecommerce/stores/shopify/callback`;

    const state = Buffer.from(
      JSON.stringify({ organizationId }),
    ).toString("base64");

    return `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  async exchangeCodeForToken(
    shopDomain: string,
    code: string,
  ): Promise<string> {
    const apiKey = this.configService.get<string>("SHOPIFY_API_KEY");
    const apiSecret = this.configService.get<string>("SHOPIFY_API_SECRET");

    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Shopify OAuth failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  async fetchAllProducts(store: EcommerceStore): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let nextPageUrl: string | null =
      `https://${new URL(store.storeUrl).hostname}/admin/api/2024-01/products.json?limit=250`;

    while (nextPageUrl) {
      const response = await fetch(nextPageUrl, {
        headers: {
          "X-Shopify-Access-Token": store.credentials.accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.statusText}`);
      }

      const data = await response.json();
      products.push(...data.products);

      // Handle pagination via Link header
      const linkHeader = response.headers.get("link");
      nextPageUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          nextPageUrl = nextMatch[1];
        }
      }
    }

    return products;
  }

  mapToProduct(
    shopifyProduct: ShopifyProduct,
    store: EcommerceStore,
  ): {
    product: Record<string, any>;
    variants: Record<string, any>[];
    images: Record<string, any>[];
  } {
    const mainVariant = shopifyProduct.variants[0];

    return {
      product: {
        name: shopifyProduct.title,
        description: shopifyProduct.body_html?.replace(/<[^>]+>/g, "") || null,
        source: EcommercePlatform.SHOPIFY,
        externalId: String(shopifyProduct.id),
        externalUrl: `${store.storeUrl}/products/${shopifyProduct.handle}`,
        price: mainVariant ? parseFloat(mainVariant.price) : null,
        compareAtPrice: mainVariant?.compare_at_price
          ? parseFloat(mainVariant.compare_at_price)
          : null,
        currency: "USD",
        sku: mainVariant?.sku || null,
        stockQuantity: mainVariant?.inventory_quantity ?? null,
        inStock:
          mainVariant?.inventory_quantity === undefined ||
          mainVariant.inventory_quantity > 0,
        status:
          shopifyProduct.status === "active"
            ? ProductStatus.ACTIVE
            : shopifyProduct.status === "draft"
              ? ProductStatus.DRAFT
              : ProductStatus.ARCHIVED,
        tags: shopifyProduct.tags
          ? shopifyProduct.tags.split(",").map((t) => t.trim())
          : [],
        metadata: {
          vendor: shopifyProduct.vendor,
          productType: shopifyProduct.product_type,
        },
      },
      variants: shopifyProduct.variants.map((v, i) => ({
        name: v.title,
        sku: v.sku || null,
        price: parseFloat(v.price),
        compareAtPrice: v.compare_at_price
          ? parseFloat(v.compare_at_price)
          : null,
        stockQuantity: v.inventory_quantity ?? null,
        inStock:
          v.inventory_quantity === undefined || v.inventory_quantity > 0,
        externalId: String(v.id),
        options: {
          ...(v.option1 && { Option1: v.option1 }),
          ...(v.option2 && { Option2: v.option2 }),
          ...(v.option3 && { Option3: v.option3 }),
        },
        sortOrder: i,
      })),
      images: shopifyProduct.images.map((img, i) => ({
        url: img.src,
        altText: img.alt || null,
        sortOrder: img.position || i,
        isPrimary: i === 0,
      })),
    };
  }

  verifyWebhookSignature(
    rawBody: string,
    hmac: string,
    secret: string,
  ): boolean {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
  }
}
