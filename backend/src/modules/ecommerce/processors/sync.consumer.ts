import { Injectable, Logger } from "@nestjs/common";
import { Processor, Process, OnQueueFailed } from "@nestjs/bull";
import { Job } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EcommerceStore, Product } from "@/common/entities";
import { StoreConnectionStatus, EcommercePlatform } from "@/common/enums";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ProductService } from "../services/product.service";
import { StoreService } from "../services/store.service";
import { ShopifyService } from "../services/shopify.service";
import { WooCommerceService } from "../services/woocommerce.service";
import { EMarketService } from "../services/emarket.service";

@Injectable()
@Processor("ecommerce-sync")
export class SyncConsumer {
  private readonly logger = new Logger(SyncConsumer.name);

  constructor(
    @InjectRepository(EcommerceStore)
    private readonly storeRepository: Repository<EcommerceStore>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly productService: ProductService,
    private readonly storeService: StoreService,
    private readonly shopifyService: ShopifyService,
    private readonly wooCommerceService: WooCommerceService,
    private readonly eMarketService: EMarketService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process("full-sync")
  async handleFullSync(job: Job<{ storeId: string }>) {
    const { storeId } = job.data;
    this.logger.log(`Starting full sync for store ${storeId}`);

    const store = await this.storeService.findById(storeId);

    // Set store to syncing
    await this.storeService.updateStatus(storeId, StoreConnectionStatus.SYNCING);
    await job.progress(5);

    try {
      let syncedCount = 0;

      if (store.platform === EcommercePlatform.SHOPIFY) {
        syncedCount = await this.syncShopify(store, job);
      } else if (store.platform === EcommercePlatform.WOOCOMMERCE) {
        syncedCount = await this.syncWooCommerce(store, job);
      } else if (store.platform === EcommercePlatform.EMARKET) {
        syncedCount = await this.syncEMarket(store, job);
      }

      // Update store sync config
      await this.storeService.updateSyncConfig(storeId, {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "success",
        totalProductsSynced: syncedCount,
      });

      await this.storeService.updateStatus(storeId, StoreConnectionStatus.CONNECTED);
      await job.progress(100);

      this.eventEmitter.emit("ecommerce.sync.completed", {
        storeId,
        productsCount: syncedCount,
      });

      this.logger.log(`Full sync completed for store ${storeId}: ${syncedCount} products`);
      return { syncedCount };
    } catch (error) {
      this.logger.error(`Full sync failed for store ${storeId}: ${error.message}`);

      await this.storeService.updateSyncConfig(storeId, {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: `error: ${error.message}`,
      });

      await this.storeService.updateStatus(storeId, StoreConnectionStatus.ERROR);
      throw error;
    }
  }

  @Process("incremental-sync")
  async handleIncrementalSync(job: Job<{ storeId: string }>) {
    // For now, incremental sync does the same as full sync
    // In production, this would only fetch products modified since lastSyncAt
    return this.handleFullSync(job);
  }

  private async syncShopify(store: EcommerceStore, job: Job): Promise<number> {
    const shopifyProducts = await this.shopifyService.fetchAllProducts(store);
    await job.progress(30);

    const externalIds = new Set<string>();
    let count = 0;

    for (const sp of shopifyProducts) {
      const { product, variants, images } = this.shopifyService.mapToProduct(sp, store);
      externalIds.add(String(sp.id));

      await this.productService.upsertFromExternal(
        store.organizationId,
        store.id,
        String(sp.id),
        product,
        variants,
        images,
      );
      count++;

      // Update progress proportionally
      const progress = 30 + Math.floor((count / shopifyProducts.length) * 60);
      await job.progress(Math.min(progress, 90));
    }

    // Remove products that no longer exist in Shopify
    await this.removeOrphanedProducts(store.id, externalIds);
    await job.progress(95);

    return count;
  }

  private async syncWooCommerce(store: EcommerceStore, job: Job): Promise<number> {
    const wooProducts = await this.wooCommerceService.fetchAllProducts(store);
    await job.progress(30);

    const externalIds = new Set<string>();
    let count = 0;

    for (const wp of wooProducts) {
      // Fetch variations for variable products
      let variations: any[] = [];
      if (wp.type === "variable" && wp.variations?.length) {
        variations = await this.wooCommerceService.fetchVariations(store, wp.id);
      }

      const { product, variants, images } = this.wooCommerceService.mapToProduct(
        wp,
        store,
        variations,
      );
      externalIds.add(String(wp.id));

      await this.productService.upsertFromExternal(
        store.organizationId,
        store.id,
        String(wp.id),
        product,
        variants,
        images,
      );
      count++;

      const progress = 30 + Math.floor((count / wooProducts.length) * 60);
      await job.progress(Math.min(progress, 90));
    }

    await this.removeOrphanedProducts(store.id, externalIds);
    await job.progress(95);

    return count;
  }

  private async syncEMarket(store: EcommerceStore, job: Job): Promise<number> {
    const eMarketProducts = await this.eMarketService.fetchAllProducts(store);
    await job.progress(30);

    const externalIds = new Set<string>();
    let count = 0;

    for (const ep of eMarketProducts) {
      const { product, variants, images } = this.eMarketService.mapToProduct(ep, store);
      externalIds.add(String(ep.id));

      await this.productService.upsertFromExternal(
        store.organizationId,
        store.id,
        String(ep.id),
        product,
        variants,
        images,
      );
      count++;

      const progress = 30 + Math.floor((count / eMarketProducts.length) * 60);
      await job.progress(Math.min(progress, 90));
    }

    await this.removeOrphanedProducts(store.id, externalIds);
    await job.progress(95);

    return count;
  }

  private async removeOrphanedProducts(
    storeId: string,
    activeExternalIds: Set<string>,
  ): Promise<void> {
    const localProducts = await this.productRepository.find({
      where: { storeId },
      select: ["id", "externalId"],
    });

    const orphaned = localProducts.filter(
      (p) => p.externalId && !activeExternalIds.has(p.externalId),
    );

    if (orphaned.length > 0) {
      await this.productRepository.remove(orphaned);
      this.logger.log(`Removed ${orphaned.length} orphaned products from store ${storeId}`);
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.name} (${job.id}) failed for store ${job.data.storeId}: ${error.message}`,
    );
  }
}
