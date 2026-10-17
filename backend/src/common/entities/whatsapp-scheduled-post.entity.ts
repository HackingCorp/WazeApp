import { Entity, Column, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";

export type ScheduledPostKind = "channel" | "status" | "group" | "chat";
export type ScheduledPostStatus = "scheduled" | "running" | "done" | "failed" | "cancelled";

/** What gets published: one of text / image / video / document / audio. */
export interface ScheduledPostContent {
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "document" | "audio";
  caption?: string;
  fileName?: string;
  /** Status only: background colour (#RRGGBB) and font index for text statuses. */
  backgroundColor?: string;
  font?: number;
}

/** Status only: who may see it. */
export interface ScheduledPostAudience {
  /** "optin" = organisation's subscribed broadcast contacts, "contacts" = every contact of the session. */
  type: "optin" | "contacts" | "jids";
  jids?: string[];
  tags?: string[];
}

@Entity("whatsapp_scheduled_posts")
@Index("IDX_WA_SCHEDULED_SESSION", ["sessionId", "status"])
export class WhatsAppScheduledPost extends BaseEntity {
  @ApiProperty()
  @Column({ type: "uuid" })
  sessionId: string;

  @ApiProperty({ required: false })
  @Column({ type: "uuid", nullable: true })
  organizationId?: string;

  @Column({ nullable: true })
  createdBy?: string;

  @ApiProperty({ enum: ["channel", "status", "group", "chat"] })
  @Column()
  kind: ScheduledPostKind;

  @ApiProperty({ description: "Channel / group / chat JID. Unused for statuses.", required: false })
  @Column({ nullable: true })
  target?: string;

  @ApiProperty()
  @Column({ type: "jsonb", default: {} })
  content: ScheduledPostContent;

  @ApiProperty({ required: false })
  @Column({ type: "jsonb", nullable: true })
  audience?: ScheduledPostAudience;

  @ApiProperty()
  @Column({ type: "timestamptz" })
  scheduledAt: Date;

  @ApiProperty({ description: "Cron expression for recurring posts", required: false })
  @Column({ nullable: true })
  cron?: string;

  @ApiProperty({ enum: ["scheduled", "running", "done", "failed", "cancelled"] })
  @Column({ default: "scheduled" })
  status: ScheduledPostStatus;

  @Column({ nullable: true })
  jobId?: string;

  @Column({ type: "timestamptz", nullable: true })
  lastRunAt?: Date;

  @Column({ type: "jsonb", nullable: true })
  result?: Record<string, any>;

  @Column({ type: "text", nullable: true })
  error?: string;
}
