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
import { AgentConversation } from "./agent-conversation.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";

export enum AgentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  TRAINING = "training",
  MAINTENANCE = "maintenance",
}

export enum AgentLanguage {
  ENGLISH = "en",
  FRENCH = "fr",
  SPANISH = "es",
  GERMAN = "de",
  ITALIAN = "it",
  PORTUGUESE = "pt",
  CHINESE = "zh",
  JAPANESE = "ja",
  ARABIC = "ar",
}

export enum AgentTone {
  PROFESSIONAL = "professional",
  FRIENDLY = "friendly",
  CASUAL = "casual",
  FORMAL = "formal",
  EMPATHETIC = "empathetic",
  TECHNICAL = "technical",
}

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

  @ApiProperty({ description: "Welcome message" })
  @Column({ type: "text", nullable: true })
  welcomeMessage?: string;

  @ApiProperty({ description: "Fallback message when no knowledge found" })
  @Column({ type: "text", nullable: true })
  fallbackMessage?: string;

  @ApiProperty({ description: "Agent configuration" })
  @Column({ type: "jsonb", default: {} })
  config: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    contextWindow?: number;
    memorySize?: number;
    responseFormat?: "text" | "json" | "markdown";
    enableFunctionCalling?: boolean;
    enableWebSearch?: boolean;
    enableImageAnalysis?: boolean;
    confidenceThreshold?: number;
    maxRetries?: number;
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

  @OneToMany(() => AgentConversation, (conversation) => conversation.agent)
  conversations: AgentConversation[];

  @ApiProperty({ description: "WhatsApp sessions using this agent" })
  @OneToMany(() => WhatsAppSession, (session) => session.agent)
  whatsappSessions: WhatsAppSession[];
}
