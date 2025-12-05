import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBroadcastEntities1759000000000 implements MigrationInterface {
  name = "AddBroadcastEntities1759000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "template_type_enum" AS ENUM ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "template_category_enum" AS ENUM ('welcome', 'promotion', 'reminder', 'notification', 'follow_up', 'thank_you', 'custom');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "campaign_status_enum" AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "recurrence_type_enum" AS ENUM ('none', 'daily', 'weekly', 'monthly');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "broadcast_message_status_enum" AS ENUM ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create broadcast_contacts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "phone_number" character varying NOT NULL,
        "name" character varying NOT NULL,
        "email" character varying,
        "company" character varying,
        "tags" text,
        "custom_fields" jsonb,
        "is_valid_whatsapp" boolean,
        "whatsapp_verified_at" TIMESTAMP,
        "is_subscribed" boolean NOT NULL DEFAULT true,
        "unsubscribed_at" TIMESTAMP,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_contacts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_contacts_phone" ON "broadcast_contacts" ("phone_number")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_broadcast_contacts_org_phone" ON "broadcast_contacts" ("organization_id", "phone_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_contacts"
      ADD CONSTRAINT "FK_broadcast_contacts_organization"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    // Create message_templates table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "message_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid,
        "name" character varying NOT NULL,
        "description" text,
        "type" "template_type_enum" NOT NULL DEFAULT 'text',
        "category" "template_category_enum" NOT NULL DEFAULT 'custom',
        "content" text NOT NULL,
        "media_url" character varying,
        "caption" text,
        "filename" character varying,
        "latitude" decimal(10,8),
        "longitude" decimal(11,8),
        "location_name" character varying,
        "contact_info" jsonb,
        "variables" text,
        "is_system" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "usage_count" integer NOT NULL DEFAULT 0,
        "last_used_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_message_templates_org_name" ON "message_templates" ("organization_id", "name") WHERE "organization_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "message_templates"
      ADD CONSTRAINT "FK_message_templates_organization"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    // Create broadcast_campaigns table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "template_id" uuid,
        "name" character varying NOT NULL,
        "description" text,
        "status" "campaign_status_enum" NOT NULL DEFAULT 'draft',
        "message_content" jsonb,
        "contact_filter" jsonb,
        "contact_ids" text,
        "scheduled_at" TIMESTAMP,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "recurrence_type" "recurrence_type_enum" NOT NULL DEFAULT 'none',
        "recurrence_day" integer,
        "recurrence_time" character varying,
        "recurrence_end_date" TIMESTAMP,
        "next_run_at" TIMESTAMP,
        "stats" jsonb NOT NULL DEFAULT '{"total":0,"pending":0,"sent":0,"delivered":0,"read":0,"failed":0}',
        "delay_between_messages" integer NOT NULL DEFAULT 3000,
        "messages_per_batch" integer NOT NULL DEFAULT 50,
        "batch_delay" integer NOT NULL DEFAULT 60000,
        "last_error" text,
        "error_count" integer NOT NULL DEFAULT 0,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_campaigns" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_campaigns_status" ON "broadcast_campaigns" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_campaigns"
      ADD CONSTRAINT "FK_broadcast_campaigns_organization"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_campaigns"
      ADD CONSTRAINT "FK_broadcast_campaigns_session"
      FOREIGN KEY ("session_id") REFERENCES "whatsapp_sessions"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_campaigns"
      ADD CONSTRAINT "FK_broadcast_campaigns_template"
      FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL
    `);

    // Create broadcast_messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "contact_id" uuid NOT NULL,
        "phone_number" character varying NOT NULL,
        "status" "broadcast_message_status_enum" NOT NULL DEFAULT 'pending',
        "whatsapp_message_id" character varying,
        "rendered_content" text,
        "queued_at" TIMESTAMP,
        "sent_at" TIMESTAMP,
        "delivered_at" TIMESTAMP,
        "read_at" TIMESTAMP,
        "failed_at" TIMESTAMP,
        "error_message" text,
        "error_code" character varying,
        "retry_count" integer NOT NULL DEFAULT 0,
        "max_retries" integer NOT NULL DEFAULT 3,
        "next_retry_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_messages" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_messages_campaign_status" ON "broadcast_messages" ("campaign_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_messages_contact" ON "broadcast_messages" ("contact_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_messages_status" ON "broadcast_messages" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_messages"
      ADD CONSTRAINT "FK_broadcast_messages_campaign"
      FOREIGN KEY ("campaign_id") REFERENCES "broadcast_campaigns"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "broadcast_messages"
      ADD CONSTRAINT "FK_broadcast_messages_contact"
      FOREIGN KEY ("contact_id") REFERENCES "broadcast_contacts"("id") ON DELETE CASCADE
    `);

    // Create api_keys table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "key_hash" character varying NOT NULL,
        "key_prefix" character varying NOT NULL,
        "permissions" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "expires_at" TIMESTAMP,
        "rate_limit_per_minute" integer NOT NULL DEFAULT 60,
        "rate_limit_per_day" integer NOT NULL DEFAULT 10000,
        "last_used_at" TIMESTAMP,
        "last_used_ip" character varying,
        "total_requests" integer NOT NULL DEFAULT 0,
        "allowed_ips" text,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_api_keys_key_hash" ON "api_keys" ("key_hash")
    `);

    await queryRunner.query(`
      ALTER TABLE "api_keys"
      ADD CONSTRAINT "FK_api_keys_organization"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    // Create webhook_configs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "url" character varying NOT NULL,
        "secret" character varying NOT NULL,
        "events" text NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "headers" jsonb,
        "max_retries" integer NOT NULL DEFAULT 3,
        "retry_delay" integer NOT NULL DEFAULT 5000,
        "last_triggered_at" TIMESTAMP,
        "last_success_at" TIMESTAMP,
        "last_failure_at" TIMESTAMP,
        "last_error" text,
        "consecutive_failures" integer NOT NULL DEFAULT 0,
        "total_triggered" integer NOT NULL DEFAULT 0,
        "total_success" integer NOT NULL DEFAULT 0,
        "total_failures" integer NOT NULL DEFAULT 0,
        "auto_disabled" boolean NOT NULL DEFAULT false,
        "auto_disable_threshold" integer NOT NULL DEFAULT 10,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_configs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhook_configs_org_url" ON "webhook_configs" ("organization_id", "url")
    `);

    await queryRunner.query(`
      ALTER TABLE "webhook_configs"
      ADD CONSTRAINT "FK_webhook_configs_organization"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`ALTER TABLE "webhook_configs" DROP CONSTRAINT IF EXISTS "FK_webhook_configs_organization"`);
    await queryRunner.query(`ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "FK_api_keys_organization"`);
    await queryRunner.query(`ALTER TABLE "broadcast_messages" DROP CONSTRAINT IF EXISTS "FK_broadcast_messages_contact"`);
    await queryRunner.query(`ALTER TABLE "broadcast_messages" DROP CONSTRAINT IF EXISTS "FK_broadcast_messages_campaign"`);
    await queryRunner.query(`ALTER TABLE "broadcast_campaigns" DROP CONSTRAINT IF EXISTS "FK_broadcast_campaigns_template"`);
    await queryRunner.query(`ALTER TABLE "broadcast_campaigns" DROP CONSTRAINT IF EXISTS "FK_broadcast_campaigns_session"`);
    await queryRunner.query(`ALTER TABLE "broadcast_campaigns" DROP CONSTRAINT IF EXISTS "FK_broadcast_campaigns_organization"`);
    await queryRunner.query(`ALTER TABLE "message_templates" DROP CONSTRAINT IF EXISTS "FK_message_templates_organization"`);
    await queryRunner.query(`ALTER TABLE "broadcast_contacts" DROP CONSTRAINT IF EXISTS "FK_broadcast_contacts_organization"`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_configs_org_url"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_keys_key_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_messages_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_messages_contact"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_messages_campaign_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_campaigns_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_message_templates_org_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_contacts_org_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_contacts_phone"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_contacts"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "broadcast_message_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "recurrence_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "campaign_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "template_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "template_type_enum"`);
  }
}
