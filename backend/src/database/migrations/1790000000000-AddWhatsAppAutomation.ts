import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsAppAutomation1790000000000 implements MigrationInterface {
  name = "AddWhatsAppAutomation1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-session automation switches (auto-read, call rejection, voice
    // replies, presence tracking…). JSON so new switches need no migration.
    await queryRunner.query(`
      ALTER TABLE "whatsapp_sessions"
      ADD COLUMN IF NOT EXISTS "automation" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    // Channel / status / group posts published later by the queue.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_scheduled_posts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "sessionId" uuid NOT NULL,
        "organizationId" uuid,
        "createdBy" varchar,
        "kind" varchar NOT NULL,
        "target" varchar,
        "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "audience" jsonb,
        "scheduledAt" timestamptz NOT NULL,
        "cron" varchar,
        "status" varchar NOT NULL DEFAULT 'scheduled',
        "jobId" varchar,
        "lastRunAt" timestamptz,
        "result" jsonb,
        "error" text,
        CONSTRAINT "PK_whatsapp_scheduled_posts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_WA_SCHEDULED_SESSION" ON "whatsapp_scheduled_posts" ("sessionId", "status")`,
    );

    // Polls we sent, with the votes aggregated from the updates WhatsApp sends.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_polls" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "sessionId" uuid NOT NULL,
        "chatJid" varchar NOT NULL,
        "messageId" varchar NOT NULL,
        "question" varchar NOT NULL,
        "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "selectableCount" integer NOT NULL DEFAULT 1,
        "pollMessage" jsonb,
        "votes" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "voterCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_whatsapp_polls" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_WA_POLL_MESSAGE" ON "whatsapp_polls" ("sessionId", "messageId")`,
    );

    // WhatsApp Business labels, mirrored from the app-state sync so the
    // dashboard can offer them by name.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_labels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "sessionId" uuid NOT NULL,
        "labelId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "color" integer,
        "predefinedId" varchar,
        "deleted" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_whatsapp_labels" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_WA_LABEL_SESSION" ON "whatsapp_labels" ("sessionId", "labelId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_labels"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_polls"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_scheduled_posts"`);
    await queryRunner.query(`ALTER TABLE "whatsapp_sessions" DROP COLUMN IF EXISTS "automation"`);
  }
}
