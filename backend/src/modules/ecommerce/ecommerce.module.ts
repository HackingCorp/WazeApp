import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import {
  EcommerceStore,
  Product,
  ProductVariant,
  ProductImage,
  ProductCategory,
  AuditLog,
} from "@/common/entities";

// Controllers
import { ProductController } from "./controllers/product.controller";
import { StoreController } from "./controllers/store.controller";
import { CategoryController } from "./controllers/category.controller";
import { WebhookController } from "./controllers/webhook.controller";

// Services
import { ProductService } from "./services/product.service";
import { StoreService } from "./services/store.service";
import { CategoryService } from "./services/category.service";
import { ShopifyService } from "./services/shopify.service";
import { WooCommerceService } from "./services/woocommerce.service";
import { SyncService } from "./services/sync.service";
import { ProductSearchService } from "./services/product-search.service";

// Processors
import { SyncConsumer } from "./processors/sync.consumer";

// Audit
import { AuditService } from "../audit/audit.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EcommerceStore,
      Product,
      ProductVariant,
      ProductImage,
      ProductCategory,
      AuditLog,
    ]),
    HttpModule,
    ConfigModule,
    BullModule.registerQueue({
      name: "ecommerce-sync",
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    }),
  ],
  controllers: [
    ProductController,
    StoreController,
    CategoryController,
    WebhookController,
  ],
  providers: [
    ProductService,
    StoreService,
    CategoryService,
    ShopifyService,
    WooCommerceService,
    SyncService,
    ProductSearchService,
    SyncConsumer,
    AuditService,
  ],
  exports: [ProductService, ProductSearchService, StoreService],
})
export class EcommerceModule {}
