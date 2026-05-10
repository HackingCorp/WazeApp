import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Exclude } from "class-transformer";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Organization } from "./organization.entity";
import { KnowledgeBase } from "./knowledge-base.entity";
import { AiAgent } from "./ai-agent.entity";

export enum FacebookPageSessionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  FAILED = "failed",
  SUSPENDED = "suspended",
}

@Entity("facebook_page_sessions")
@Index("IDX_FACEBOOK_ORG", ["organizationId"])
@Index("IDX_FACEBOOK_USER", ["userId"])
@Index("IDX_FACEBOOK_STATUS", ["status"])
@Index("IDX_FACEBOOK_PAGE_ID", ["pageId"])
export class FacebookPageSession extends BaseEntity {
  @ApiProperty({ description: "Session name/identifier" })
  @Column()
  name: string;

  @ApiProperty({ description: "Facebook Page ID" })
  @Column({ unique: true })
  pageId: string;

  @ApiProperty({ description: "Facebook Page Name" })
  @Column({ nullable: true })
  pageName?: string;

  @ApiProperty({ description: "Facebook Page Username" })
  @Column({ nullable: true })
  pageUsername?: string;

  @ApiProperty({ description: "Facebook Page Profile Picture URL" })
  @Column({ nullable: true })
  pageAvatarUrl?: string;

  @ApiProperty({ description: "Session status", enum: FacebookPageSessionStatus })
  @Column({
    type: "enum",
    enum: FacebookPageSessionStatus,
    default: FacebookPageSessionStatus.DISCONNECTED,
  })
  status: FacebookPageSessionStatus;

  @ApiProperty({ description: "Facebook Page Access Token" })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true, type: "text" })
  pageAccessToken?: string;

  @ApiProperty({ description: "Access Token expiry time" })
  @Column({ nullable: true })
  tokenExpiresAt?: Date;

  @ApiProperty({ description: "User Access Token for refreshing" })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true, type: "text" })
  userAccessToken?: string;

  @ApiProperty({ description: "Last connection attempt" })
  @Column({ nullable: true })
  lastConnectionAttempt?: Date;

  @ApiProperty({ description: "Connection retry count" })
  @Column({ default: 0 })
  retryCount: number;

  @ApiProperty({ description: "Last seen timestamp" })
  @Column({ nullable: true })
  lastSeenAt?: Date;

  @ApiProperty({ description: "Session is active" })
  @Column({ default: false })
  isActive: boolean;

  @ApiProperty({ description: "Auto-reconnect enabled" })
  @Column({ default: true })
  autoReconnect: boolean;

  @ApiProperty({ description: "AI responses enabled for this session" })
  @Column({ default: true, nullable: true })
  aiResponsesEnabled: boolean;

  @ApiProperty({ description: "Enable comment auto-reply" })
  @Column({ default: true })
  commentAutoReplyEnabled: boolean;

  @ApiProperty({ description: "Webhook verification token" })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true })
  webhookVerifyToken?: string;

  @ApiProperty({ description: "Session configuration" })
  @Column({ type: "jsonb", default: {} })
  config: {
    replyToAllComments?: boolean;
    replyToMentionsOnly?: boolean;
    excludeReplies?: boolean; // Don't reply to comment replies, only top-level comments
    maxResponseLength?: number;
    rateLimit?: {
      maxPerHour?: number; // Default: 200 (Facebook limit)
      maxPerDay?: number;
    };
  };

  @ApiProperty({ description: "Session metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    followersCount?: number;
    likesCount?: number;
    category?: string;
    tokenType?: string;
    connectedAt?: Date;
    lastSyncAt?: Date;
  };

  @ApiProperty({ description: "Facebook App scopes granted" })
  @Column({ type: "text", array: true, default: [] })
  grantedScopes: string[];

  // Relationships
  @ApiProperty({ description: "User who owns the session" })
  @ManyToOne(() => User, (user) => user.facebookPageSessions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ name: "userId" })
  userId: string;

  @ApiProperty({ description: "Organization", required: false })
  @ManyToOne(() => Organization, (org) => org.facebookPageSessions, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({ description: "Associated AI Agent" })
  @ManyToOne(() => AiAgent, (agent) => agent.facebookPageSessions, {
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
    return this.status === FacebookPageSessionStatus.CONNECTED;
  }

  @ApiProperty({ description: "Is access token valid" })
  get isTokenValid(): boolean {
    return !!(
      this.pageAccessToken &&
      this.tokenExpiresAt &&
      this.tokenExpiresAt > new Date()
    );
  }

  @ApiProperty({ description: "Should retry connection" })
  get shouldRetry(): boolean {
    return this.retryCount < 3 && this.autoReconnect;
  }
}
