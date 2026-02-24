import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEcommerceModule1777000000000 implements MigrationInterface {
  name = "AddEcommerceModule1777000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ecommerce_stores_platform_enum') THEN
          CREATE TYPE "ecommerce_stores_platform_enum" AS ENUM ('manual', 'shopify', 'woocommerce');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ecommerce_stores_status_enum') THEN
          CREATE TYPE "ecommerce_stores_status_enum" AS ENUM ('pending', 'connected', 'disconnected', 'error', 'syncing');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'products_status_enum') THEN
          CREATE TYPE "products_status_enum" AS ENUM ('active', 'draft', 'archived');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'products_source_enum') THEN
          CREATE TYPE "products_source_enum" AS ENUM ('manual', 'shopify', 'woocommerce');
        END IF;
      END
      $$;
    `);

    // Create ecommerce_stores table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ecommerce_stores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "platform" "ecommerce_stores_platform_enum" NOT NULL,
        "status" "ecommerce_stores_status_enum" NOT NULL DEFAULT 'pending',
        "storeUrl" character varying,
        "credentials" jsonb NOT NULL DEFAULT '{}',
        "syncConfig" jsonb NOT NULL DEFAULT '{}',
        "organizationId" uuid,
        "createdBy" character varying,
        CONSTRAINT "PK_ecommerce_stores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ecommerce_stores_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // Create product_categories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "slug" character varying,
        "description" text,
        "imageUrl" character varying,
        "externalId" character varying,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "parentId" uuid,
        "organizationId" uuid,
        CONSTRAINT "PK_product_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_categories_parent" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_product_categories_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // Create products table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "description" text,
        "shortDescription" text,
        "sku" character varying,
        "price" numeric(12,2),
        "compareAtPrice" numeric(12,2),
        "currency" character varying NOT NULL DEFAULT 'XAF',
        "status" "products_status_enum" NOT NULL DEFAULT 'active',
        "source" "products_source_enum" NOT NULL DEFAULT 'manual',
        "externalId" character varying,
        "externalUrl" character varying,
        "stockQuantity" integer,
        "inStock" boolean NOT NULL DEFAULT true,
        "tags" text[] DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "organizationId" uuid,
        "storeId" uuid,
        "createdBy" character varying,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_products_store" FOREIGN KEY ("storeId") REFERENCES "ecommerce_stores"("id") ON DELETE SET NULL
      )
    `);

    // Create product_variants table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "sku" character varying,
        "price" numeric(12,2),
        "compareAtPrice" numeric(12,2),
        "stockQuantity" integer,
        "inStock" boolean NOT NULL DEFAULT true,
        "externalId" character varying,
        "options" jsonb NOT NULL DEFAULT '{}',
        "imageUrl" character varying,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "productId" uuid NOT NULL,
        CONSTRAINT "PK_product_variants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_variants_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // Create product_images table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "url" character varying NOT NULL,
        "altText" character varying,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isPrimary" boolean NOT NULL DEFAULT false,
        "productId" uuid NOT NULL,
        CONSTRAINT "PK_product_images" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_images_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // Create product_category_map join table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_category_map" (
        "productId" uuid NOT NULL,
        "categoryId" uuid NOT NULL,
        CONSTRAINT "PK_product_category_map" PRIMARY KEY ("productId", "categoryId"),
        CONSTRAINT "FK_product_category_map_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_product_category_map_category" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_STORE_ORG" ON "ecommerce_stores" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_STORE_PLATFORM" ON "ecommerce_stores" ("platform")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_ORG" ON "products" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_STORE" ON "products" ("storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_STATUS" ON "products" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_SKU" ON "products" ("sku")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_EXTERNAL" ON "products" ("externalId", "storeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_CATEGORY_ORG" ON "product_categories" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_category_map_productId" ON "product_category_map" ("productId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_category_map_categoryId" ON "product_category_map" ("categoryId")`);

    // Add ecommerceEnabled column to ai_agents
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "ecommerceEnabled" boolean DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove ecommerceEnabled from ai_agents
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "ecommerceEnabled"`,
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_map_categoryId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_map_productId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CATEGORY_ORG"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_EXTERNAL"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_SKU"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_STATUS"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_STORE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_ORG"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_STORE_PLATFORM"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_STORE_ORG"`);

    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "product_category_map"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_images"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ecommerce_stores"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "products_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "products_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ecommerce_stores_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ecommerce_stores_platform_enum"`);
  }
}
