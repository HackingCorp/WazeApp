import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { QdrantClient } from "@qdrant/js-client-rest";
import {
  DocumentChunk,
  KnowledgeBase,
  UsageMetric,
} from "../../../common/entities";
import { UsageMetricType } from "../../../common/enums";

export interface EmbeddingRequest {
  text: string;
  model?: string;
  chunkId?: string;
  metadata?: Record<string, any>;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokensUsed: number;
  dimensions: number;
}

export interface VectorSearchRequest {
  query: string;
  knowledgeBaseIds?: string[];
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  filters?: Record<string, any>;
}

export interface VectorSearchResult {
  chunk: DocumentChunk;
  score: number;
  document: {
    id: string;
    title: string;
    type: string;
  };
  knowledgeBase: {
    id: string;
    name: string;
  };
}

@Injectable()
export class VectorEmbeddingService {
  private readonly logger = new Logger(VectorEmbeddingService.name);
  private qdrantClient: QdrantClient;
  private embeddingProvider: "openai" | "sentence-transformers" | "custom";

  constructor(
    @InjectRepository(DocumentChunk)
    private chunkRepository: Repository<DocumentChunk>,
    @InjectRepository(KnowledgeBase)
    private knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.initializeVectorDatabase();
    this.initializeEmbeddingProvider();
  }

  /**
   * Initialize Qdrant vector database client
   */
  private initializeVectorDatabase(): void {
    const qdrantUrl = this.configService.get(
      "QDRANT_URL",
      "http://localhost:6333",
    );
    const qdrantApiKey = this.configService.get("QDRANT_API_KEY");

    this.qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    this.logger.log(`Qdrant client initialized: ${qdrantUrl}`);
  }

