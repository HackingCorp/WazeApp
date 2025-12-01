import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKnowledgeBaseToWhatsAppSession1754985870640
  implements MigrationInterface
{
  name = "AddKnowledgeBaseToWhatsAppSession1754985870640";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_agent_messages_conversation"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_agent_conversations_external_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD "knowledgeBaseId" uuid`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."llm_providers_type_enum" RENAME TO "llm_providers_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."llm_providers_type_enum" AS ENUM('deepseek', 'mistral', 'llama', 'openai', 'anthropic', 'ollama', 'custom')`,
    );
    await queryRunner.query(
      `ALTER TABLE "llm_providers" ALTER COLUMN "type" TYPE "public"."llm_providers_type_enum" USING "type"::"text"::"public"."llm_providers_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."llm_providers_type_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "FK_fd107814fca5f87d29687335f19" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP CONSTRAINT "FK_fd107814fca5f87d29687335f19"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."llm_providers_type_enum_old" AS ENUM('anthropic', 'custom', 'deepseek', 'llama', 'mistral', 'openai')`,
    );
    await queryRunner.query(
      `ALTER TABLE "llm_providers" ALTER COLUMN "type" TYPE "public"."llm_providers_type_enum_old" USING "type"::"text"::"public"."llm_providers_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."llm_providers_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."llm_providers_type_enum_old" RENAME TO "llm_providers_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" DROP COLUMN "knowledgeBaseId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_conversations_external_user" ON "agent_conversations" ("externalId", "userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_messages_conversation" ON "agent_messages" ("createdAt", "conversationId") `,
    );
  }
}
