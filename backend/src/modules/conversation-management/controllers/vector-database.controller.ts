import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { AllowIndividualUsers } from "../../../common/decorators/allow-individual-users.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { UserRole } from "../../../common/enums";
import { User } from "../../../common/entities";
import { VectorEmbeddingService } from "../services/vector-embedding.service";
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray } from "class-validator";

class VectorSearchDto {
  @IsString() @IsNotEmpty() query: string;
  @IsOptional() @IsArray() knowledgeBaseIds?: string[];
  @IsOptional() @IsNumber() limit?: number = 10;
  @IsOptional() @IsNumber() scoreThreshold?: number = 0.7;
}

class GenerateEmbeddingDto {
  @IsString() @IsNotEmpty() chunkId: string;
  @IsOptional() @IsBoolean() forceRegenerate?: boolean = false;
}

class BulkEmbeddingDto {
  @IsArray() @IsNotEmpty() chunkIds: string[];
  @IsOptional() @IsBoolean() forceRegenerate?: boolean = false;
  @IsOptional() @IsNumber() batchSize?: number = 10;
}

@ApiTags("Vector Database")
@Controller("vector-database")
@UseGuards(JwtAuthGuard, RolesGuard)
@AllowIndividualUsers()
export class VectorDatabaseController {
  private readonly logger = new Logger(VectorDatabaseController.name);

  constructor(private vectorEmbeddingService: VectorEmbeddingService) {}

