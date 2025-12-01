import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { AiAgent } from "./ai-agent.entity";
import { User } from "./user.entity";
import { AgentMessage } from "./agent-message.entity";

export enum ConversationStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  ABANDONED = "abandoned",
  ARCHIVED = "archived",
}

export enum ConversationChannel {
  WHATSAPP = "whatsapp",
  WEB_CHAT = "web_chat",
  API = "api",
  PHONE = "phone",
  EMAIL = "email",
}

@Entity("agent_conversations")
@Index("IDX_CONV_AGENT", ["agentId"])
@Index("IDX_CONV_USER", ["userId"])
@Index("IDX_CONV_STATUS", ["status"])
@Index("IDX_CONV_CHANNEL", ["channel"])
export class AgentConversation extends BaseEntity {
  @ApiProperty({ description: "Conversation title" })
  @Column({ nullable: true })
  title?: string;

  @ApiProperty({ description: "Conversation status", enum: ConversationStatus })
  @Column({
    type: "enum",
    enum: ConversationStatus,
    default: ConversationStatus.ACTIVE,
  })
  status: ConversationStatus;

  @ApiProperty({
    description: "Communication channel",
    enum: ConversationChannel,
  })
  @Column({ type: "enum", enum: ConversationChannel })
  channel: ConversationChannel;

  @ApiProperty({
    description: "External channel identifier (WhatsApp number, etc.)",
  })
  @Column({ nullable: true })
  externalId?: string;

  @ApiProperty({ description: "Conversation context and metadata" })
  @Column({ type: "jsonb", default: {} })
  context: {
    sessionId?: string;
    userProfile?: {
      name?: string;
      phone?: string;
      email?: string;
      language?: string;
      timezone?: string;
    };
    summary?: string;
    sentiment?: "positive" | "negative" | "neutral";
    intent?: string;
    entities?: Record<string, any>;
    customData?: Record<string, any>;
  };

  @ApiProperty({ description: "Conversation metrics" })
  @Column({ type: "jsonb", default: {} })
  metrics: {
    messageCount?: number;
    userMessageCount?: number;
    agentMessageCount?: number;
    averageResponseTime?: number;
    totalDuration?: number;
    satisfactionScore?: number;
    resolvedAt?: Date;
    firstResponseTime?: number;
    lastActivity?: Date;
  };

  @ApiProperty({ description: "Conversation started at" })
  @Column({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  startedAt: Date;

  @ApiProperty({ description: "Conversation ended at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  endedAt?: Date;

  @ApiProperty({ description: "Conversation tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "WhatsApp session ID" })
  @Column({ nullable: true })
  sessionId?: string;

  @ApiProperty({ description: "Client phone number" })
  @Column({ nullable: true })
  clientPhoneNumber?: string;

  // Relationships
  @ApiProperty({ description: "AI Agent" })
  @ManyToOne(() => AiAgent, (agent) => agent.conversations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "agentId" })
  agent: AiAgent;

  @Column({ name: "agentId" })
  agentId: string;

  @ApiProperty({ description: "User (if authenticated)" })
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ name: "userId", nullable: true })
  userId?: string;

  @OneToMany(() => AgentMessage, (message) => message.conversation, {
    cascade: true,
  })
  messages: AgentMessage[];
}
