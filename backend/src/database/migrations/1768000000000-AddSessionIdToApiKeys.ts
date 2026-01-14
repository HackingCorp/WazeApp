import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionIdToApiKeys1768000000000 implements MigrationInterface {
  name = "AddSessionIdToApiKeys1768000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add session_id column to api_keys table
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      ADD COLUMN IF NOT EXISTS "session_id" uuid
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      ADD CONSTRAINT "FK_api_keys_session"
      FOREIGN KEY ("session_id") REFERENCES "whatsapp_sessions"("id")
      ON DELETE CASCADE
    `);

    // Create index for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_api_keys_session" ON "api_keys" ("session_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_api_keys_session"
    `);

    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      DROP CONSTRAINT IF EXISTS "FK_api_keys_session"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "api_keys"
      DROP COLUMN IF EXISTS "session_id"
    `);
  }
}