  @Post("search")
  @ApiOperation({
    summary: "Search for similar chunks using vector similarity",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Search completed successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async searchVectors(
    @CurrentUser() user: User,
    @Body() searchDto: VectorSearchDto,
  ) {
    if (!searchDto.query) {
      throw new BadRequestException("Search query is required");
    }

    const results = await this.vectorEmbeddingService.searchSimilarChunks({
      query: searchDto.query,
      knowledgeBaseIds: searchDto.knowledgeBaseIds,
      organizationId: user.currentOrganizationId!,
      limit: searchDto.limit,
      scoreThreshold: searchDto.scoreThreshold,
    });

    return {
      success: true,
      results,
      count: results.length,
      query: searchDto.query,
    };
  }

  @Post("embeddings/generate")
  @ApiOperation({ summary: "Generate embedding for a specific chunk" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Embedding generated successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async generateEmbedding(
    @CurrentUser() user: User,
    @Body() generateDto: GenerateEmbeddingDto,
  ) {
    await this.vectorEmbeddingService.storeChunkEmbedding(
      generateDto.chunkId,
      user.currentOrganizationId!,
      generateDto.forceRegenerate,
    );

    return {
      success: true,
      message: "Embedding generated and stored successfully",
      chunkId: generateDto.chunkId,
    };
  }

  @Post("embeddings/bulk-generate")
  @ApiOperation({ summary: "Generate embeddings for multiple chunks" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Bulk embedding generation started",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async bulkGenerateEmbeddings(
    @CurrentUser() user: User,
    @Body() bulkDto: BulkEmbeddingDto,
  ) {
    const batchSize = Math.min(bulkDto.batchSize || 10, 50); // Limit batch size
    const batches = [];

    // Split chunks into batches
    for (let i = 0; i < bulkDto.chunkIds.length; i += batchSize) {
      batches.push(bulkDto.chunkIds.slice(i, i + batchSize));
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process batches sequentially to avoid overwhelming the embedding service
    for (const batch of batches) {
      const batchPromises = batch.map(async (chunkId) => {
        try {
          await this.vectorEmbeddingService.storeChunkEmbedding(
            chunkId,
            user.currentOrganizationId!,
            bulkDto.forceRegenerate,
          );
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${chunkId}: ${error.message}`);
        }
      });

      await Promise.all(batchPromises);
    }

    return {
      success: true,
      message: `Bulk embedding generation completed`,
      results,
      totalProcessed: bulkDto.chunkIds.length,
    };
  }

  @Delete("embeddings/chunk/:chunkId")
  @ApiOperation({ summary: "Delete embedding for a specific chunk" })
  @ApiParam({ name: "chunkId", description: "Chunk ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Embedding deleted successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async deleteChunkEmbedding(
    @CurrentUser() user: User,
    @Param("chunkId") chunkId: string,
  ) {
    await this.vectorEmbeddingService.deleteChunkEmbedding(
      chunkId,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      message: "Embedding deleted successfully",
      chunkId,
    };
  }

  @Delete("embeddings/knowledge-base/:knowledgeBaseId")
  @ApiOperation({ summary: "Delete all embeddings for a knowledge base" })
  @ApiParam({ name: "knowledgeBaseId", description: "Knowledge Base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "All embeddings deleted successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async deleteKnowledgeBaseEmbeddings(
    @CurrentUser() user: User,
    @Param("knowledgeBaseId") knowledgeBaseId: string,
  ) {
    await this.vectorEmbeddingService.deleteKnowledgeBaseEmbeddings(
      knowledgeBaseId,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      message: "All knowledge base embeddings deleted successfully",
      knowledgeBaseId,
    };
  }

  @Get("stats")
  @ApiOperation({ summary: "Get vector database statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statistics retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getVectorStats(@CurrentUser() user: User) {
    const stats = await this.vectorEmbeddingService.getVectorStats(
      user.currentOrganizationId!,
    );

    return {
      success: true,
      stats,
      organizationId: user.currentOrganizationId!,
    };
  }

  @Get("health")
  @ApiOperation({ summary: "Check vector database health" })
  @ApiResponse({ status: HttpStatus.OK, description: "Health check completed" })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async checkHealth(@CurrentUser() user: User) {
    try {
      // Try to get stats as a health check
      const stats = await this.vectorEmbeddingService.getVectorStats(
        user.currentOrganizationId!,
      );

      return {
        success: true,
        status: "healthy",
        message: "Vector database is operational",
        stats,
      };
    } catch (error) {
      return {
        success: false,
        status: "unhealthy",
        message: `Vector database error: ${error.message}`,
        error: error.message,
      };
    }
  }

  @Post("reindex")
  @ApiOperation({ summary: "Reindex all embeddings for organization" })
  @ApiQuery({
    name: "knowledgeBaseId",
    required: false,
    description: "Specific knowledge base to reindex",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Reindexing started" })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async reindexEmbeddings(
    @CurrentUser() user: User,
    @Query("knowledgeBaseId") knowledgeBaseId?: string,
  ) {
    const organizationId = user.currentOrganizationId!;

    // Run detached so the HTTP request doesn't time out on large knowledge
    // bases; progress is visible via the stats endpoint and server logs.
    void this.vectorEmbeddingService
      .reindexOrganization(organizationId, knowledgeBaseId)
      .catch((error) =>
        this.logger.error(`Reindexing failed for organization ${organizationId}: ${error.message}`),
      );

    return {
      success: true,
      message: knowledgeBaseId
        ? `Reindexing started for knowledge base: ${knowledgeBaseId}`
        : "Full reindexing started for organization",
      organizationId,
      knowledgeBaseId,
      note: "Reindexing runs in the background. Check the stats endpoint for progress.",
    };
  }

  @Get("embeddings/info/:chunkId")
  @ApiOperation({ summary: "Get embedding information for a chunk" })
  @ApiParam({ name: "chunkId", description: "Chunk ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Embedding info retrieved",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getEmbeddingInfo(
    @CurrentUser() user: User,
    @Param("chunkId") chunkId: string,
  ) {
    // This would check if embedding exists and return metadata
    // For now, return a mock response

    return {
      success: true,
      chunkId,
      embedding: {
        exists: true,
        model: "text-embedding-3-small",
        dimensions: 1536,
        lastUpdated: new Date().toISOString(),
        vectorId: "mock-vector-id",
      },
    };
  }
}
