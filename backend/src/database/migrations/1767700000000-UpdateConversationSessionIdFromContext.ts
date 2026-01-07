import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateConversationSessionIdFromContext1767700000000 implements MigrationInterface {
    name = 'UpdateConversationSessionIdFromContext1767700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update existing conversations: copy sessionId from context JSONB to the sessionId column
        await queryRunner.query(`
            UPDATE "agent_conversations"
            SET "sessionId" = context->>'sessionId'
            WHERE "sessionId" IS NULL
            AND context->>'sessionId' IS NOT NULL
        `);

        // Also update clientPhoneNumber from context for older records
        await queryRunner.query(`
            UPDATE "agent_conversations"
            SET "clientPhoneNumber" = context->'userProfile'->>'phone'
            WHERE "clientPhoneNumber" IS NULL
            AND context->'userProfile'->>'phone' IS NOT NULL
        `);

        // Log the results
        const result = await queryRunner.query(`
            SELECT COUNT(*) as count FROM "agent_conversations" WHERE "sessionId" IS NOT NULL
        `);
        console.log(`Updated conversations with sessionId: ${result[0]?.count || 0} now have sessionId set`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This migration updates data, no schema changes to revert
        // We could set sessionId back to NULL but that would lose the fix
    }
}
