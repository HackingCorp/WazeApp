import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AiAgent } from "./ai-agent.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { AppointmentStatus } from "../enums";

@Entity("appointments")
@Index("IDX_APPOINTMENT_ORG", ["organizationId"])
@Index("IDX_APPOINTMENT_STATUS", ["status"])
@Index("IDX_APPOINTMENT_DATE", ["scheduledDate"])
@Index("IDX_APPOINTMENT_CLIENT", ["clientPhoneNumber"])
export class Appointment extends BaseEntity {
  @ApiProperty({ description: "Appointment status", enum: AppointmentStatus })
  @Column({ type: "enum", enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status: AppointmentStatus;

  @ApiProperty({ description: "Client phone number" })
  @Column()
  clientPhoneNumber: string;

  @ApiProperty({ description: "Client name" })
  @Column({ nullable: true })
  clientName?: string;

  @ApiProperty({ description: "Scheduled date" })
  @Column({ type: "date" })
  scheduledDate: string;

  @ApiProperty({ description: "Start time" })
  @Column({ type: "time" })
  startTime: string;

  @ApiProperty({ description: "End time" })
  @Column({ type: "time" })
  endTime: string;

  @ApiProperty({ description: "Duration in minutes" })
  @Column({ type: "int", default: 30 })
  durationMinutes: number;

  @ApiProperty({ description: "Appointment title" })
  @Column({ nullable: true })
  title?: string;

  @ApiProperty({ description: "Appointment description" })
  @Column({ type: "text", nullable: true })
  description?: string;

  @ApiProperty({ description: "Cancellation reason" })
  @Column({ type: "text", nullable: true })
  cancellationReason?: string;

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

  @ManyToOne(() => AgentConversation, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "conversationId" })
  conversation?: AgentConversation;

  @Column({ name: "conversationId", nullable: true })
  conversationId?: string;
}
