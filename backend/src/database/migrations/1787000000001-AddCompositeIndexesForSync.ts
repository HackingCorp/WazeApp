import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompositeIndexesForSync1787000000001
  implements MigrationInterface
{
  name = "AddCompositeIndexesForSync1787000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index composite for the most frequent query (userId + channel + sessionId)
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_CONV_USER_CHANNEL_SESSION"
       ON "agent_conversations" ("userId", "channel", "sessionId")`,
    );

    // Index for JSONB context->>'sessionId' lookups
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_CONV_CONTEXT_SESSION"
       ON "agent_conversations" ((context->>'sessionId'))`,
    );

    // Index composite for contact lookup (sessionId + lid)
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_CONTACT_SESSION_LID"
       ON "whatsapp_contacts" ("sessionId", "lid")`,
    );

    // Partial index for message dedup lookup (conversationId + createdAt where content is not null)
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_MSG_CONV_CONTENT_DATE"
       ON "agent_messages" ("conversationId", "createdAt")
       WHERE content IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_MSG_CONV_CONTENT_DATE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_CONTACT_SESSION_LID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_CONV_CONTEXT_SESSION"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_CONV_USER_CHANNEL_SESSION"`,
    );
  }
}
