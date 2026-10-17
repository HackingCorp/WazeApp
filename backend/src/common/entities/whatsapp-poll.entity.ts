import { Entity, Column, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";

/**
 * A poll we sent, plus the votes WhatsApp reports back. Votes arrive as
 * encrypted updates that can only be decoded against the original poll
 * message, which is why that message is kept here.
 */
@Entity("whatsapp_polls")
@Index("IDX_WA_POLL_MESSAGE", ["sessionId", "messageId"], { unique: true })
export class WhatsAppPoll extends BaseEntity {
  @ApiProperty()
  @Column({ type: "uuid" })
  sessionId: string;

  @ApiProperty({ description: "Chat the poll was sent to (JID)" })
  @Column()
  chatJid: string;

  @ApiProperty({ description: "WhatsApp message id of the poll" })
  @Column()
  messageId: string;

  @ApiProperty()
  @Column()
  question: string;

  @ApiProperty({ type: [String] })
  @Column({ type: "jsonb", default: [] })
  options: string[];

  @ApiProperty()
  @Column({ type: "int", default: 1 })
  selectableCount: number;

  /** The WAMessage as sent — needed to decrypt vote updates. */
  @Column({ type: "jsonb", nullable: true })
  pollMessage?: Record<string, any>;

  @ApiProperty({ description: "option → list of voter JIDs" })
  @Column({ type: "jsonb", default: {} })
  votes: Record<string, string[]>;

  @ApiProperty()
  @Column({ type: "int", default: 0 })
  voterCount: number;
}
