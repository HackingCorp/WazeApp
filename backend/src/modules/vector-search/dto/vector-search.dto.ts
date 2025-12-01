import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";

export class VectorSearchDto {
  @ApiProperty({ description: "Search query text" })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: "Knowledge base IDs to search within" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({
    description: "Maximum number of results",
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: "Minimum similarity threshold (0-1)",
    default: 0.7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number = 0.7;

  @ApiPropertyOptional({
    description: "Include full content in results",
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeContent?: boolean = false;

  @ApiPropertyOptional({
    description: "Search strategy",
    enum: ["vector", "text", "hybrid"],
  })
  @IsOptional()
  @IsString()
  strategy?: "vector" | "text" | "hybrid" = "vector";
}

export class SemanticSearchDto {
  @ApiProperty({ description: "Natural language question" })
  @IsString()
  question: string;

  @ApiPropertyOptional({ description: "Context for the question" })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({ description: "Knowledge base IDs to search within" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({ description: "Maximum number of sources", default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxSources?: number = 5;

  @ApiPropertyOptional({ description: "Minimum relevance score", default: 0.7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minRelevance?: number = 0.7;

  @ApiPropertyOptional({ description: "Include source content", default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeSources?: boolean = true;

  @ApiPropertyOptional({
    description: "Generate answer using LLM",
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  generateAnswer?: boolean = false;
}

export class HybridSearchDto {
  @ApiProperty({ description: "Search query" })
  @IsString()
  query: string;

  @ApiPropertyOptional({ description: "Keywords for exact matching" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ description: "Semantic weight (0-1)", default: 0.7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  semanticWeight?: number = 0.7;

  @ApiPropertyOptional({ description: "Keyword weight (0-1)", default: 0.3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  keywordWeight?: number = 0.3;

  @ApiPropertyOptional({ description: "Knowledge base IDs to search within" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({ description: "Maximum results", default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

export class EmbeddingDto {
  @ApiProperty({ description: "Text to generate embeddings for" })
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: "Embedding model to use" })
  @IsOptional()
  @IsString()
  model?: string = "sentence-transformers/all-MiniLM-L6-v2";

  @ApiPropertyOptional({ description: "Normalize embeddings", default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  normalize?: boolean = true;
}

export class SimilarityDto {
  @ApiProperty({ description: "First text for comparison" })
  @IsString()
  text1: string;

  @ApiProperty({ description: "Second text for comparison" })
  @IsString()
  text2: string;

  @ApiPropertyOptional({
    description: "Similarity metric",
    enum: ["cosine", "dot", "euclidean"],
  })
  @IsOptional()
  @IsString()
  metric?: "cosine" | "dot" | "euclidean" = "cosine";
}

export class VectorSearchResultDto {
  @ApiProperty({ description: "Document chunk information" })
  chunk: {
    id: string;
    content: string;
    chunkOrder: number;
    characterCount: number;
    metadata?: any;
  };

  @ApiProperty({ description: "Similarity score (0-1)" })
  score: number;

  @ApiProperty({ description: "Source document information" })
  document: {
    id: string;
    title: string;
    filename: string;
    type: string;
  };

  @ApiProperty({ description: "Knowledge base information" })
  knowledgeBase: {
    id: string;
    name: string;
  };
}

export class SemanticSearchResultDto {
  @ApiProperty({ description: "Generated answer (if requested)" })
  answer?: string;

  @ApiProperty({ description: "Confidence score for the answer" })
  confidence?: number;

  @ApiProperty({ description: "Source chunks used for the answer" })
  sources: VectorSearchResultDto[];

  @ApiProperty({ description: "Search metadata" })
  metadata: {
    totalSources: number;
    searchTime: number;
    model?: string;
    strategy: string;
  };
}

export class VectorStatsDto {
  @ApiProperty({ description: "Total vectors indexed" })
  totalVectors: number;

  @ApiProperty({ description: "Vectors by knowledge base" })
  byKnowledgeBase: Array<{
    knowledgeBaseId: string;
    knowledgeBaseName: string;
    vectorCount: number;
  }>;

  @ApiProperty({ description: "Index size in MB" })
  indexSizeMB: number;

  @ApiProperty({ description: "Last index update" })
  lastUpdate: Date;

  @ApiProperty({ description: "Search performance metrics" })
  performance: {
    averageSearchTime: number;
    totalSearches: number;
    cacheHitRate?: number;
  };

  @ApiProperty({ description: "Embedding model information" })
  model: {
    name: string;
    dimensions: number;
    language: string;
  };
}
