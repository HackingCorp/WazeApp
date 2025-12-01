import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { User } from "./user.entity";
import { KnowledgeDocument } from "./knowledge-document.entity";

export enum KnowledgeBaseStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PROCESSING = "processing",
}

@Entity("knowledge_bases")
@Index("IDX_KB_ORG", ["organizationId"])
@Index("IDX_KB_NAME", ["name", "organizationId"])
export class KnowledgeBase extends BaseEntity {
  @ApiProperty({ description: "Knowledge base name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Knowledge base description", required: false })
  @Column({ nullable: true, type: "text" })
  description?: string;

  @ApiProperty({
    description: "Knowledge base status",
    enum: KnowledgeBaseStatus,
  })
  @Column({
    type: "enum",
    enum: KnowledgeBaseStatus,
    default: KnowledgeBaseStatus.ACTIVE,
  })
  status: KnowledgeBaseStatus;

  @ApiProperty({ description: "Knowledge base settings" })
  @Column({ type: "jsonb", default: {} })
  settings: {
    chunking?: {
      strategy: "fixed" | "semantic" | "recursive";
      chunkSize: number;
      overlap: number;
    };
    embedding?: {
      model: string;
      dimensions: number;
    };
    search?: {
      similarityThreshold: number;
      maxResults: number;
    };
  };

  @ApiProperty({ description: "Total character count" })
  @Column({ default: 0 })
  totalCharacters: number;

  @ApiProperty({ description: "Total document count" })
  @Column({ default: 0 })
  documentCount: number;

  @ApiProperty({ description: "Version for tracking updates" })
  @Column({ default: 1 })
  version: number;

  @ApiProperty({ description: "Tags for categorization" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  // Relationships
  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({ description: "Created by user" })
  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "createdBy" })
  creator: User;

  @Column({ name: "createdBy", nullable: true })
  createdBy: string;

  @OneToMany(() => KnowledgeDocument, (doc) => doc.knowledgeBase, {
    cascade: true,
  })
  documents: KnowledgeDocument[];
}
