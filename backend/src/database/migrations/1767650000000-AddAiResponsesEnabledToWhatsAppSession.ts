import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiResponsesEnabledToWhatsAppSession1767650000000 implements MigrationInterface {
    name = 'AddAiResponsesEnabledToWhatsAppSession1767650000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add aiResponsesEnabled column with default value true
        await queryRunner.query(`
            ALTER TABLE "whatsapp_sessions"
            ADD COLUMN IF NOT EXISTS "aiResponsesEnabled" boolean NOT NULL DEFAULT true
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "whatsapp_sessions"
            DROP COLUMN IF EXISTS "aiResponsesEnabled"
        `);
    }
}
