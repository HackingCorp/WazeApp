import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAgentResponseStyleOptions1706691600000 implements MigrationInterface {
    name = 'AddAgentResponseStyleOptions1706691600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."ai_agents_responselength_enum" AS ENUM('very_short', 'short', 'medium', 'detailed');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."ai_agents_verbosity_enum" AS ENUM('minimal', 'concise', 'balanced', 'verbose');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Add new columns with defaults
        await queryRunner.query(`
            ALTER TABLE "ai_agents"
            ADD COLUMN IF NOT EXISTS "responseLength" "public"."ai_agents_responselength_enum" NOT NULL DEFAULT 'medium'
        `);

        await queryRunner.query(`
            ALTER TABLE "ai_agents"
            ADD COLUMN IF NOT EXISTS "verbosity" "public"."ai_agents_verbosity_enum" NOT NULL DEFAULT 'balanced'
        `);

        await queryRunner.query(`
            ALTER TABLE "ai_agents"
            ADD COLUMN IF NOT EXISTS "useEmojis" boolean NOT NULL DEFAULT false
        `);

        await queryRunner.query(`
            ALTER TABLE "ai_agents"
            ADD COLUMN IF NOT EXISTS "maxResponseChars" integer NOT NULL DEFAULT 0
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "maxResponseChars"`);
        await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "useEmojis"`);
        await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "verbosity"`);
        await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "responseLength"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."ai_agents_verbosity_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."ai_agents_responselength_enum"`);
    }
}
