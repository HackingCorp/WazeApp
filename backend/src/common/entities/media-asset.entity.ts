import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { MediaType, MediaQuality } from "../enums";

@Entity("media_assets")
@Index("IDX_MEDIA_ORG_TYPE", ["organizationId", "mediaType"])
@Index("IDX_MEDIA_FILENAME", ["filename"])
@Index("IDX_MEDIA_TAGS", ["tags"])
export class MediaAsset extends BaseEntity {
  @ApiProperty({ description: "Original filename" })
  @Column()
  filename: string;

  @ApiProperty({ description: "Media type" })
  @Column({
    type: "enum",
    enum: MediaType,
  })
  mediaType: MediaType;

  @ApiProperty({ description: "File size in bytes" })
  @Column("bigint")
  fileSize: number;

  @ApiProperty({ description: "MIME type" })
  @Column()
  mimeType: string;

  @ApiProperty({ description: "Storage path or URL" })
  @Column()
  storagePath: string;

  @ApiProperty({ description: "CDN URL if available" })
  @Column({ nullable: true })
  cdnUrl?: string;

  @ApiProperty({ description: "Thumbnail URL for images/videos" })
  @Column({ nullable: true })
  thumbnailUrl?: string;

  @ApiProperty({ description: "Media dimensions" })
  @Column("jsonb", { nullable: true })
  dimensions?: {
    width: number;
    height: number;
    duration?: number; // for videos/audio
  };

  @ApiProperty({ description: "Media quality variants" })
  @Column("jsonb", { default: {} })
  qualityVariants: Record<
    MediaQuality,
    {
      url: string;
      size: number;
      width?: number;
      height?: number;
    }
  >;

  @ApiProperty({ description: "Media tags for search" })
  @Column("text", { array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Alt text description" })
  @Column("text", { nullable: true })
  altText?: string;

  @ApiProperty({ description: "Usage count" })
  @Column("integer", { default: 0 })
  usageCount: number;

  @ApiProperty({ description: "Last used timestamp" })
  @Column({ type: "timestamp", nullable: true })
  lastUsedAt?: Date;

  @ApiProperty({ description: "Media metadata" })
  @Column("jsonb", { default: {} })
  metadata: {
    exif?: Record<string, any>;
    source?: string;
    license?: string;
    attribution?: string;
    searchQuery?: string;
    originalUrl?: string;
  };

  @ApiProperty({ description: "Public accessibility flag" })
  @Column("boolean", { default: false })
  isPublic: boolean;

  @ApiProperty({ description: "Media template flag" })
  @Column("boolean", { default: false })
  isTemplate: boolean;

  // Relationships
  @ApiProperty({ description: "Organization ID" })
  @Column("uuid")
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;
}
