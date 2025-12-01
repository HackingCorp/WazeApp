import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { KnowledgeDocument } from "./knowledge-document.entity";

@Entity("document_chunks")
@Index("IDX_CHUNK_DOC", ["documentId"])
@Index("IDX_CHUNK_ORDER", ["documentId", "chunkOrder"])
export class DocumentChunk extends BaseEntity {
  @ApiProperty({ description: "Chunk content" })
  @Column({ type: "text" })
  content: string;

  @ApiProperty({ description: "Chunk order within document" })
  @Column()
  chunkOrder: number;

  @ApiProperty({ description: "Character count of chunk" })
  @Column()
  characterCount: number;

  @ApiProperty({ description: "Token count estimate" })
  @Column({ default: 0 })
  tokenCount: number;

  @ApiProperty({ description: "Start position in original document" })
  @Column({ default: 0 })
  startPosition: number;

  @ApiProperty({ description: "End position in original document" })
  @Column({ default: 0 })
  endPosition: number;

  @ApiProperty({ description: "Chunk metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    headings?: string[];
    pageNumber?: number;
    section?: string;
    confidence?: number;
    embeddings?: number[];
    vectorId?: string; // Qdrant point ID
  };

  // Relationships
  @ApiProperty({ description: "Parent document" })
  @ManyToOne(() => KnowledgeDocument, (doc) => doc.chunks, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "documentId" })
  document: KnowledgeDocument;

  @Column({ name: "documentId" })
  documentId: string;
}
