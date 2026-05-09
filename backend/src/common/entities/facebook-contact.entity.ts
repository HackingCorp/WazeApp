import {
  Entity,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { FacebookPageSession } from "./facebook-page-session.entity";
import { User } from "./user.entity";
import { Organization } from "./organization.entity";

@Entity("facebook_contacts")
@Index("IDX_FB_CONTACT_ORG", ["organizationId"])
@Index("IDX_FB_CONTACT_SESSION", ["sessionId"])
@Index("IDX_FB_CONTACT_FACEBOOK_ID", ["facebookUserId"])
@Unique("UQ_FB_CONTACT_SESSION_USER", ["sessionId", "facebookUserId"])
export class FacebookContact extends BaseEntity {
  @ApiProperty({ description: "Facebook User ID (PSID - Page-Scoped ID)" })
  @Column()
  facebookUserId: string;

  @ApiProperty({ description: "Contact display name" })
  @Column({ nullable: true })
  name?: string;

  @ApiProperty({ description: "Contact profile picture URL" })
  @Column({ nullable: true })
  profilePictureUrl?: string;

  @ApiProperty({ description: "Contact username" })
  @Column({ nullable: true })
  username?: string;

  @ApiProperty({ description: "Contact email (if available)" })
  @Column({ nullable: true })
  email?: string;

  @ApiProperty({ description: "Contact metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    locale?: string;
    timezone?: number;
    gender?: string;
    lastInteractionAt?: Date;
    totalComments?: number;
    sentimentScore?: number;
  };

  @ApiProperty({ description: "Contact tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Contact notes" })
  @Column({ type: "text", nullable: true })
  notes?: string;

  @ApiProperty({ description: "Is contact blocked" })
  @Column({ default: false })
  isBlocked: boolean;

  @ApiProperty({ description: "Last seen at" })
  @Column({ nullable: true })
  lastSeenAt?: Date;

  // Relationships
  @ApiProperty({ description: "Facebook Page Session" })
  @ManyToOne(() => FacebookPageSession, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session: FacebookPageSession;

  @Column({ name: "sessionId" })
  sessionId: string;

  @ApiProperty({ description: "User (if matched to platform user)" })
  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ name: "userId", nullable: true })
  userId?: string;

  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId" })
  organizationId: string;
}
