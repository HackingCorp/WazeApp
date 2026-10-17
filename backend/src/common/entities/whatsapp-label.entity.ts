import { Entity, Column, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";

/**
 * WhatsApp Business label, mirrored from the app-state sync. WhatsApp owns
 * the ids; we only keep the names so the dashboard can pick one.
 */
@Entity("whatsapp_labels")
@Index("IDX_WA_LABEL_SESSION", ["sessionId", "labelId"], { unique: true })
export class WhatsAppLabel extends BaseEntity {
  @ApiProperty()
  @Column({ type: "uuid" })
  sessionId: string;

  @ApiProperty({ description: "Label id as WhatsApp knows it" })
  @Column()
  labelId: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty({ description: "WhatsApp colour index (0-19)", required: false })
  @Column({ type: "int", nullable: true })
  color?: number;

  @Column({ nullable: true })
  predefinedId?: string;

  @ApiProperty()
  @Column({ default: false })
  deleted: boolean;
}
