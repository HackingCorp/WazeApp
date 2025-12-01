import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversationHistory1756000000000 implements MigrationInterface {
  name = "AddConversationHistory1756000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add conversation history fields if not exists
    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      ADD COLUMN IF NOT EXISTS "session_id" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      ADD COLUMN IF NOT EXISTS "client_phone_number" character varying
    `);

    // Add index for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_conversations_session_phone" 
      ON "agent_conversations" ("session_id", "client_phone_number")
    `);

    // Add media tracking to messages
    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      ADD COLUMN IF NOT EXISTS "media_url" text
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      ADD COLUMN IF NOT EXISTS "media_type" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      ADD COLUMN IF NOT EXISTS "media_caption" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_agent_conversations_session_phone"
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      DROP COLUMN IF EXISTS "session_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      DROP COLUMN IF EXISTS "client_phone_number"
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      DROP COLUMN IF EXISTS "media_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      DROP COLUMN IF EXISTS "media_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      DROP COLUMN IF EXISTS "media_caption"
    `);
  }
}