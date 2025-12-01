import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { ConversationState } from "../enums";

@Entity("conversation_contexts")
@Index("IDX_CONTEXT_CONVERSATION", ["conversationId"])
@Index("IDX_CONTEXT_STATE", ["currentState"])
export class ConversationContext extends BaseEntity {
  @ApiProperty({ description: "Current conversation state" })
  @Column({
    type: "enum",
    enum: ConversationState,
    default: ConversationState.GREETING,
  })
  currentState: ConversationState;

  @ApiProperty({ description: "Previous conversation state" })
  @Column({
    type: "enum",
    enum: ConversationState,
    nullable: true,
  })
  previousState?: ConversationState;

  @ApiProperty({ description: "Session context data" })
  @Column("jsonb", { default: {} })
  sessionData: {
    userProfile?: {
      name?: string;
      phone?: string;
      language?: string;
      preferences?: Record<string, any>;
    };
    conversationHistory?: {
      topics: string[];
      keywords: string[];
      sentiment: "positive" | "neutral" | "negative";
      lastIntent?: string;
    };
    customFields?: Record<string, any>;
  };

  @ApiProperty({ description: "Current conversation intent" })
  @Column({ nullable: true })
  currentIntent?: string;

  @ApiProperty({ description: "Detected user language" })
  @Column({ default: "en" })
  detectedLanguage: string;

  @ApiProperty({ description: "Conversation sentiment score (-1 to 1)" })
  @Column("decimal", { precision: 3, scale: 2, default: 0 })
  sentimentScore: number;

  @ApiProperty({ description: "Number of unresolved queries" })
  @Column("integer", { default: 0 })
  unresolvedCount: number;

  @ApiProperty({ description: "Last activity timestamp" })
  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  lastActivity: Date;

  @ApiProperty({ description: "Conversation timeout timestamp" })
  @Column({ type: "timestamp", nullable: true })
  timeoutAt?: Date;

  @ApiProperty({ description: "State transition history" })
  @Column("jsonb", { default: [] })
  stateHistory: {
    from: ConversationState;
    to: ConversationState;
    timestamp: Date;
    reason?: string;
    metadata?: Record<string, any>;
  }[];

  // Relationships
  @ApiProperty({ description: "Associated conversation ID" })
  @Column("uuid")
  conversationId: string;

  @ManyToOne(() => AgentConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation: AgentConversation;
}
