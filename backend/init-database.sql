-- Create database schema for WizeApp
-- Run this script to initialize all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enums
CREATE TYPE IF NOT EXISTS user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE IF NOT EXISTS subscription_plan AS ENUM ('free', 'standard', 'pro', 'enterprise');
CREATE TYPE IF NOT EXISTS subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing');

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    description TEXT,
    logo VARCHAR(500),
    website VARCHAR(500),
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    avatar VARCHAR(500),
    "emailVerified" BOOLEAN DEFAULT FALSE,
    "verificationToken" VARCHAR(255),
    "resetPasswordToken" VARCHAR(255),
    "resetPasswordExpires" TIMESTAMP,
    "googleId" VARCHAR(255),
    "microsoftId" VARCHAR(255),
    "facebookId" VARCHAR(255),
    "lastLoginAt" TIMESTAMP,
    "isActive" BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Organization members table
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role user_role NOT NULL DEFAULT 'member',
    "invitedBy" UUID,
    "invitedAt" TIMESTAMP,
    "joinedAt" TIMESTAMP,
    permissions JSONB DEFAULT '[]'::jsonb,
    "organizationId" UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE("organizationId", "userId")
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    plan subscription_plan NOT NULL DEFAULT 'free',
    status subscription_status NOT NULL DEFAULT 'active',
    "trialEndsAt" TIMESTAMP,
    "currentPeriodStart" TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP,
    "canceledAt" TIMESTAMP,
    "stripeCustomerId" VARCHAR(255),
    "stripeSubscriptionId" VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE
);

-- WhatsApp sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(50),
    status VARCHAR(50) DEFAULT 'disconnected',
    "qrCode" TEXT,
    "sessionData" TEXT,
    "lastConnectedAt" TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    "isActive" BOOLEAN DEFAULT TRUE,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
    "knowledgeBaseId" UUID,
    "agentId" UUID
);

-- AI Tables
CREATE TYPE IF NOT EXISTS knowledge_base_status_enum AS ENUM('active', 'inactive', 'processing');
CREATE TYPE IF NOT EXISTS document_type_enum AS ENUM('pdf', 'docx', 'txt', 'md', 'image', 'video', 'audio', 'url');
CREATE TYPE IF NOT EXISTS document_status_enum AS ENUM('uploaded', 'processing', 'processed', 'failed', 'archived');
CREATE TYPE IF NOT EXISTS agent_status_enum AS ENUM('active', 'inactive', 'training', 'maintenance');
CREATE TYPE IF NOT EXISTS agent_language_enum AS ENUM('en', 'fr', 'es', 'ar');
CREATE TYPE IF NOT EXISTS agent_tone_enum AS ENUM('professional', 'friendly', 'casual', 'formal', 'empathetic', 'technical');
CREATE TYPE IF NOT EXISTS conversation_status_enum AS ENUM('active', 'completed', 'abandoned', 'archived');
CREATE TYPE IF NOT EXISTS conversation_channel_enum AS ENUM('whatsapp', 'web_chat', 'api', 'phone', 'email');
CREATE TYPE IF NOT EXISTS message_role_enum AS ENUM('user', 'agent', 'system');
CREATE TYPE IF NOT EXISTS message_status_enum AS ENUM('sent', 'delivered', 'read', 'failed');
CREATE TYPE IF NOT EXISTS provider_type_enum AS ENUM('deepseek', 'mistral', 'llama', 'openai', 'custom');
CREATE TYPE IF NOT EXISTS provider_status_enum AS ENUM('active', 'inactive', 'maintenance', 'error');
CREATE TYPE IF NOT EXISTS deployment_type_enum AS ENUM('self_hosted', 'cloud_api', 'hybrid');

-- Knowledge bases table
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status knowledge_base_status_enum DEFAULT 'active',
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    stats JSONB DEFAULT '{}'::jsonb,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- Knowledge documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    type document_type_enum NOT NULL,
    status document_status_enum DEFAULT 'uploaded',
    url VARCHAR(1000),
    "fileSize" INTEGER,
    "mimeType" VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    "processedAt" TIMESTAMP,
    "chunkCount" INTEGER DEFAULT 0,
    "knowledgeBaseId" UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- Document chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    content TEXT NOT NULL,
    "chunkOrder" INTEGER NOT NULL,
    embedding JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    "documentId" UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE
);

-- AI agents table
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status agent_status_enum DEFAULT 'active',
    language agent_language_enum DEFAULT 'en',
    tone agent_tone_enum DEFAULT 'professional',
    instructions TEXT,
    "welcomeMessage" TEXT,
    "fallbackMessage" TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    faq JSONB DEFAULT '[]'::jsonb,
    version INTEGER DEFAULT 1,
    tags TEXT[] DEFAULT '{}',
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE,
    "createdBy" UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Agent conversations table
CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    title VARCHAR(500),
    status conversation_status_enum DEFAULT 'active',
    channel conversation_channel_enum NOT NULL,
    "externalId" VARCHAR(255),
    context JSONB DEFAULT '{}'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    "startedAt" TIMESTAMP DEFAULT NOW(),
    "endedAt" TIMESTAMP,
    tags TEXT[] DEFAULT '{}',
    "agentId" UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Agent messages table
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    content TEXT NOT NULL,
    role message_role_enum NOT NULL,
    status message_status_enum DEFAULT 'sent',
    "sequenceNumber" INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    "externalMessageId" VARCHAR(255),
    "deliveredAt" TIMESTAMP,
    "readAt" TIMESTAMP,
    "conversationId" UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE
);

-- LLM providers table
CREATE TABLE IF NOT EXISTS llm_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(255) NOT NULL,
    type provider_type_enum NOT NULL,
    status provider_status_enum DEFAULT 'active',
    "deploymentType" deployment_type_enum NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    priority INTEGER DEFAULT 1,
    metrics JSONB DEFAULT '{}'::jsonb,
    "healthCheck" JSONB DEFAULT '{}'::jsonb,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- Usage metrics table
CREATE TABLE IF NOT EXISTS usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "metricType" VARCHAR(50) NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    period VARCHAR(20),
    metadata JSONB DEFAULT '{}'::jsonb,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE,
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100),
    "entityId" UUID,
    details JSONB DEFAULT '{}'::jsonb,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
    "organizationId" UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_org ON whatsapp_sessions("organizationId");
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user ON whatsapp_sessions("userId");
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_org ON knowledge_bases("organizationId");
CREATE INDEX IF NOT EXISTS idx_ai_agents_org ON ai_agents("organizationId");
CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent ON agent_conversations("agentId");
CREATE INDEX IF NOT EXISTS idx_llm_providers_org ON llm_providers("organizationId");

-- Create default admin user (change password after first login!)
INSERT INTO users (email, password, "firstName", "lastName", "emailVerified", "isActive")
VALUES ('admin@wizeapp.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY3pPF3I/PscUr6', 'Admin', 'User', true, true)
ON CONFLICT (email) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO wizeapp;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO wizeapp;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO wizeapp;