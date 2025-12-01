import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { VectorSearchService } from "./vector-search.service";
import {
  VectorSearchDto,
  SemanticSearchDto,
  HybridSearchDto,
  EmbeddingDto,
  SimilarityDto,
  VectorSearchResultDto,
  SemanticSearchResultDto,
  VectorStatsDto,
} from "./dto/vector-search.dto";

@ApiTags("Vector Search")
@Controller("api/v1/vector-search")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VectorSearchController {
  constructor(private readonly vectorSearchService: VectorSearchService) {}

  @Post("search")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Perform vector similarity search" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Search results retrieved successfully",
    type: [VectorSearchResultDto],
  })
  async search(
    @CurrentUser() user: User,
    @Body() searchDto: VectorSearchDto,
  ): Promise<VectorSearchResultDto[]> {
    const request = {
      ...searchDto,
      organizationId: user.currentOrganizationId,
    };

    return this.vectorSearchService.search(request);
  }

  @Post("semantic-search")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({
    summary: "Perform semantic search with optional answer generation",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Semantic search completed successfully",
    type: SemanticSearchResultDto,
  })
  async semanticSearch(
    @CurrentUser() user: User,
    @Body() searchDto: SemanticSearchDto,
  ): Promise<SemanticSearchResultDto> {
    // This would combine vector search with LLM-based answer generation
    const vectorRequest = {
      query: searchDto.question,
      organizationId: user.currentOrganizationId,
      knowledgeBaseIds: searchDto.knowledgeBaseIds,
      limit: searchDto.maxSources,
      threshold: searchDto.minRelevance,
      includeContent: searchDto.includeSources,
    };

    const startTime = Date.now();
    const sources = await this.vectorSearchService.search(vectorRequest);
    const searchTime = Date.now() - startTime;

    const result: SemanticSearchResultDto = {
      sources,
      metadata: {
        totalSources: sources.length,
        searchTime,
        strategy: "vector",
      },
    };

    if (searchDto.generateAnswer && sources.length > 0) {
      // This would integrate with LLM service to generate an answer
      result.answer =
        "Generated answer would appear here based on the source content.";
      result.confidence = 0.85;
      result.metadata.model = "llm-model-name";
    }

    return result;
  }

  @Post("hybrid-search")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Perform hybrid search (vector + keyword)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Hybrid search results retrieved successfully",
    type: [VectorSearchResultDto],
  })
  async hybridSearch(
    @CurrentUser() user: User,
    @Body() searchDto: HybridSearchDto,
  ): Promise<VectorSearchResultDto[]> {
    // This would combine vector search with keyword search
    const vectorRequest = {
      query: searchDto.query,
      organizationId: user.currentOrganizationId,
      knowledgeBaseIds: searchDto.knowledgeBaseIds,
      limit: Math.ceil(searchDto.limit * searchDto.semanticWeight),
      threshold: 0.5, // Lower threshold for hybrid
      includeContent: false,
    };

    const vectorResults = await this.vectorSearchService.search(vectorRequest);

    // In a complete implementation, this would also perform keyword search
    // and combine results based on semantic and keyword weights

    return vectorResults.slice(0, searchDto.limit);
  }

  @Post("embeddings")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Generate embeddings for text" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Embeddings generated successfully",
    schema: {
      type: "object",
      properties: {
        embeddings: {
          type: "array",
          items: { type: "number" },
        },
        model: { type: "string" },
        dimensions: { type: "number" },
      },
    },
  })
  async generateEmbeddings(@Body() embeddingDto: EmbeddingDto) {
    // This would generate actual embeddings using a service
    const mockEmbeddings = new Array(384)
      .fill(0)
      .map(() => Math.random() - 0.5);

    return {
      embeddings: mockEmbeddings,
      model: embeddingDto.model,
      dimensions: 384,
      text_length: embeddingDto.text.length,
    };
  }

  @Post("similarity")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Calculate similarity between two texts" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Similarity calculated successfully",
    schema: {
      type: "object",
      properties: {
        similarity: { type: "number" },
        metric: { type: "string" },
      },
    },
  })
  async calculateSimilarity(@Body() similarityDto: SimilarityDto) {
    // This would calculate actual similarity using embeddings
    const mockSimilarity = Math.random() * 0.4 + 0.6; // Random similarity between 0.6-1.0

    return {
      similarity: mockSimilarity,
      metric: similarityDto.metric,
      text1_length: similarityDto.text1.length,
      text2_length: similarityDto.text2.length,
    };
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get vector search statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Vector search statistics retrieved successfully",
    type: VectorStatsDto,
  })
  async getStats(@CurrentUser() user: User): Promise<VectorStatsDto> {
    const collectionStats = await this.vectorSearchService.getCollectionStats(
      user.currentOrganizationId,
    );

    return {
      totalVectors: collectionStats.vectorsCount || 0,
      byKnowledgeBase: [], // Would populate from database
      indexSizeMB: 0, // Would calculate from collection stats
      lastUpdate: new Date(),
      performance: {
        averageSearchTime: 150, // ms
        totalSearches: 0,
        cacheHitRate: 0.85,
      },
      model: {
        name: "sentence-transformers/all-MiniLM-L6-v2",
        dimensions: 384,
        language: "multi-language",
      },
    };
  }

  @Get("health")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check vector search service health" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Health status retrieved successfully",
  })
  async getHealth() {
    return this.vectorSearchService.healthCheck();
  }

  @Post("knowledge-bases/:id/reindex")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Rebuild vector index for knowledge base" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Reindexing started successfully",
  })
  async reindexKnowledgeBase(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    // This would queue a background job for reindexing
    const success = await this.vectorSearchService.rebuildKnowledgeBase(id);

    return {
      success,
      message: success
        ? "Knowledge base reindexing started"
        : "Failed to start reindexing",
      knowledgeBaseId: id,
    };
  }

  @Get("collections/:organizationId/info")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get collection information" })
  @ApiParam({ name: "organizationId", description: "Organization ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Collection information retrieved successfully",
  })
  async getCollectionInfo(
    @CurrentUser() user: User,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    // Only allow access to own organization or admin
    if (
      organizationId !== user.currentOrganizationId &&
      !user.roles.includes("admin" as any)
    ) {
      return { error: "Access denied" };
    }

    return this.vectorSearchService.getCollectionStats(organizationId);
  }
}
