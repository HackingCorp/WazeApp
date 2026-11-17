import {
  Controller,
  Post,
  Param,
  Req,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "@/common/decorators/public.decorator";
import { ProductService } from "../services/product.service";
import { StoreService } from "../services/store.service";
import { ShopifyService } from "../services/shopify.service";
import { WooCommerceService } from "../services/woocommerce.service";
import { EMarketService } from "../services/emarket.service";

@ApiTags("E-Commerce - Webhooks")
@Controller("ecommerce/webhooks")
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly productService: ProductService,
    private readonly storeService: StoreService,
    private readonly shopifyService: ShopifyService,
    private readonly wooCommerceService: WooCommerceService,
    private readonly eMarketService: EMarketService,
  ) {}


  /**
   * Reject any webhook we cannot authenticate.
   *
   * Verification used to run only `if (store.syncConfig?.webhookSecret && sig)`,
   * so a store without a secret — which was every store — accepted unsigned
   * payloads from anyone who knew its id. Absence of a secret now closes the
   * endpoint instead of opening it.
   */
  private assertSignedWebhook(
    store: { id?: string; syncConfig?: { webhookSecret?: string } },
    signature: string | undefined,
    rawBody: string,
    verify: (body: string, signature: string, secret: string) => boolean,
    label: string,
  ): void {
    const secret = store?.syncConfig?.webhookSecret;

    if (!secret) {
      this.logger.error(
        `${label} webhook refused: store ${store?.id} has no webhookSecret configured.`,
      );
      throw new UnauthorizedException("Webhook not configured for this store");
    }

    if (!signature) {
      this.logger.warn(`${label} webhook refused: missing signature header.`);
      throw new UnauthorizedException("Missing webhook signature");
    }

    if (!verify(rawBody, signature, secret)) {
      this.logger.warn(`${label} webhook refused: invalid signature.`);
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  @Post("shopify")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Shopify webhook receiver" })
  async handleShopifyWebhook(
    @Req() req: Request,
    @Headers("x-shopify-hmac-sha256") hmac: string,
    @Headers("x-shopify-topic") topic: string,
    @Headers("x-shopify-shop-domain") shopDomain: string,
  ) {
    this.logger.log(`Shopify webhook: ${topic} from ${shopDomain}`);

    // Find store by domain
    const stores = await this.storeService.findAll(null);
    const store = stores.find(
      (s) => s.storeUrl?.includes(shopDomain),
    );

    if (!store) {
      this.logger.warn(`No store found for domain: ${shopDomain}`);
      return { received: true };
    }

    this.assertSignedWebhook(
      store,
      hmac,
      typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      (b, sig, secret) => this.shopifyService.verifyWebhookSignature(b, sig, secret),
      "Shopify",
    );

    const body = req.body;

    try {
      if (topic === "products/create" || topic === "products/update") {
        const { product, variants, images } = this.shopifyService.mapToProduct(
          body,
          store,
        );
        await this.productService.upsertFromExternal(
          store.organizationId,
          store.id,
          String(body.id),
          product,
          variants,
          images,
        );
        this.logger.log(`Shopify product upserted: ${body.title}`);
      } else if (topic === "products/delete") {
        await this.productService.deleteByExternalId(
          store.id,
          String(body.id),
        );
        this.logger.log(`Shopify product deleted: ${body.id}`);
      }
    } catch (error) {
      this.logger.error(`Shopify webhook error: ${error.message}`);
    }

    return { received: true };
  }

  @Post("woocommerce/:storeId")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "WooCommerce webhook receiver" })
  async handleWooCommerceWebhook(
    @Param("storeId") storeId: string,
    @Req() req: Request,
    @Headers("x-wc-webhook-signature") signature: string,
    @Headers("x-wc-webhook-topic") topic: string,
  ) {
    this.logger.log(`WooCommerce webhook: ${topic} for store ${storeId}`);

    const store = await this.storeService.findById(storeId);

    this.assertSignedWebhook(
      store,
      signature,
      typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      (b, sig, secret) => this.wooCommerceService.verifyWebhookSignature(b, sig, secret),
      "WooCommerce",
    );

    const body = req.body;

    try {
      if (topic === "product.created" || topic === "product.updated") {
        const { product, variants, images } =
          this.wooCommerceService.mapToProduct(body, store);
        await this.productService.upsertFromExternal(
          store.organizationId,
          store.id,
          String(body.id),
          product,
          variants,
          images,
        );
        this.logger.log(`WooCommerce product upserted: ${body.name}`);
      } else if (topic === "product.deleted") {
        await this.productService.deleteByExternalId(
          store.id,
          String(body.id),
        );
        this.logger.log(`WooCommerce product deleted: ${body.id}`);
      }
    } catch (error) {
      this.logger.error(`WooCommerce webhook error: ${error.message}`);
    }

    return { received: true };
  }

  @Post("emarket/:storeId")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "E-Market webhook receiver" })
  async handleEMarketWebhook(
    @Param("storeId") storeId: string,
    @Req() req: Request,
    @Headers("x-emarket-signature") signature: string,
    @Headers("x-emarket-event") event: string,
  ) {
    this.logger.log(`E-Market webhook: ${event} for store ${storeId}`);

    const store = await this.storeService.findById(storeId);

    this.assertSignedWebhook(
      store,
      signature,
      typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      (b, sig, secret) => this.eMarketService.verifyWebhookSignature(b, sig, secret),
      "E-Market",
    );

    const body = req.body;

    try {
      if (event === "product.created" || event === "product.updated") {
        const { product, variants, images } =
          this.eMarketService.mapToProduct(body, store);
        await this.productService.upsertFromExternal(
          store.organizationId,
          store.id,
          String(body.id),
          product,
          variants,
          images,
        );
        this.logger.log(`E-Market product upserted: ${body.name}`);
      } else if (event === "product.deleted") {
        await this.productService.deleteByExternalId(
          store.id,
          String(body.id),
        );
        this.logger.log(`E-Market product deleted: ${body.id}`);
      }
    } catch (error) {
      this.logger.error(`E-Market webhook error: ${error.message}`);
    }

    return { received: true };
  }
}
