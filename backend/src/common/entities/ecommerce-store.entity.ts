import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { EcommercePlatform, StoreConnectionStatus } from "../enums";

@Entity("ecommerce_stores")
@Index("IDX_STORE_ORG", ["organizationId"])
@Index("IDX_STORE_PLATFORM", ["platform"])
export class EcommerceStore extends BaseEntity {
  @ApiProperty({ description: "Store name" })
  @Column()
  name: string;

  @ApiProperty({ description: "E-commerce platform", enum: EcommercePlatform })
  @Column({ type: "enum", enum: EcommercePlatform })
  platform: EcommercePlatform;

  @ApiProperty({ description: "Connection status", enum: StoreConnectionStatus })
  @Column({ type: "enum", enum: StoreConnectionStatus, default: StoreConnectionStatus.PENDING })
  status: StoreConnectionStatus;

  @ApiProperty({ description: "Store URL" })
  @Column({ nullable: true })
  storeUrl?: string;

  @ApiProperty({ description: "Store credentials (encrypted)" })
  @Column({ type: "jsonb", default: {} })
  credentials: {
    accessToken?: string;
    consumerKey?: string;
    consumerSecret?: string;
  };

  @ApiProperty({ description: "Sync configuration" })
  @Column({ type: "jsonb", default: {} })
  syncConfig: {
    autoSync?: boolean;
    syncIntervalMinutes?: number;
    lastSyncAt?: string;
    lastSyncStatus?: string;
    totalProductsSynced?: number;
    webhookSecret?: string;
  };

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @Column({ name: "createdBy", nullable: true })
  createdBy?: string;
}
