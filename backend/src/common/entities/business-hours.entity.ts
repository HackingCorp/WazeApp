import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AiAgent } from "./ai-agent.entity";
import { DayOfWeek } from "../enums";

@Entity("business_hours")
@Unique("UQ_BUSINESS_HOURS_ORG_AGENT_DAY", ["organizationId", "agentId", "dayOfWeek"])
@Index("IDX_BUSINESS_HOURS_ORG", ["organizationId"])
export class BusinessHours extends BaseEntity {
  @ApiProperty({ description: "Day of week", enum: DayOfWeek })
  @Column({ type: "enum", enum: DayOfWeek })
  dayOfWeek: DayOfWeek;

  @ApiProperty({ description: "Is open on this day" })
  @Column({ default: true })
  isOpen: boolean;

  @ApiProperty({ description: "Opening time" })
  @Column({ type: "time", nullable: true })
  openTime?: string;

  @ApiProperty({ description: "Closing time" })
  @Column({ type: "time", nullable: true })
  closeTime?: string;

  @ApiProperty({ description: "Break start time" })
  @Column({ type: "time", nullable: true })
  breakStartTime?: string;

  @ApiProperty({ description: "Break end time" })
  @Column({ type: "time", nullable: true })
  breakEndTime?: string;

  @ApiProperty({ description: "Slot duration in minutes" })
  @Column({ type: "int", default: 30 })
  slotDurationMinutes: number;

  // Relationships
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId" })
  organizationId: string;

  @ManyToOne(() => AiAgent, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "agentId" })
  agent?: AiAgent;

  @Column({ name: "agentId", nullable: true })
  agentId?: string;
}
