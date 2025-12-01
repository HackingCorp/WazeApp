import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAIAgentSupport1737057692000 implements MigrationInterface {
  name = "AddAIAgentSupport1737057692000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "knowledge_base_status_enum" AS ENUM('active', 'inactive', 'processing');
    `);

    await queryRunner.query(`
      CREATE TYPE "document_type_enum" AS ENUM('pdf', 'docx', 'txt', 'md', 'image', 'video', 'audio', 'url');
    `);

    await queryRunner.query(`
      CREATE TYPE "document_status_enum" AS ENUM('uploaded', 'processing', 'processed', 'failed', 'archived');
    `);

    await queryRunner.query(`
      CREATE TYPE "agent_status_enum" AS ENUM('active', 'inactive', 'training', 'maintenance');
    `);

    await queryRunner.query(`
      CREATE TYPE "agent_language_enum" AS ENUM('en', 'fr', 'es', 'ar');
    `);

    await queryRunner.query(`
      CREATE TYPE "agent_tone_enum" AS ENUM('professional', 'friendly', 'casual', 'formal', 'empathetic', 'technical');
    `);

    await queryRunner.query(`
      CREATE TYPE "conversation_status_enum" AS ENUM('active', 'completed', 'abandoned', 'archived');
    `);

    await queryRunner.query(`
      CREATE TYPE "conversation_channel_enum" AS ENUM('whatsapp', 'web_chat', 'api', 'phone', 'email');
    `);

    await queryRunner.query(`
      CREATE TYPE "message_role_enum" AS ENUM('user', 'agent', 'system');
    `);

    await queryRunner.query(`
      CREATE TYPE "message_status_enum" AS ENUM('sent', 'delivered', 'read', 'failed');
    `);

    await queryRunner.query(`
      CREATE TYPE "provider_type_enum" AS ENUM('deepseek', 'mistral', 'llama', 'openai', 'custom');
    `);

    await queryRunner.query(`
      CREATE TYPE "provider_status_enum" AS ENUM('active', 'inactive', 'maintenance', 'error');
    `);

    await queryRunner.query(`
      CREATE TYPE "deployment_type_enum" AS ENUM('self_hosted', 'cloud_api', 'hybrid');
    `);

    // Create knowledge_bases table
    await queryRunner.query(`
      CREATE TABLE "knowledge_bases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "description" text,
        "status" "knowledge_base_status_enum" NOT NULL DEFAULT 'active',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "totalCharacters" integer NOT NULL DEFAULT '0',
        "documentCount" integer NOT NULL DEFAULT '0',
        "version" integer NOT NULL DEFAULT '1',
        "tags" text array NOT NULL DEFAULT '{}',
        "organizationId" uuid NOT NULL,
        "createdBy" uuid,
        CONSTRAINT "PK_knowledge_bases" PRIMARY KEY ("id")
      );
    `);

    // Create knowledge_documents table
    await queryRunner.query(`
      CREATE TABLE "knowledge_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "filename" character varying NOT NULL,
        "title" character varying NOT NULL,
        "type" "document_type_enum" NOT NULL,
        "fileSize" integer NOT NULL,
        "mimeType" character varying NOT NULL,
        "filePath" character varying NOT NULL,
        "status" "document_status_enum" NOT NULL DEFAULT 'uploaded',
        "content" text,
        "characterCount" integer NOT NULL DEFAULT '0',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "processingError" jsonb,
        "tags" text array NOT NULL DEFAULT '{}',
        "version" integer NOT NULL DEFAULT '1',
        "contentHash" character varying,
        "knowledgeBaseId" uuid NOT NULL,
        "uploadedBy" uuid,
        CONSTRAINT "PK_knowledge_documents" PRIMARY KEY ("id")
      );
    `);

    // Create document_chunks table
    await queryRunner.query(`
      CREATE TABLE "document_chunks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "content" text NOT NULL,
        "chunkOrder" integer NOT NULL,
        "characterCount" integer NOT NULL,
        "tokenCount" integer NOT NULL DEFAULT '0',
        "startPosition" integer NOT NULL DEFAULT '0',
        "endPosition" integer NOT NULL DEFAULT '0',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "documentId" uuid NOT NULL,
        CONSTRAINT "PK_document_chunks" PRIMARY KEY ("id")
      );
    `);

    // Create ai_agents table
    await queryRunner.query(`
      CREATE TABLE "ai_agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "description" text,
        "avatarUrl" character varying,
        "status" "agent_status_enum" NOT NULL DEFAULT 'active',
        "primaryLanguage" "agent_language_enum" NOT NULL DEFAULT 'en',
        "supportedLanguages" "agent_language_enum" array NOT NULL DEFAULT '{en}',
        "tone" "agent_tone_enum" NOT NULL DEFAULT 'professional',
        "systemPrompt" text NOT NULL,
        "welcomeMessage" text,
        "fallbackMessage" text,
        "config" jsonb NOT NULL DEFAULT '{}',
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "faq" jsonb NOT NULL DEFAULT '[]',
        "version" integer NOT NULL DEFAULT '1',
        "tags" text array NOT NULL DEFAULT '{}',
        "organizationId" uuid NOT NULL,
        "createdBy" uuid,
        CONSTRAINT "PK_ai_agents" PRIMARY KEY ("id")
      );
    `);

    // Create agent_conversations table
    await queryRunner.query(`
      CREATE TABLE "agent_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "title" character varying,
        "status" "conversation_status_enum" NOT NULL DEFAULT 'active',
        "channel" "conversation_channel_enum" NOT NULL,
        "externalId" character varying,
        "context" jsonb NOT NULL DEFAULT '{}',
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "tags" text array NOT NULL DEFAULT '{}',
        "agentId" uuid NOT NULL,
        "userId" uuid,
        CONSTRAINT "PK_agent_conversations" PRIMARY KEY ("id")
      );
    `);

    // Create agent_messages table
    await queryRunner.query(`
      CREATE TABLE "agent_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "content" text NOT NULL,
        "role" "message_role_enum" NOT NULL,
        "status" "message_status_enum" NOT NULL DEFAULT 'sent',
        "sequenceNumber" integer NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "externalMessageId" character varying,
        "deliveredAt" TIMESTAMP WITH TIME ZONE,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "conversationId" uuid NOT NULL,
        CONSTRAINT "PK_agent_messages" PRIMARY KEY ("id")
      );
    `);

    // Create llm_providers table
    await queryRunner.query(`
      CREATE TABLE "llm_providers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "type" "provider_type_enum" NOT NULL,
        "status" "provider_status_enum" NOT NULL DEFAULT 'active',
        "deploymentType" "deployment_type_enum" NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}',
        "priority" integer NOT NULL DEFAULT '1',
        "metrics" jsonb NOT NULL DEFAULT '{}',
        "healthCheck" jsonb NOT NULL DEFAULT '{}',
        "organizationId" uuid,
        CONSTRAINT "PK_llm_providers" PRIMARY KEY ("id")
      );
    `);

    // Create agent_knowledge_bases junction table
    await queryRunner.query(`
      CREATE TABLE "agent_knowledge_bases" (
        "agentId" uuid NOT NULL,
        "knowledgeBaseId" uuid NOT NULL,
        CONSTRAINT "PK_agent_knowledge_bases" PRIMARY KEY ("agentId", "knowledgeBaseId")
      );
    `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_KB_ORG" ON "knowledge_bases" ("organizationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_KB_NAME" ON "knowledge_bases" ("name", "organizationId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_DOC_KB" ON "knowledge_documents" ("knowledgeBaseId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_DOC_TYPE" ON "knowledge_documents" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_DOC_STATUS" ON "knowledge_documents" ("status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_CHUNK_DOC" ON "document_chunks" ("documentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CHUNK_ORDER" ON "document_chunks" ("documentId", "chunkOrder")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_ORG" ON "ai_agents" ("organizationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AGENT_NAME" ON "ai_agents" ("name", "organizationId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_CONV_AGENT" ON "agent_conversations" ("agentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CONV_USER" ON "agent_conversations" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CONV_STATUS" ON "agent_conversations" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CONV_CHANNEL" ON "agent_conversations" ("channel")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_MSG_CONV" ON "agent_messages" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_MSG_ROLE" ON "agent_messages" ("role")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_MSG_TIMESTAMP" ON "agent_messages" ("createdAt")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_PROVIDER_ORG" ON "llm_providers" ("organizationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_PROVIDER_TYPE" ON "llm_providers" ("type")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_AKB_AGENT" ON "agent_knowledge_bases" ("agentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_AKB_KB" ON "agent_knowledge_bases" ("knowledgeBaseId")`,
    );

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "knowledge_bases" 
      ADD CONSTRAINT "FK_knowledge_bases_organization" 
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "knowledge_bases" 
      ADD CONSTRAINT "FK_knowledge_bases_creator" 
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "knowledge_documents" 
      ADD CONSTRAINT "FK_knowledge_documents_knowledge_base" 
      FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "knowledge_documents" 
      ADD CONSTRAINT "FK_knowledge_documents_uploader" 
      FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "document_chunks" 
      ADD CONSTRAINT "FK_document_chunks_document" 
      FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_agents" 
      ADD CONSTRAINT "FK_ai_agents_organization" 
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_agents" 
      ADD CONSTRAINT "FK_ai_agents_creator" 
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      ADD CONSTRAINT "FK_agent_conversations_agent" 
      FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_conversations" 
      ADD CONSTRAINT "FK_agent_conversations_user" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_messages" 
      ADD CONSTRAINT "FK_agent_messages_conversation" 
      FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "llm_providers" 
      ADD CONSTRAINT "FK_llm_providers_organization" 
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_knowledge_bases" 
      ADD CONSTRAINT "FK_agent_knowledge_bases_agent" 
      FOREIGN KEY ("agentId") REFERENCES "ai_agents"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_knowledge_bases" 
      ADD CONSTRAINT "FK_agent_knowledge_bases_knowledge_base" 
      FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE
    `);

    // Update subscriptions table with new limits and features
    await queryRunner.query(`
      UPDATE "subscriptions" 
      SET "limits" = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set("limits", '{maxKnowledgeBases}', '1'),
                '{maxLLMTokensPerMonth}', '10000'
              ),
              '{maxVectorSearches}', '500'
            ),
            '{maxConversationsPerMonth}', '50'
          ),
          '{maxDocumentsPerKB}', '50'
        ),
        '{maxFileUploadSize}', '10485760'
      )
      WHERE "limits" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "subscriptions" 
      SET "features" = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set("features", '{advancedLLMs}', 'false'),
                  '{premiumVectorSearch}', 'false'
                ),
                '{functionCalling}', 'false'
              ),
              '{imageAnalysis}', 'false'
            ),
            '{customEmbeddings}', 'false'
          ),
          '{webhooks}', 'false'
        ),
        '{sso}', 'false'
      )
      WHERE "features" IS NOT NULL
    `);

    // Add new usage metric types
    await queryRunner.query(`
      ALTER TYPE "usage_metric_type_enum" ADD VALUE IF NOT EXISTS 'llm_tokens';
    `);
    await queryRunner.query(`
      ALTER TYPE "usage_metric_type_enum" ADD VALUE IF NOT EXISTS 'ai_conversations';
    `);
    await queryRunner.query(`
      ALTER TYPE "usage_metric_type_enum" ADD VALUE IF NOT EXISTS 'vector_searches';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "agent_knowledge_bases" DROP CONSTRAINT "FK_agent_knowledge_bases_knowledge_base"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_knowledge_bases" DROP CONSTRAINT "FK_agent_knowledge_bases_agent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "llm_providers" DROP CONSTRAINT "FK_llm_providers_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_messages" DROP CONSTRAINT "FK_agent_messages_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP CONSTRAINT "FK_agent_conversations_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_conversations" DROP CONSTRAINT "FK_agent_conversations_agent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP CONSTRAINT "FK_ai_agents_creator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_agents" DROP CONSTRAINT "FK_ai_agents_organization"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP CONSTRAINT "FK_document_chunks_document"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_documents" DROP CONSTRAINT "FK_knowledge_documents_uploader"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_documents" DROP CONSTRAINT "FK_knowledge_documents_knowledge_base"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" DROP CONSTRAINT "FK_knowledge_bases_creator"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_bases" DROP CONSTRAINT "FK_knowledge_bases_organization"`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE "agent_knowledge_bases"`);
    await queryRunner.query(`DROP TABLE "llm_providers"`);
    await queryRunner.query(`DROP TABLE "agent_messages"`);
    await queryRunner.query(`DROP TABLE "agent_conversations"`);
    await queryRunner.query(`DROP TABLE "ai_agents"`);
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(`DROP TABLE "knowledge_documents"`);
    await queryRunner.query(`DROP TABLE "knowledge_bases"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "deployment_type_enum"`);
    await queryRunner.query(`DROP TYPE "provider_status_enum"`);
    await queryRunner.query(`DROP TYPE "provider_type_enum"`);
    await queryRunner.query(`DROP TYPE "message_status_enum"`);
    await queryRunner.query(`DROP TYPE "message_role_enum"`);
    await queryRunner.query(`DROP TYPE "conversation_channel_enum"`);
    await queryRunner.query(`DROP TYPE "conversation_status_enum"`);
    await queryRunner.query(`DROP TYPE "agent_tone_enum"`);
    await queryRunner.query(`DROP TYPE "agent_language_enum"`);
    await queryRunner.query(`DROP TYPE "agent_status_enum"`);
    await queryRunner.query(`DROP TYPE "document_status_enum"`);
    await queryRunner.query(`DROP TYPE "document_type_enum"`);
    await queryRunner.query(`DROP TYPE "knowledge_base_status_enum"`);
  }
}
