import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";

@Entity("whatsapp_contacts")
@Index("IDX_CONTACT_SESSION", ["sessionId"])
@Index("IDX_CONTACT_PHONE", ["phoneNumber"])
@Index("IDX_CONTACT_LID", ["lid"])
@Unique("UQ_CONTACT_SESSION_PHONE", ["sessionId", "phoneNumber"])
export class WhatsAppContact extends BaseEntity {
  @ApiProperty({ description: "WhatsApp Session ID" })
  @Column({ type: "uuid" })
  sessionId: string;

  @ManyToOne(() => WhatsAppSession, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session: WhatsAppSession;

  @ApiProperty({ description: "Contact phone number (JID without suffix)" })
  @Column()
  phoneNumber: string;

  @ApiProperty({ description: "Contact LID (Local ID) from Baileys v7", required: false })
  @Column({ nullable: true })
  lid?: string;

  @ApiProperty({ description: "Contact display name" })
  @Column({ nullable: true })
  name?: string;

  @ApiProperty({ description: "Contact push name (name set by contact)" })
  @Column({ nullable: true })
  pushName?: string;

  @ApiProperty({ description: "Contact short name" })
  @Column({ nullable: true })
  shortName?: string;

  @ApiProperty({ description: "Contact profile picture URL" })
  @Column({ nullable: true, type: "text" })
  profilePictureUrl?: string;

  @ApiProperty({ description: "Is this a business account" })
  @Column({ default: false })
  isBusiness: boolean;

  @ApiProperty({ description: "Is this contact blocked" })
  @Column({ default: false })
  isBlocked: boolean;

  @ApiProperty({ description: "Is this a group" })
  @Column({ default: false })
  isGroup: boolean;

  @ApiProperty({ description: "Last interaction time" })
  @Column({ nullable: true })
  lastInteractionAt?: Date;

  @ApiProperty({ description: "Additional contact metadata" })
  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, any>;
}
