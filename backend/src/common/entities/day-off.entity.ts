import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AiAgent } from "./ai-agent.entity";

@Entity("days_off")
@Index("IDX_DAY_OFF_ORG", ["organizationId"])
@Index("IDX_DAY_OFF_DATE", ["date"])
export class DayOff extends BaseEntity {
  @ApiProperty({ description: "Day off date" })
  @Column({ type: "date" })
  date: string;

  @ApiProperty({ description: "Reason for day off" })
  @Column({ nullable: true })
  reason?: string;

  @ApiProperty({ description: "Is all day off" })
  @Column({ default: true })
  allDay: boolean;

  @ApiProperty({ description: "Start time (if not all day)" })
  @Column({ type: "time", nullable: true })
  startTime?: string;

  @ApiProperty({ description: "End time (if not all day)" })
  @Column({ type: "time", nullable: true })
  endTime?: string;

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
