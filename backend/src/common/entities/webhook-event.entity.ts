import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";
import { WebhookEventType, ProcessingStatus } from "../enums";

@Entity("webhook_events")
@Index("IDX_WEBHOOK_TYPE_STATUS", ["eventType", "processingStatus"])
@Index("IDX_WEBHOOK_ORG_DATE", ["organizationId", "createdAt"])
@Index("IDX_WEBHOOK_SESSION", ["whatsappSessionId"])
export class WebhookEvent extends BaseEntity {
  @ApiProperty({ description: "Event type" })
  @Column({
    type: "enum",
    enum: WebhookEventType,
  })
  eventType: WebhookEventType;

  @ApiProperty({ description: "Processing status" })
  @Column({
    type: "enum",
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  processingStatus: ProcessingStatus;

  @ApiProperty({ description: "Event payload from WhatsApp" })
  @Column("jsonb")
  payload: Record<string, any>;

  @ApiProperty({ description: "Processed event data" })
  @Column("jsonb", { nullable: true })
  processedData?: Record<string, any>;

  @ApiProperty({ description: "Event source (phone number)" })
  @Column({ nullable: true })
  sourcePhone?: string;

  @ApiProperty({ description: "Event target (phone number)" })
  @Column({ nullable: true })
  targetPhone?: string;

  @ApiProperty({ description: "WhatsApp message ID" })
  @Column({ nullable: true })
  whatsappMessageId?: string;

  @ApiProperty({ description: "Processing attempts" })
  @Column("integer", { default: 0 })
  processingAttempts: number;

  @ApiProperty({ description: "Processing error message" })
  @Column("text", { nullable: true })
  processingError?: string;

  @ApiProperty({ description: "Processing started at" })
  @Column({ type: "timestamp", nullable: true })
  processingStartedAt?: Date;

  @ApiProperty({ description: "Processing completed at" })
  @Column({ type: "timestamp", nullable: true })
  processingCompletedAt?: Date;

  @ApiProperty({ description: "Event signature for deduplication" })
  @Column({ unique: true, nullable: true })
  eventSignature?: string;

  @ApiProperty({ description: "Response data sent back" })
  @Column("jsonb", { nullable: true })
  responseData?: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "Organization ID" })
  @Column("uuid")
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ApiProperty({ description: "WhatsApp session ID" })
  @Column("uuid", { nullable: true })
  whatsappSessionId?: string;

  @ManyToOne(() => WhatsAppSession, { onDelete: "CASCADE" })
  @JoinColumn({ name: "whatsappSessionId" })
  whatsappSession?: WhatsAppSession;
}
