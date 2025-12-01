import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  IsUrl,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { DocumentType, DocumentStatus } from "../../../common/enums";

export class UploadDocumentDto {
  @ApiProperty({ description: "Document title" })
  @IsString()
  title: string;

  @ApiProperty({ description: "Document type", enum: DocumentType })
  @IsEnum(DocumentType)
  type: DocumentType;

  @ApiPropertyOptional({ description: "Knowledge base ID" })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: "Document tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Document metadata" })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class UploadUrlDocumentDto {
  @ApiProperty({ description: "URL to scrape" })
  @IsUrl()
  url: string;

  @ApiProperty({ description: "Document title" })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: "Knowledge base ID" })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: "Document tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Scraping options" })
  @IsOptional()
  @IsObject()
  options?: {
    waitForSelector?: string;
    removeSelectors?: string[];
    includeImages?: boolean;
    followLinks?: boolean;
    maxDepth?: number;
  };
}

export class UploadMultipleUrlsDocumentDto {
  @ApiProperty({ description: "URLs to scrape", type: [String] })
  @IsArray()
  @IsUrl({}, { each: true })
  urls: string[];

  @ApiProperty({ description: "Base title for documents (will be appended with URL info)" })
  @IsString()
  baseTitle: string;

  @ApiPropertyOptional({ description: "Knowledge base ID" })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: "Document tags to apply to all documents" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Scraping options for all URLs" })
  @IsOptional()
  @IsObject()
  options?: {
    waitForSelector?: string;
    removeSelectors?: string[];
    includeImages?: boolean;
    followLinks?: boolean;
    maxDepth?: number;
  };
}

export class CreateRichTextDocumentDto {
  @ApiProperty({ description: "Document title" })
  @IsString()
  title: string;

  @ApiProperty({ description: "Rich text content (HTML)" })
  @IsString()
  content: string;

  @ApiProperty({ description: "Knowledge base ID" })
  @IsString()
  knowledgeBaseId: string;

  @ApiPropertyOptional({ description: "Document filename" })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: "MIME type" })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: "Document tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Document metadata" })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({ description: "Document title" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: "Document status" })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ description: "Document tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Document metadata" })
  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class DocumentQueryDto {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by type" })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({ description: "Filter by knowledge base ID" })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({ description: "Filter by tags" })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.split(",") : value,
  )
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Page number", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;
}

export class DocumentSearchDto {
  @ApiProperty({ description: "Search query" })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: "Knowledge base ID to search within" })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({
    description: "Maximum number of results",
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Minimum similarity threshold",
    default: 0.7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number = 0.7;

  @ApiPropertyOptional({
    description: "Include document content in results",
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeContent?: boolean = false;
}

export class DocumentStatsDto {
  @ApiProperty({ description: "Total documents" })
  total: number;

  @ApiProperty({ description: "Documents by status" })
  byStatus: Record<DocumentStatus, number>;

  @ApiProperty({ description: "Documents by type" })
  byType: Record<DocumentType, number>;

  @ApiProperty({ description: "Total file size in bytes" })
  totalSize: number;

  @ApiProperty({ description: "Total character count" })
  totalCharacters: number;

  @ApiProperty({ description: "Average processing time in seconds" })
  avgProcessingTime: number;
}
