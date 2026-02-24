import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCatalogsAndProductTypes1778000000000 implements MigrationInterface {
  name = "AddCatalogsAndProductTypes1778000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add product type enum and column
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'products_type_enum') THEN
          CREATE TYPE "products_type_enum" AS ENUM ('product', 'service');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "type" "products_type_enum" NOT NULL DEFAULT 'product'
    `);

    // 2. Create agent_store_catalogs junction table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_store_catalogs" (
        "agentId" uuid NOT NULL,
        "storeId" uuid NOT NULL,
        CONSTRAINT "PK_agent_store_catalogs" PRIMARY KEY ("agentId", "storeId"),
        CONSTRAINT "FK_agent_store_catalogs_agent" FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_agent_store_catalogs_store" FOREIGN KEY ("storeId") REFERENCES "ecommerce_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_store_catalogs_agentId" ON "agent_store_catalogs" ("agentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_store_catalogs_storeId" ON "agent_store_catalogs" ("storeId")`);

    // 3. Data migration: create a "Default Catalog" per org for orphan products (storeId IS NULL)
    const orgsWithOrphans = await queryRunner.query(`
      SELECT DISTINCT "organizationId" FROM "products" WHERE "storeId" IS NULL AND "organizationId" IS NOT NULL
    `);

    for (const row of orgsWithOrphans) {
      const orgId = row.organizationId;

      // Create a default manual catalog for this org
      const result = await queryRunner.query(`
        INSERT INTO "ecommerce_stores" ("name", "platform", "status", "organizationId", "credentials", "syncConfig")
        VALUES ('Default Catalog', 'manual', 'connected', $1, '{}', '{}')
        RETURNING "id"
      `, [orgId]);

      const storeId = result[0].id;

      // Assign orphan products to this default catalog
      await queryRunner.query(`
        UPDATE "products" SET "storeId" = $1 WHERE "organizationId" = $2 AND "storeId" IS NULL
      `, [storeId, orgId]);
    }

    // 4. Data migration: agents with ecommerceEnabled=true get all catalogs from their org
    const enabledAgents = await queryRunner.query(`
      SELECT a."id", a."organizationId" FROM "ai_agents" a WHERE a."ecommerceEnabled" = true AND a."organizationId" IS NOT NULL
    `);

    for (const agent of enabledAgents) {
      const stores = await queryRunner.query(`
        SELECT "id" FROM "ecommerce_stores" WHERE "organizationId" = $1
      `, [agent.organizationId]);

      for (const store of stores) {
        await queryRunner.query(`
          INSERT INTO "agent_store_catalogs" ("agentId", "storeId") VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [agent.id, store.id]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop junction table
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_store_catalogs_storeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_store_catalogs_agentId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_store_catalogs"`);

    // Drop type column and enum
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "products_type_enum"`);
  }
}
