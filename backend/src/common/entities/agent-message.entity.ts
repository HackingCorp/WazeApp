import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { AgentConversation } from "./agent-conversation.entity";

export enum MessageRole {
  USER = "user",
  AGENT = "agent",
  SYSTEM = "system",
}

export enum MessageStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}

@Entity("agent_messages")
@Index("IDX_MSG_CONV", ["conversationId"])
@Index("IDX_MSG_ROLE", ["role"])
@Index("IDX_MSG_TIMESTAMP", ["createdAt"])
export class AgentMessage extends BaseEntity {
  @ApiProperty({ description: "Message content" })
  @Column({ type: "text" })
  content: string;

  @ApiProperty({ description: "Message role", enum: MessageRole })
  @Column({ type: "enum", enum: MessageRole })
  role: MessageRole;

  @ApiProperty({ description: "Message status", enum: MessageStatus })
  @Column({
    type: "enum",
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  status: MessageStatus;

  @ApiProperty({ description: "Message sequence number in conversation" })
  @Column()
  sequenceNumber: number;

  @ApiProperty({ description: "Message metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    tokenCount?: number;
    processingTime?: number;
    modelUsed?: string;
    temperature?: number;
    knowledgeBaseSources?: Array<{
      documentId: string;
      chunkId: string;
      confidence: number;
      title: string;
    }>;
    intent?: string;
    entities?: Record<string, any>;
    sentiment?: "positive" | "negative" | "neutral";
    language?: string;
    attachments?: Array<{
      type: "image" | "video" | "audio" | "document";
      url: string;
      name: string;
      size: number;
    }>;
    error?: {
      message: string;
      code: string;
      timestamp: Date;
    };
    fromWhatsApp?: boolean;
    originalSender?: "client" | "user" | "agent";
  };

  @ApiProperty({ description: "External message ID from channel" })
  @Column({ nullable: true })
  externalMessageId?: string;

  @ApiProperty({ description: "Message delivered at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  deliveredAt?: Date;

  @ApiProperty({ description: "Message read at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  readAt?: Date;

  @ApiProperty({ description: "Message timestamp" })
  @Column({ 
    type: "timestamp with time zone", 
    default: () => "CURRENT_TIMESTAMP"
  })
  timestamp: Date;

  @ApiProperty({ description: "Media URL" })
  @Column({ type: "text", nullable: true })
  mediaUrl?: string;

  @ApiProperty({ description: "Media type" })
  @Column({ nullable: true })
  mediaType?: string;

  @ApiProperty({ description: "Media caption" })
  @Column({ type: "text", nullable: true })
  mediaCaption?: string;

  // Relationships
  @ApiProperty({ description: "Conversation" })
  @ManyToOne(() => AgentConversation, (conv) => conv.messages, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "conversationId" })
  conversation: AgentConversation;

  @Column({ name: "conversationId" })
  conversationId: string;
}
