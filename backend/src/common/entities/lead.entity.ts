import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AiAgent } from "./ai-agent.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { LeadStatus, LeadSource } from "../enums";

/**
 * A sales lead captured/qualified by an AI agent during a conversation.
 *
 * One lead per (organization, clientPhoneNumber) — upserted as the conversation
 * evolves. `status` is the qualification tier; `score` (0-100) is the computed
 * engagement/intent score backing it; `signals` holds the BANT-lite breakdown.
 */
@Entity("leads")
@Index("IDX_LEAD_ORG", ["organizationId"])
@Index("IDX_LEAD_STATUS", ["status"])
@Index("IDX_LEAD_CLIENT_PHONE", ["clientPhoneNumber"])
@Index("IDX_LEAD_ORG_PHONE", ["organizationId", "clientPhoneNumber"], {
  unique: true,
})
export class Lead extends BaseEntity {
  @ApiProperty({ description: "Client phone number (lead identity within an org)" })
  @Column()
  clientPhoneNumber: string;

  @ApiProperty({ description: "Client name" })
  @Column({ nullable: true })
  clientName?: string;

  @ApiProperty({ description: "Client email" })
  @Column({ nullable: true })
  clientEmail?: string;

  @ApiProperty({ description: "Qualification tier / lifecycle status", enum: LeadStatus })
  @Column({ type: "enum", enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @ApiProperty({ description: "Computed qualification score (0-100)" })
  @Column({ type: "int", default: 0 })
  score: number;

  @ApiProperty({ description: "Lead source", enum: LeadSource })
  @Column({ type: "enum", enum: LeadSource, default: LeadSource.WHATSAPP_AI })
  source: LeadSource;

  @ApiProperty({ description: "Product/service the client is interested in" })
  @Column({ type: "text", nullable: true })
  interest?: string;

  @ApiProperty({ description: "AI-generated summary of the client's need" })
  @Column({ type: "text", nullable: true })
  needSummary?: string;

  @ApiProperty({ description: "Qualification signals (BANT-lite + engagement)" })
  @Column({ type: "jsonb", default: {} })
  signals: {
    budget?: boolean | string;
    authority?: boolean;
    need?: boolean;
    timeline?: string;
    existingCustomer?: boolean;
    explicitInterest?: boolean;
    engagementScore?: number;
    [key: string]: any;
  };

  @ApiProperty({ description: "Lead tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Last interaction timestamp" })
  @Column({ type: "timestamp with time zone", nullable: true })
  lastInteractionAt?: Date;

  @ApiProperty({ description: "Last time this lead was included in a periodic report" })
  @Column({ type: "timestamp with time zone", nullable: true })
  reportedAt?: Date;

  @ApiProperty({ description: "Additional metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  // ---- Relations ----

  @ManyToOne(() => Organization, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @ApiProperty({ description: "Organization ID" })
  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ManyToOne(() => AiAgent, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "agentId" })
  agent?: AiAgent;

  @ApiProperty({ description: "Agent ID that captured the lead" })
  @Column({ name: "agentId", nullable: true })
  agentId?: string;

  @ManyToOne(() => AgentConversation, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "conversationId" })
  conversation?: AgentConversation;

  @ApiProperty({ description: "Conversation ID the lead originated from" })
  @Column({ name: "conversationId", nullable: true })
  conversationId?: string;
}
