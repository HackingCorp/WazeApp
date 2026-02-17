import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromptHistoryToAiAgents1771000000000 implements MigrationInterface {
    name = 'AddPromptHistoryToAiAgents1771000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('ai_agents', 'promptHistory');
        if (!hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "ai_agents"
                ADD COLUMN "promptHistory" jsonb NOT NULL DEFAULT '[]'
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('ai_agents', 'promptHistory');
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "ai_agents"
                DROP COLUMN "promptHistory"
            `);
        }
    }
}
