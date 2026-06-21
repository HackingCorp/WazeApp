import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { User } from "./user.entity";
import { KnowledgeBase } from "./knowledge-base.entity";
import { EcommerceStore } from "./ecommerce-store.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";
import { FacebookPageSession } from "./facebook-page-session.entity";
import {
  AgentStatus,
  AgentLanguage,
  AgentTone,
  ResponseLength,
  VerbosityLevel,
} from "../enums";

@Entity("ai_agents")
@Index("IDX_AGENT_ORG", ["organizationId"])
@Index("IDX_AGENT_NAME", ["name", "organizationId"])
export class AiAgent extends BaseEntity {
  @ApiProperty({ description: "Agent name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Agent description" })
  @Column({ type: "text", nullable: true })
  description?: string;

  @ApiProperty({ description: "Agent avatar URL" })
  @Column({ nullable: true })
  avatarUrl?: string;

  @ApiProperty({ description: "Agent status", enum: AgentStatus })
  @Column({
    type: "enum",
    enum: AgentStatus,
    default: AgentStatus.ACTIVE,
  })
  status: AgentStatus;

  @ApiProperty({ description: "Agent primary language", enum: AgentLanguage })
  @Column({ type: "enum", enum: AgentLanguage, default: AgentLanguage.ENGLISH })
  primaryLanguage: AgentLanguage;

  @ApiProperty({ description: "Agent supported languages" })
  @Column({
    type: "enum",
    enum: AgentLanguage,
    array: true,
    default: [AgentLanguage.ENGLISH],
  })
  supportedLanguages: AgentLanguage[];

  @ApiProperty({ description: "Agent personality tone", enum: AgentTone })
  @Column({ type: "enum", enum: AgentTone, default: AgentTone.PROFESSIONAL })
  tone: AgentTone;

  @ApiProperty({ description: "System prompt template" })
  @Column({ type: "text" })
  systemPrompt: string;

  @ApiProperty({ description: "System prompt version history" })
  @Column({ type: "jsonb", default: [] })
  promptHistory: Array<{
    prompt: string;
    version: number;
    updatedAt: string;
    updatedBy?: string;
  }>;

  @ApiProperty({ description: "Welcome message" })
  @Column({ type: "text", nullable: true })
  welcomeMessage?: string;

  @ApiProperty({ description: "Fallback message when no knowledge found" })
  @Column({ type: "text", nullable: true })
  fallbackMessage?: string;

  @ApiProperty({ description: "Response length preference", enum: ResponseLength })
  @Column({ type: "enum", enum: ResponseLength, default: ResponseLength.MEDIUM })
  responseLength: ResponseLength;

  @ApiProperty({ description: "Verbosity level", enum: VerbosityLevel })
  @Column({ type: "enum", enum: VerbosityLevel, default: VerbosityLevel.BALANCED })
  verbosity: VerbosityLevel;

  @ApiProperty({ description: "Use emojis in responses" })
  @Column({ default: false })
  useEmojis: boolean;

  @ApiProperty({ description: "Maximum response characters (0 = unlimited)" })
  @Column({ default: 0 })
  maxResponseChars: number;

  @ApiProperty({ description: "Agent configuration" })
  @Column({ type: "jsonb", default: {} })
  config: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    // Response style options
    avoidRepetition?: boolean;
    useListsWhenAppropriate?: boolean;
    includeGreetings?: boolean;
    signOffStyle?: "none" | "simple" | "formal";
  };

  @ApiProperty({ description: "Escalation configuration for human handover" })
  @Column({ type: "jsonb", default: {} })
  escalationConfig: {
    enabled?: boolean;
    keywords?: string[];
    escalationMessage?: string;
    operatorWhatsAppNumber?: string;
    notificationEmails?: string[];
    // When not explicitly false, the AI reformulates the operator's WhatsApp reply into a
    // coherent, client-facing message before forwarding it to the customer.
    reformulateOperatorReplies?: boolean;
  };

  @ApiProperty({ description: "Lead qualification & reporting configuration" })
  @Column({ type: "jsonb", default: {} })
  leadQualificationConfig: {
    // Master switch — when true the AI captures & qualifies leads during conversations.
    enabled?: boolean;
    // Periodic report settings.
    reportEnabled?: boolean;
    reportFrequency?: "daily" | "weekly";
    // Hour of day (0-23, server tz) to send the report. Default 8.
    reportHour?: number;
    // Where reports are sent.
    reportEmails?: string[];
    reportWhatsAppNumber?: string;
    // Minimum tier to include in reports (e.g. only "warm" and above). Default "cold".
    minReportTier?: "cold" | "warm" | "hot";
  };

  @ApiProperty({ description: "Agent performance metrics" })
  @Column({ type: "jsonb", default: {} })
  metrics: {
    totalConversations?: number;
    totalMessages?: number;
    averageResponseTime?: number;
    satisfactionScore?: number;
    successfulResponses?: number;
    failedResponses?: number;
    knowledgeBaseHits?: number;
    lastActive?: Date;
  };

  @ApiProperty({ description: "Auto-generated FAQ from knowledge base" })
  @Column({ type: "jsonb", default: [] })
  faq: Array<{
    question: string;
    answer: string;
    confidence: number;
    sourceDocuments: string[];
    lastUpdated: Date;
  }>;

  @ApiProperty({ description: "Agent version for tracking updates" })
  @Column({ default: 1 })
  version: number;

  @ApiProperty({ description: "Agent tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Enable e-commerce product catalog for this agent" })
  @Column({ default: false })
  ecommerceEnabled: boolean;

  @ApiProperty({ description: "Enable appointment booking for this agent" })
  @Column({ default: false })
  appointmentsEnabled: boolean;

  @ApiProperty({ description: "External API connections with discovered tools" })
  @Column({ type: "jsonb", default: [] })
  apiTools: Array<{
    apiKey?: string;
    authType: 'bearer' | 'api-key-header' | 'query-param' | 'basic' | 'none';
    authHeaderName?: string;
    authQueryParam?: string;
    baseUrl: string;
    tools: Array<{
      name: string;
      description: string;
      path: string;
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      parameters: {
        type: 'object';
        properties: Record<string, {
          type: string;
          description: string;
          enum?: string[];
        }>;
        required?: string[];
      };
      enabled: boolean;
    }>;
  }>;

  // Relationships
  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({ description: "Created by user" })
  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "createdBy" })
  creator: User;

  @Column({ name: "createdBy", nullable: true })
  createdBy: string;

  @ApiProperty({ description: "Associated knowledge bases" })
  @ManyToMany(() => KnowledgeBase)
  @JoinTable({
    name: "agent_knowledge_bases",
    joinColumn: { name: "agentId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "knowledgeBaseId", referencedColumnName: "id" },
  })
  knowledgeBases: KnowledgeBase[];

  @ApiProperty({ description: "Associated e-commerce catalogs" })
  @ManyToMany(() => EcommerceStore)
  @JoinTable({
    name: "agent_store_catalogs",
    joinColumn: { name: "agentId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "storeId", referencedColumnName: "id" },
  })
  catalogs: EcommerceStore[];

  @OneToMany(() => AgentConversation, (conversation) => conversation.agent)
  conversations: AgentConversation[];

  @ApiProperty({ description: "WhatsApp sessions using this agent" })
  @OneToMany(() => WhatsAppSession, (session) => session.agent)
  whatsappSessions: WhatsAppSession[];

  @ApiProperty({ description: "Facebook page sessions using this agent" })
  @OneToMany(() => FacebookPageSession, (session) => session.agent)
  facebookPageSessions: FacebookPageSession[];
}
