import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Organization } from "./organization.entity";
import { AuditAction } from "../enums";

@Entity("audit_logs")
@Index("IDX_AUDIT_ORG_ACTION", ["organizationId", "action"])
@Index("IDX_AUDIT_USER", ["userId"])
@Index("IDX_AUDIT_DATE", ["createdAt"])
export class AuditLog extends BaseEntity {
  @ApiProperty({ description: "Audit action", enum: AuditAction })
  @Column({ type: "enum", enum: AuditAction })
  action: AuditAction;

  @ApiProperty({ description: "Resource type" })
  @Column()
  resourceType: string;

  @ApiProperty({ description: "Resource ID", required: false })
  @Column({ nullable: true })
  resourceId?: string;

  @ApiProperty({ description: "Action description" })
  @Column()
  description: string;

  @ApiProperty({ description: "User IP address", required: false })
  @Column({ nullable: true })
  ipAddress?: string;

  @ApiProperty({ description: "User agent", required: false })
  @Column({ nullable: true, type: "text" })
  userAgent?: string;

  @ApiProperty({ description: "Additional metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "User who performed action", required: false })
  @ManyToOne(() => User, (user) => user.auditLogs, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ name: "userId", nullable: true })
  userId?: string;

  @ApiProperty({ description: "Organization context", required: false })
  @ManyToOne(() => Organization, (org) => org.auditLogs, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;
}
