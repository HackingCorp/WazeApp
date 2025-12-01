import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { KnowledgeBaseStatus } from "../../../common/enums";

export class CreateKnowledgeBaseDto {
  @ApiProperty({ description: "Knowledge base name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Knowledge base description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Knowledge base settings",
    example: {
      chunking: {
        strategy: "recursive",
        chunkSize: 1000,
        overlap: 100,
      },
      embedding: {
        model: "sentence-transformers/all-MiniLM-L6-v2",
        dimensions: 384,
      },
    },
  })
  @IsOptional()
  @IsObject()
  settings?: {
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

  @ApiPropertyOptional({
    description: "Tags for categorization",
    example: ["customer-support", "product-info"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Associated AI agent ID" })
  @IsOptional()
  @IsString()
  agentId?: string;
}

export class UpdateKnowledgeBaseDto {
  @ApiPropertyOptional({ description: "Knowledge base name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Knowledge base description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Knowledge base status" })
  @IsOptional()
  @IsEnum(KnowledgeBaseStatus)
  status?: KnowledgeBaseStatus;

  @ApiPropertyOptional({ description: "Knowledge base settings" })
  @IsOptional()
  @IsObject()
  settings?: any;

  @ApiPropertyOptional({ description: "Tags for categorization" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class KnowledgeBaseQueryDto {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(KnowledgeBaseStatus)
  status?: KnowledgeBaseStatus;

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

export class KnowledgeBaseStatsDto {
  @ApiProperty({ description: "Total knowledge bases" })
  total: number;

  @ApiProperty({ description: "Active knowledge bases" })
  active: number;

  @ApiProperty({ description: "Processing knowledge bases" })
  processing: number;

  @ApiProperty({ description: "Total documents" })
  totalDocuments: number;

  @ApiProperty({ description: "Total characters" })
  totalCharacters: number;

  @ApiProperty({ description: "Character usage by subscription plan" })
  characterUsage: {
    used: number;
    limit: number;
    percentage: number;
  };
}
