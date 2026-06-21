import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLeads1788000000000 implements MigrationInterface {
  name = "AddLeads1788000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum types
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "leads_status_enum" AS ENUM ('new','cold','warm','hot','customer','lost');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "leads_source_enum" AS ENUM ('whatsapp_ai','facebook_ai','dashboard','api');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // Leads table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "clientPhoneNumber" character varying NOT NULL,
        "clientName" character varying,
        "clientEmail" character varying,
        "status" "leads_status_enum" NOT NULL DEFAULT 'new',
        "score" integer NOT NULL DEFAULT 0,
        "source" "leads_source_enum" NOT NULL DEFAULT 'whatsapp_ai',
        "interest" text,
        "needSummary" text,
        "signals" jsonb NOT NULL DEFAULT '{}',
        "tags" text array NOT NULL DEFAULT '{}',
        "lastInteractionAt" TIMESTAMP WITH TIME ZONE,
        "reportedAt" TIMESTAMP WITH TIME ZONE,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "organizationId" uuid,
        "agentId" uuid,
        "conversationId" uuid,
        CONSTRAINT "PK_leads_id" PRIMARY KEY ("id")
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEAD_ORG" ON "leads" ("organizationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEAD_STATUS" ON "leads" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEAD_CLIENT_PHONE" ON "leads" ("clientPhoneNumber")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_LEAD_ORG_PHONE" ON "leads" ("organizationId", "clientPhoneNumber")`);

    // Foreign keys (best-effort; skip if referenced tables differ)
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "leads" ADD CONSTRAINT "FK_lead_org" FOREIGN KEY ("organizationId")
          REFERENCES "organizations"("id") ON DELETE CASCADE;
      EXCEPTION WHEN others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "leads" ADD CONSTRAINT "FK_lead_agent" FOREIGN KEY ("agentId")
          REFERENCES "ai_agents"("id") ON DELETE SET NULL;
      EXCEPTION WHEN others THEN null; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "leads" ADD CONSTRAINT "FK_lead_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "agent_conversations"("id") ON DELETE SET NULL;
      EXCEPTION WHEN others THEN null; END $$;
    `);

    // Agent config column
    await queryRunner.query(`
      ALTER TABLE "ai_agents"
      ADD COLUMN IF NOT EXISTS "leadQualificationConfig" jsonb NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "leadQualificationConfig"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leads"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leads_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leads_status_enum"`);
  }
}
