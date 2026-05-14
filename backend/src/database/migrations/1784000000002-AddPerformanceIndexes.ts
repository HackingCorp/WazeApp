import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1784000000002 implements MigrationInterface {
  name = "AddPerformanceIndexes1784000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial index on externalMessageId for WhatsApp dedup lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_MSG_EXTERNAL_ID"
      ON "agent_messages" ("externalMessageId")
      WHERE "externalMessageId" IS NOT NULL
    `);

    // Composite index for fetching latest messages in a conversation
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_MSG_CONV_SEQ"
      ON "agent_messages" ("conversationId", "sequenceNumber" DESC)
    `);

    // Composite index for fetching last N user messages (used by AI context building)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_MSG_CONV_ROLE_DATE"
      ON "agent_messages" ("conversationId", "role", "createdAt" DESC)
    `);

    // Index for conversation listing sorted by recent activity
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CONV_UPDATED_AT"
      ON "agent_conversations" ("updatedAt" DESC)
    `);

    // Composite index for per-agent conversation listing
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CONV_AGENT_UPDATED"
      ON "agent_conversations" ("agentId", "updatedAt" DESC)
    `);

    // Drop low-selectivity index on role (only 4 enum values)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_MSG_ROLE"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the role index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_MSG_ROLE"
      ON "agent_messages" ("role")
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONV_AGENT_UPDATED"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONV_UPDATED_AT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MSG_CONV_ROLE_DATE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MSG_CONV_SEQ"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MSG_EXTERNAL_ID"`);
  }
}
