import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiResponsesEnabledToWhatsAppSession1767650000000 implements MigrationInterface {
    name = 'AddAiResponsesEnabledToWhatsAppSession1767650000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if column exists first
        const hasColumn = await queryRunner.hasColumn('whatsapp_sessions', 'aiResponsesEnabled');
        if (!hasColumn) {
            // Add aiResponsesEnabled column with default value true (nullable for backwards compatibility)
            await queryRunner.query(`
                ALTER TABLE "whatsapp_sessions"
                ADD COLUMN "aiResponsesEnabled" boolean DEFAULT true
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasColumn = await queryRunner.hasColumn('whatsapp_sessions', 'aiResponsesEnabled');
        if (hasColumn) {
            await queryRunner.query(`
                ALTER TABLE "whatsapp_sessions"
                DROP COLUMN "aiResponsesEnabled"
            `);
        }
    }
}