  /**
   * Determine embedding provider
   */
  private initializeEmbeddingProvider(): void {
    if (this.configService.get("OPENAI_API_KEY")) {
      this.embeddingProvider = "openai";
    } else if (this.configService.get("EMBEDDING_API_URL")) {
      this.embeddingProvider = "custom";
    } else {
      this.embeddingProvider = "sentence-transformers";
    }

    this.logger.log(`Embedding provider: ${this.embeddingProvider}`);
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResult> {
    this.logger.debug(
      `Generating embedding for text: ${request.text.substring(0, 100)}...`,
    );

    try {
      switch (this.embeddingProvider) {
        case "openai":
          return await this.generateOpenAIEmbedding(request);
        case "sentence-transformers":
          return await this.generateTransformerEmbedding(request);
        case "custom":
          return await this.generateCustomEmbedding(request);
        default:
          throw new Error(
            `Unsupported embedding provider: ${this.embeddingProvider}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Embedding generation failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate embeddings using OpenAI API
   */
  private async generateOpenAIEmbedding(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResult> {
    const apiKey = this.configService.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = request.model || "text-embedding-3-small";

    const response = await firstValueFrom(
      this.httpService.post(
        "https://api.openai.com/v1/embeddings",
        {
          input: request.text,
          model,
          encoding_format: "float",
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const embedding = response.data.data[0].embedding;
    const tokensUsed = response.data.usage.total_tokens;

    return {
      embedding,
      model,
      tokensUsed,
      dimensions: embedding.length,
    };
  }

  /**
   * Generate embeddings using sentence-transformers (mock implementation)
   */
  private async generateTransformerEmbedding(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResult> {
    // Mock implementation for sentence-transformers
    // In production, this would call a local sentence-transformer service

    const model = request.model || "all-MiniLM-L6-v2";
    const dimensions = 384; // typical for all-MiniLM-L6-v2

    // Generate mock embedding (in production, replace with actual transformer call)
    const embedding = Array.from(
      { length: dimensions },
      () => Math.random() - 0.5,
    );

    // Normalize the vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0),
    );
    const normalizedEmbedding = embedding.map((val) => val / magnitude);

    return {
      embedding: normalizedEmbedding,
      model,
      tokensUsed: Math.ceil(request.text.length / 4), // Approximate token count
      dimensions,
    };
  }

  /**
   * Generate embeddings using custom API
   */
  private async generateCustomEmbedding(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResult> {
    const apiUrl = this.configService.get("EMBEDDING_API_URL");
    const apiKey = this.configService.get("EMBEDDING_API_KEY");

    if (!apiUrl) {
      throw new Error("Custom embedding API URL not configured");
    }

    const response = await firstValueFrom(
      this.httpService.post(
        `${apiUrl}/embed`,
        {
          text: request.text,
          model: request.model || "default",
        },
        {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        },
      ),
    );

    return {
      embedding: response.data.embedding,
      model: response.data.model,
      tokensUsed: response.data.tokens_used || 0,
      dimensions: response.data.embedding.length,
    };
  }

  /**
   * Store document chunk with embedding
   */
  async storeChunkEmbedding(
    chunkId: string,
    organizationId: string,
    forceRegenerate: boolean = false,
  ): Promise<void> {
    const chunk = await this.chunkRepository.findOne({
      where: { id: chunkId },
      relations: ["document", "document.knowledgeBase"],
    });

    if (!chunk) {
      throw new Error(`Chunk not found: ${chunkId}`);
    }

    // Skip if embedding already exists and not forcing regeneration
    if (chunk.metadata?.embeddings && !forceRegenerate) {
      this.logger.debug(`Embedding already exists for chunk: ${chunkId}`);
      return;
    }

    try {
      // Generate embedding
      const embeddingResult = await this.generateEmbedding({
        text: chunk.content,
        chunkId: chunk.id,
        metadata: {
          documentId: chunk.document.id,
          knowledgeBaseId: chunk.document.knowledgeBase.id,
        },
      });

      // Store in Qdrant
      const collectionName = this.getCollectionName(organizationId);
      await this.ensureCollection(collectionName, embeddingResult.dimensions);

      const pointId = this.generatePointId(chunk.id);
      await this.qdrantClient.upsert(collectionName, {
        wait: true,
        points: [
          {
            id: pointId,
            vector: embeddingResult.embedding,
            payload: {
              chunk_id: chunk.id,
              document_id: chunk.document.id,
              knowledge_base_id: chunk.document.knowledgeBase.id,
              organization_id: organizationId,
              content: chunk.content.substring(0, 1000), // Store first 1000 chars for debugging
              title: chunk.document.title,
              chunk_order: chunk.chunkOrder,
              character_count: chunk.characterCount,
              token_count: chunk.tokenCount,
              metadata: chunk.metadata || {},
            },
          },
        ],
      });

      // Update chunk metadata
      await this.chunkRepository.update(chunk.id, {
        metadata: {
          ...chunk.metadata,
          embeddings: embeddingResult.embedding,
          vectorId: pointId.toString(),
        },
      });

      // Track usage
      await this.trackEmbeddingUsage(
        organizationId,
        embeddingResult.tokensUsed,
        embeddingResult.model,
      );

      this.logger.debug(
        `Stored embedding for chunk: ${chunkId} with point ID: ${pointId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store embedding for chunk ${chunkId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async searchSimilarChunks(
    request: VectorSearchRequest,
  ): Promise<VectorSearchResult[]> {
    this.logger.debug(
      `Vector search query: ${request.query.substring(0, 100)}...`,
    );

    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding({
        text: request.query,
      });

      const collectionName = this.getCollectionName(request.organizationId);

      // Build filters
      const filter: any = {
        must: [
          {
            key: "organization_id",
            match: { value: request.organizationId },
          },
        ],
      };

      if (request.knowledgeBaseIds && request.knowledgeBaseIds.length > 0) {
        filter.must.push({
          key: "knowledge_base_id",
          match: { any: request.knowledgeBaseIds },
        });
      }

      // Perform vector search
      const searchResult = await this.qdrantClient.search(collectionName, {
        vector: queryEmbedding.embedding,
        filter,
        limit: request.limit || 10,
        score_threshold: request.scoreThreshold || 0.7,
        with_payload: true,
      });

      // Convert to search results
      const results: VectorSearchResult[] = [];

      for (const point of searchResult) {
        const payload = point.payload;

        // Get full chunk data from database
        const chunk = await this.chunkRepository.findOne({
          where: { id: payload.chunk_id as string },
          relations: ["document", "document.knowledgeBase"],
        });

        if (chunk) {
          results.push({
            chunk,
            score: point.score,
            document: {
              id: chunk.document.id,
              title: chunk.document.title,
              type: chunk.document.type,
            },
            knowledgeBase: {
              id: chunk.document.knowledgeBase.id,
              name: chunk.document.knowledgeBase.name,
            },
          });
        }
      }

      // Track search usage
      await this.trackSearchUsage(
        request.organizationId,
        queryEmbedding.tokensUsed,
      );

      this.logger.debug(`Vector search returned ${results.length} results`);
      return results;
    } catch (error) {
      this.logger.error(`Vector search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete embeddings for a chunk
   */
  async deleteChunkEmbedding(
    chunkId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const collectionName = this.getCollectionName(organizationId);
      const pointId = this.generatePointId(chunkId);

      await this.qdrantClient.delete(collectionName, {
        wait: true,
        points: [pointId],
      });

      this.logger.debug(`Deleted embedding for chunk: ${chunkId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete embedding for chunk ${chunkId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete all embeddings for a knowledge base
   */
  async deleteKnowledgeBaseEmbeddings(
    knowledgeBaseId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const collectionName = this.getCollectionName(organizationId);

      await this.qdrantClient.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: "knowledge_base_id",
              match: { value: knowledgeBaseId },
            },
          ],
        },
      });

      this.logger.log(
        `Deleted all embeddings for knowledge base: ${knowledgeBaseId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete knowledge base embeddings: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get vector database statistics
   */
  async getVectorStats(organizationId: string): Promise<{
    totalChunks: number;
    totalSize: number;
    dimensions: number;
    lastIndexed: Date | null;
  }> {
    try {
      const collectionName = this.getCollectionName(organizationId);

      // Get collection info
      const collectionInfo =
        await this.qdrantClient.getCollection(collectionName);

      return {
        totalChunks: collectionInfo.points_count || 0,
        totalSize: collectionInfo.segments_count || 0,
        dimensions: (collectionInfo.config?.params?.vectors as any)?.size || 0,
        lastIndexed: new Date(), // Could be tracked in metadata
      };
    } catch (error) {
      this.logger.warn(`Failed to get vector stats: ${error.message}`);
      return {
        totalChunks: 0,
        totalSize: 0,
        dimensions: 0,
        lastIndexed: null,
      };
    }
  }

  /**
   * Ensure collection exists with proper configuration
   */
  private async ensureCollection(
    collectionName: string,
    dimensions: number,
  ): Promise<void> {
    try {
      await this.qdrantClient.getCollection(collectionName);
      this.logger.debug(`Collection exists: ${collectionName}`);
    } catch (error) {
      // Collection doesn't exist, create it
      this.logger.log(
        `Creating collection: ${collectionName} with dimensions: ${dimensions}`,
      );

      await this.qdrantClient.createCollection(collectionName, {
        vectors: {
          size: dimensions,
          distance: "Cosine", // Use cosine similarity
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });

      // Create indexes for faster filtering
      await this.qdrantClient.createPayloadIndex(collectionName, {
        field_name: "organization_id",
        field_schema: "keyword",
      });

      await this.qdrantClient.createPayloadIndex(collectionName, {
        field_name: "knowledge_base_id",
        field_schema: "keyword",
      });

      await this.qdrantClient.createPayloadIndex(collectionName, {
        field_name: "document_id",
        field_schema: "keyword",
      });
    }
  }

  /**
   * Generate collection name for organization
   */
  private getCollectionName(organizationId: string): string {
    return `wizeapp_org_${organizationId.replace(/-/g, "_")}`;
  }

  /**
   * Generate point ID from chunk ID
   */
  private generatePointId(chunkId: string): number {
    // Convert UUID to numeric ID for Qdrant
    return parseInt(chunkId.replace(/-/g, "").substring(0, 15), 16);
  }

  /**
   * Track embedding generation usage
   */
  private async trackEmbeddingUsage(
    organizationId: string,
    tokensUsed: number,
    model: string,
  ): Promise<void> {
    try {
      const usageMetric = this.usageMetricRepository.create({
        organizationId,
        type: UsageMetricType.VECTOR_SEARCHES,
        value: tokensUsed,
        date: new Date().toISOString().split("T")[0],
        metadata: {
          operation: "embedding_generation",
          model,
        },
      });

      await this.usageMetricRepository.save(usageMetric);
    } catch (error) {
      this.logger.warn(`Failed to track embedding usage: ${error.message}`);
    }
  }

  /**
   * Track vector search usage
   */
  private async trackSearchUsage(
    organizationId: string,
    tokensUsed: number,
  ): Promise<void> {
    try {
      const usageMetric = this.usageMetricRepository.create({
        organizationId,
        type: UsageMetricType.VECTOR_SEARCHES,
        value: 1, // One search
        date: new Date().toISOString().split("T")[0],
        metadata: {
          operation: "vector_search",
          tokensUsed,
        },
      });

      await this.usageMetricRepository.save(usageMetric);
    } catch (error) {
      this.logger.warn(`Failed to track search usage: ${error.message}`);
    }
  }
}
