import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookSupport1783000000001 implements MigrationInterface {
  name = 'AddFacebookSupport1783000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add 'facebook' value to the conversation channel enum
    // TypeORM may name it differently depending on how schema was created
    const enumName = await queryRunner.query(`
      SELECT t.typname FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE e.enumlabel = 'whatsapp'
      AND t.typname LIKE '%channel%'
      LIMIT 1;
    `);
    const typeName = enumName?.[0]?.typname || 'agent_conversations_channel_enum';
    await queryRunner.query(`
      ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'facebook';
    `);

    // 2. Create FacebookPageSessionStatus enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "facebook_page_session_status_enum" AS ENUM ('disconnected', 'connecting', 'connected', 'failed', 'suspended');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3. Create facebook_page_sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_page_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "pageId" character varying NOT NULL,
        "pageName" character varying,
        "pageUsername" character varying,
        "pageAvatarUrl" character varying,
        "status" "facebook_page_session_status_enum" NOT NULL DEFAULT 'disconnected',
        "pageAccessToken" text,
        "tokenExpiresAt" TIMESTAMP,
        "userAccessToken" text,
        "lastConnectionAttempt" TIMESTAMP,
        "retryCount" integer NOT NULL DEFAULT 0,
        "lastSeenAt" TIMESTAMP,
        "isActive" boolean NOT NULL DEFAULT false,
        "autoReconnect" boolean NOT NULL DEFAULT true,
        "aiResponsesEnabled" boolean DEFAULT true,
        "commentAutoReplyEnabled" boolean NOT NULL DEFAULT true,
        "webhookVerifyToken" character varying,
        "config" jsonb NOT NULL DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "grantedScopes" text[] NOT NULL DEFAULT '{}',
        "userId" uuid NOT NULL,
        "organizationId" uuid,
        "agentId" uuid,
        "knowledgeBaseId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_facebook_page_sessions" PRIMARY KEY ("id")
      )
    `);

    // 4. Create unique index on pageId
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_FACEBOOK_PAGE_ID_UNIQUE" ON "facebook_page_sessions" ("pageId")
    `);

    // 5. Create indexes for facebook_page_sessions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FACEBOOK_ORG" ON "facebook_page_sessions" ("organizationId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FACEBOOK_USER" ON "facebook_page_sessions" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FACEBOOK_STATUS" ON "facebook_page_sessions" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FACEBOOK_PAGE_ID" ON "facebook_page_sessions" ("pageId")
    `);

    // 6. Add foreign key constraints for facebook_page_sessions
    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions"
      ADD CONSTRAINT "FK_facebook_page_sessions_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions"
      ADD CONSTRAINT "FK_facebook_page_sessions_organization"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions"
      ADD CONSTRAINT "FK_facebook_page_sessions_agent"
      FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions"
      ADD CONSTRAINT "FK_facebook_page_sessions_knowledge_base"
      FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL
    `);

    // 7. Create facebook_contacts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "facebookUserId" character varying NOT NULL,
        "name" character varying,
        "profilePictureUrl" character varying,
        "username" character varying,
        "email" character varying,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "tags" text[] NOT NULL DEFAULT '{}',
        "notes" text,
        "isBlocked" boolean NOT NULL DEFAULT false,
        "lastSeenAt" TIMESTAMP,
        "sessionId" uuid NOT NULL,
        "userId" uuid,
        "organizationId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_facebook_contacts" PRIMARY KEY ("id")
      )
    `);

    // 8. Create unique constraint for facebook_contacts
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_FB_CONTACT_SESSION_USER" ON "facebook_contacts" ("sessionId", "facebookUserId")
    `);

    // 9. Create indexes for facebook_contacts
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FB_CONTACT_ORG" ON "facebook_contacts" ("organizationId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FB_CONTACT_SESSION" ON "facebook_contacts" ("sessionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_FB_CONTACT_FACEBOOK_ID" ON "facebook_contacts" ("facebookUserId")
    `);

    // 10. Add foreign key constraints for facebook_contacts
    await queryRunner.query(`
      ALTER TABLE "facebook_contacts"
      ADD CONSTRAINT "FK_facebook_contacts_session"
      FOREIGN KEY ("sessionId") REFERENCES "facebook_page_sessions"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_contacts"
      ADD CONSTRAINT "FK_facebook_contacts_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_contacts"
      ADD CONSTRAINT "FK_facebook_contacts_organization"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    // 11. Add Facebook quota columns to plans table
    await queryRunner.query(`
      ALTER TABLE "plans"
      ADD COLUMN IF NOT EXISTS "featureFacebook" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "plans"
      ADD COLUMN IF NOT EXISTS "maxFacebookComments" integer NOT NULL DEFAULT 0
    `);

    // 12. Enable Facebook for PRO and ENTERPRISE plans
    await queryRunner.query(`
      UPDATE "plans"
      SET "featureFacebook" = true, "maxFacebookComments" = 1000
      WHERE "code" IN ('pro', 'enterprise')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop Facebook quota columns from plans table
    await queryRunner.query(`
      ALTER TABLE "plans" DROP COLUMN IF EXISTS "maxFacebookComments"
    `);

    await queryRunner.query(`
      ALTER TABLE "plans" DROP COLUMN IF EXISTS "featureFacebook"
    `);

    // Drop foreign key constraints for facebook_contacts
    await queryRunner.query(`
      ALTER TABLE "facebook_contacts" DROP CONSTRAINT IF EXISTS "FK_facebook_contacts_organization"
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_contacts" DROP CONSTRAINT IF EXISTS "FK_facebook_contacts_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_contacts" DROP CONSTRAINT IF EXISTS "FK_facebook_contacts_session"
    `);

    // Drop indexes for facebook_contacts
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FB_CONTACT_FACEBOOK_ID"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FB_CONTACT_SESSION"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FB_CONTACT_ORG"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_FB_CONTACT_SESSION_USER"
    `);

    // Drop facebook_contacts table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "facebook_contacts"
    `);

    // Drop foreign key constraints for facebook_page_sessions
    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions" DROP CONSTRAINT IF EXISTS "FK_facebook_page_sessions_knowledge_base"
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions" DROP CONSTRAINT IF EXISTS "FK_facebook_page_sessions_agent"
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions" DROP CONSTRAINT IF EXISTS "FK_facebook_page_sessions_organization"
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_page_sessions" DROP CONSTRAINT IF EXISTS "FK_facebook_page_sessions_user"
    `);

    // Drop indexes for facebook_page_sessions
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FACEBOOK_PAGE_ID"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FACEBOOK_STATUS"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FACEBOOK_USER"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FACEBOOK_ORG"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_FACEBOOK_PAGE_ID_UNIQUE"
    `);

    // Drop facebook_page_sessions table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "facebook_page_sessions"
    `);

    // Drop FacebookPageSessionStatus enum
    await queryRunner.query(`
      DROP TYPE IF EXISTS "facebook_page_session_status_enum"
    `);

    // Note: PostgreSQL does not support removing values from enums
    // 'facebook' value will remain in conversation_channel_enum
  }
}
