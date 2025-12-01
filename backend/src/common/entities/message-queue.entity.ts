import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { MessagePriority, ProcessingStatus } from "../enums";

@Entity("message_queue")
@Index("IDX_QUEUE_STATUS_PRIORITY", ["status", "priority"])
@Index("IDX_QUEUE_SCHEDULED", ["scheduledAt"])
@Index("IDX_QUEUE_ORG", ["organizationId"])
export class MessageQueue extends BaseEntity {
  @ApiProperty({ description: "Queue job type" })
  @Column()
  jobType: string;

  @ApiProperty({ description: "Message priority" })
  @Column({
    type: "enum",
    enum: MessagePriority,
    default: MessagePriority.NORMAL,
  })
  priority: MessagePriority;

  @ApiProperty({ description: "Processing status" })
  @Column({
    type: "enum",
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  status: ProcessingStatus;

  @ApiProperty({ description: "Message payload" })
  @Column("jsonb")
  payload: {
    messageId?: string;
    conversationId?: string;
    agentId?: string;
    content: any;
    metadata?: Record<string, any>;
  };

  @ApiProperty({ description: "Processing attempts count" })
  @Column("integer", { default: 0 })
  attempts: number;

  @ApiProperty({ description: "Maximum retry attempts" })
  @Column("integer", { default: 3 })
  maxAttempts: number;

  @ApiProperty({ description: "Scheduled processing time" })
  @Column({ type: "timestamp", nullable: true })
  scheduledAt?: Date;

  @ApiProperty({ description: "Processing started at" })
  @Column({ type: "timestamp", nullable: true })
  processingStartedAt?: Date;

  @ApiProperty({ description: "Processing completed at" })
  @Column({ type: "timestamp", nullable: true })
  processingCompletedAt?: Date;

  @ApiProperty({ description: "Last error message" })
  @Column("text", { nullable: true })
  lastError?: string;

  @ApiProperty({ description: "Processing result" })
  @Column("jsonb", { nullable: true })
  result?: Record<string, any>;

  @ApiProperty({ description: "Delay before next attempt (seconds)" })
  @Column("integer", { default: 60 })
  retryDelay: number;

  // Relationships
  @ApiProperty({ description: "Organization ID" })
  @Column("uuid")
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ApiProperty({ description: "Conversation ID if applicable" })
  @Column("uuid", { nullable: true })
  conversationId?: string;

  @ManyToOne(() => AgentConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversationId" })
  conversation?: AgentConversation;
}
