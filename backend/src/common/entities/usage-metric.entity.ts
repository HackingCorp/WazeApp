import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { Subscription } from "./subscription.entity";
import { UsageMetricType } from "../enums";

@Entity("usage_metrics")
@Index("IDX_USAGE_ORG_TYPE_DATE", ["organizationId", "type", "date"])
@Index("IDX_USAGE_SUBSCRIPTION", ["subscriptionId"])
export class UsageMetric extends BaseEntity {
  @ApiProperty({ description: "Usage metric type", enum: UsageMetricType })
  @Column({ type: "enum", enum: UsageMetricType })
  type: UsageMetricType;

  @ApiProperty({ description: "Usage value" })
  @Column({ type: "bigint", default: 0 })
  value: number;

  @ApiProperty({ description: "Usage date (for monthly aggregation)" })
  @Column({ type: "date" })
  date: string;

  @ApiProperty({ description: "Usage metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, (org) => org.usageMetrics, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({ description: "Subscription" })
  @ManyToOne(() => Subscription, (sub) => sub.usageMetrics, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "subscriptionId" })
  subscription?: Subscription;

  @Column({ name: "subscriptionId", nullable: true })
  subscriptionId?: string;
}
