import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Exclude } from "class-transformer";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Organization } from "./organization.entity";
import { KnowledgeBase } from "./knowledge-base.entity";
import { AiAgent } from "./ai-agent.entity";
import { WhatsAppSessionStatus } from "../enums";

@Entity("whatsapp_sessions")
@Index("IDX_WHATSAPP_ORG", ["organizationId"])
@Index("IDX_WHATSAPP_USER", ["userId"])
@Index("IDX_WHATSAPP_STATUS", ["status"])
export class WhatsAppSession extends BaseEntity {
  @ApiProperty({ description: "Session name/identifier" })
  @Column()
  name: string;

  @ApiProperty({ description: "WhatsApp phone number", required: false })
  @Column({ nullable: true })
  phoneNumber?: string;

  @ApiProperty({ description: "Session status", enum: WhatsAppSessionStatus })
  @Column({
    type: "enum",
    enum: WhatsAppSessionStatus,
    default: WhatsAppSessionStatus.DISCONNECTED,
  })
  status: WhatsAppSessionStatus;

  @ApiProperty({ description: "QR Code for connection", required: false })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true, type: "text" })
  qrCode?: string;

  @ApiProperty({ description: "QR Code expiry time", required: false })
  @Column({ nullable: true })
  qrCodeExpiresAt?: Date;

  @ApiProperty({ description: "Session authentication data", required: false })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true, type: "jsonb" })
  authData?: Record<string, any>;

  @ApiProperty({ description: "Last connection attempt", required: false })
  @Column({ nullable: true })
  lastConnectionAttempt?: Date;

  @ApiProperty({ description: "Connection retry count" })
  @Column({ default: 0 })
  retryCount: number;

  @ApiProperty({ description: "Last seen timestamp", required: false })
  @Column({ nullable: true })
  lastSeenAt?: Date;

  @ApiProperty({ description: "Session is active" })
  @Column({ default: false })
  isActive: boolean;

  @ApiProperty({ description: "Auto-reconnect enabled" })
  @Column({ default: true })
  autoReconnect: boolean;

  @ApiProperty({ description: "Webhook URL for events", required: false })
  @Column({ nullable: true })
  webhookUrl?: string;

  @ApiProperty({ description: "Session configuration" })
  @Column({ type: "jsonb", default: {} })
  config: {
    messageRetryCount?: number;
    markOnlineOnConnect?: boolean;
    syncFullHistory?: boolean;
    defaultPresence?: "available" | "unavailable";
  };

  @ApiProperty({ description: "Session metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "User who owns the session" })
  @ManyToOne(() => User, (user) => user.whatsappSessions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ name: "userId" })
  userId: string;

  @ApiProperty({ description: "Organization", required: false })
  @ManyToOne(() => Organization, (org) => org.whatsappSessions, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({ description: "Associated AI Agent" })
  @ManyToOne(() => AiAgent, (agent) => agent.whatsappSessions, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "agentId" })
  agent?: AiAgent;

  @Column({ name: "agentId", nullable: true })
  agentId?: string;

  @ApiProperty({
    description: "Associated Knowledge Base (legacy - via agent)",
  })
  @ManyToOne(() => KnowledgeBase, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "knowledgeBaseId" })
  knowledgeBase?: KnowledgeBase;

  @Column({ name: "knowledgeBaseId", nullable: true })
  knowledgeBaseId?: string;

  // Virtual properties
  @ApiProperty({ description: "Is session connected" })
  get isConnected(): boolean {
    return this.status === WhatsAppSessionStatus.CONNECTED;
  }

  @ApiProperty({ description: "Is QR code valid" })
  get isQrCodeValid(): boolean {
    return !!(
      this.qrCode &&
      this.qrCodeExpiresAt &&
      this.qrCodeExpiresAt > new Date()
    );
  }

  @ApiProperty({ description: "Should retry connection" })
  get shouldRetry(): boolean {
    return this.retryCount < 3 && this.autoReconnect;
  }
}
