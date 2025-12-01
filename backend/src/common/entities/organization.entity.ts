import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { OrganizationMember } from "./organization-member.entity";
import { Subscription } from "./subscription.entity";
import { AuditLog } from "./audit-log.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";
import { UsageMetric } from "./usage-metric.entity";

@Entity("organizations")
@Index("IDX_ORG_SLUG", ["slug"])
export class Organization extends BaseEntity {
  @ApiProperty({ description: "Organization name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Organization slug/identifier" })
  @Column({ unique: true })
  slug: string;

  @ApiProperty({ description: "Organization description", required: false })
  @Column({ nullable: true, type: "text" })
  description?: string;

  @ApiProperty({ description: "Organization logo URL", required: false })
  @Column({ nullable: true })
  logo?: string;

  @ApiProperty({ description: "Organization website", required: false })
  @Column({ nullable: true })
  website?: string;

  @ApiProperty({ description: "Organization timezone" })
  @Column({ default: "UTC" })
  timezone: string;

  @ApiProperty({ description: "Organization active status" })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: "Organization settings" })
  @Column({ type: "jsonb", default: {} })
  settings: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "Organization owner" })
  @ManyToOne(() => User, (user) => user.ownedOrganizations, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @Column({ name: "ownerId" })
  ownerId: string;

  @OneToMany(() => OrganizationMember, (member) => member.organization, {
    cascade: true,
  })
  organizationMembers: OrganizationMember[];

  @OneToMany(() => Subscription, (subscription) => subscription.organization)
  subscriptions: Subscription[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.organization)
  auditLogs: AuditLog[];

  @OneToMany(() => WhatsAppSession, (session) => session.organization)
  whatsappSessions: WhatsAppSession[];

  @OneToMany(() => UsageMetric, (metric) => metric.organization)
  usageMetrics: UsageMetric[];

  // Virtual properties
  @ApiProperty({ description: "Member count" })
  get memberCount(): number {
    return this.organizationMembers?.length || 0;
  }
}
