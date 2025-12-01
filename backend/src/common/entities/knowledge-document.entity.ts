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
import { KnowledgeBase } from "./knowledge-base.entity";
import { User } from "./user.entity";
import { DocumentChunk } from "./document-chunk.entity";

export enum DocumentType {
  PDF = "pdf",
  DOCX = "docx",
  TXT = "txt",
  MD = "md",
  RICH_TEXT = "rich_text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  URL = "url",
}

export enum DocumentStatus {
  UPLOADED = "uploaded",
  PROCESSING = "processing",
  PROCESSED = "processed",
  FAILED = "failed",
  ARCHIVED = "archived",
}

@Entity("knowledge_documents")
@Index("IDX_DOC_KB", ["knowledgeBaseId"])
@Index("IDX_DOC_TYPE", ["type"])
@Index("IDX_DOC_STATUS", ["status"])
export class KnowledgeDocument extends BaseEntity {
  @ApiProperty({ description: "Document filename" })
  @Column()
  filename: string;

  @ApiProperty({ description: "Document title" })
  @Column()
  title: string;

  @ApiProperty({ description: "Document type", enum: DocumentType })
  @Column({ type: "enum", enum: DocumentType })
  type: DocumentType;

  @ApiProperty({ description: "File size in bytes" })
  @Column()
  fileSize: number;

  @ApiProperty({ description: "MIME type" })
  @Column()
  mimeType: string;

  @ApiProperty({ description: "File path or URL" })
  @Column()
  filePath: string;

  @ApiProperty({ description: "Document status", enum: DocumentStatus })
  @Column({
    type: "enum",
    enum: DocumentStatus,
    default: DocumentStatus.UPLOADED,
  })
  status: DocumentStatus;

  @ApiProperty({ description: "Extracted text content" })
  @Column({ type: "text", nullable: true })
  content?: string;

  @ApiProperty({ description: "Character count of content" })
  @Column({ default: 0 })
  characterCount: number;

  @ApiProperty({ description: "Document metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    author?: string;
    createdDate?: string;
    modifiedDate?: string;
    language?: string;
    keywords?: string[];
    summary?: string;
    thumbnailUrl?: string;
    duration?: number; // for audio/video
    transcript?: string; // for audio/video
    ocrText?: string; // for images
    pageCount?: number; // for PDFs
    wordCount?: number;
    extractionMethod?: string;
    confidence?: number;
  };

  @ApiProperty({ description: "Processing error details" })
  @Column({ type: "jsonb", nullable: true })
  processingError?: {
    message: string;
    stack?: string;
    timestamp: Date;
    retryCount: number;
  };

  @ApiProperty({ description: "Document tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Document version" })
  @Column({ default: 1 })
  version: number;

  @ApiProperty({ description: "Hash for duplicate detection" })
  @Column({ nullable: true })
  contentHash?: string;

  // Relationships
  @ApiProperty({ description: "Knowledge base" })
  @ManyToOne(() => KnowledgeBase, (kb) => kb.documents, { onDelete: "CASCADE" })
  @JoinColumn({ name: "knowledgeBaseId" })
  knowledgeBase: KnowledgeBase;

  @Column({ name: "knowledgeBaseId" })
  knowledgeBaseId: string;

  @ApiProperty({ description: "Uploaded by user" })
  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "uploadedBy" })
  uploader: User;

  @Column({ name: "uploadedBy", nullable: true })
  uploadedBy: string;

  @OneToMany(() => DocumentChunk, (chunk) => chunk.document, {
    cascade: true,
  })
  chunks: DocumentChunk[];
}
