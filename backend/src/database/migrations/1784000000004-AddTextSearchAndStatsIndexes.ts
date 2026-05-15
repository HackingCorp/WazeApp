import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTextSearchAndStatsIndexes1784000000004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm extension for ILIKE performance
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // GIN trigram index on document_chunks.content for ILIKE text search
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CHUNK_CONTENT_TRGM"
       ON "document_chunks" USING gin ("content" gin_trgm_ops)`,
    );

    // Index for broadcast message stats aggregation (campaignId + status)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_BROADCAST_MSG_CAMPAIGN_STATUS"
       ON "broadcast_messages" ("campaignId", "status")`,
    );

    // Index for conversation stats aggregation by agentId
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CONV_AGENT_ID"
       ON "agent_conversations" ("agentId")`,
    );

    // Index for message count by conversation (used in unread counts, last message queries)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MSG_CONV_CREATED"
       ON "agent_messages" ("conversationId", "createdAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MSG_CONV_CREATED"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONV_AGENT_ID"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_BROADCAST_MSG_CAMPAIGN_STATUS"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CHUNK_CONTENT_TRGM"`);
  }
}
