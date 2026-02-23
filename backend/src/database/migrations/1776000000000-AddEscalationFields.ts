import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEscalationFields1776000000000 implements MigrationInterface {
  name = "AddEscalationFields1776000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add escalationConfig to ai_agents
    await queryRunner.query(
      `ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "escalationConfig" jsonb DEFAULT '{}'`,
    );

    // Add isHumanControlled to agent_conversations
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "isHumanControlled" boolean DEFAULT false`,
    );

    // Add assignedOperatorId to agent_conversations
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "assignedOperatorId" varchar`,
    );

    // Add escalationReason to agent_conversations
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "escalationReason" text`,
    );

    // Add OPERATOR to message_role enum (agent_messages table)
    // Check if the value already exists before adding
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'operator'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'agent_messages_role_enum')
        ) THEN
          ALTER TYPE "agent_messages_role_enum" ADD VALUE 'operator';
        END IF;
      END
      $$;
    `);

    // Also add to the enums index MessageRole type if it uses a separate enum
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'operator'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'message_role_enum')
        ) THEN
          ALTER TYPE "message_role_enum" ADD VALUE 'operator';
        END IF;
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END
      $$;
    `);

    // Add index for escalated conversations
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CONV_HUMAN_CONTROLLED" ON "agent_conversations" ("isHumanControlled") WHERE "isHumanControlled" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_CONV_HUMAN_CONTROLLED"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "escalationReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "assignedOperatorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "isHumanControlled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP COLUMN IF EXISTS "escalationConfig"`,
    );
    // Note: PostgreSQL does not support removing enum values
  }
}
