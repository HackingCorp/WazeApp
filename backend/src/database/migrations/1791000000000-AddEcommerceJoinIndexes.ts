import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEcommerceJoinIndexes1791000000000 implements MigrationInterface {
  name = "AddEcommerceJoinIndexes1791000000000";

  /**
   * Foreign keys on the e-commerce join tables had no index, so every product
   * search (which joins images and variants) and every order read scanned the
   * whole table. Harmless at 42 products, quadratic as a catalogue grows.
   *
   * CONCURRENTLY is deliberately not used: these tables are small and the
   * migration runs inside a transaction.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_IMAGE_PRODUCT"
      ON "product_images" ("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_VARIANT_PRODUCT"
      ON "product_variants" ("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ORDER_ITEM_ORDER"
      ON "order_items" ("orderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ORDER_ITEM_PRODUCT"
      ON "order_items" ("productId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ORDER_ITEM_VARIANT"
      ON "order_items" ("variantId")
    `);

    // Catalogue views filter on source (manual vs imported) alongside the
    // organisation, so index the pair rather than the column alone.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_PRODUCT_ORG_SOURCE"
      ON "products" ("organizationId", "source")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_ORG_SOURCE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ORDER_ITEM_VARIANT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ORDER_ITEM_PRODUCT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ORDER_ITEM_ORDER"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_VARIANT_PRODUCT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PRODUCT_IMAGE_PRODUCT"`);
  }
}
