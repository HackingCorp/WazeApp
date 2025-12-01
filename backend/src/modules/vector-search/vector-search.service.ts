import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QdrantClient } from "@qdrant/js-client-rest";
import {
  DocumentChunk,
  KnowledgeBase,
  Organization,
  UsageMetric,
} from "../../common/entities";
import { UsageMetricType } from "../../common/enums";

export interface VectorSearchRequest {
  query: string;
  organizationId: string;
  knowledgeBaseIds?: string[];
  limit?: number;
  threshold?: number;
  includeContent?: boolean;
}

export interface VectorSearchResult {
  chunk: DocumentChunk;
  score: number;
  document: {
    id: string;
    title: string;
    filename: string;
    type: string;
  };
  knowledgeBase: {
    id: string;
    name: string;
  };
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

@Injectable()
export class VectorSearchService implements OnModuleInit {
  private readonly logger = new Logger(VectorSearchService.name);
  private qdrantClient: QdrantClient;
  private isConnected = false;

  constructor(
    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,
  ) {}

  async onModuleInit() {
    await this.initializeQdrant();
  }

  async search(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    if (!this.isConnected) {
      this.logger.warn("Qdrant not connected, falling back to text search");
      return this.fallbackTextSearch(request);
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding({
        text: request.query,
        model: "sentence-transformers/all-MiniLM-L6-v2",
      });

      // Build search filter
      const filter = this.buildSearchFilter(request);

      // Search in Qdrant
      const searchResults = await this.qdrantClient.search(
        this.getCollectionName(request.organizationId),
        {
          vector: queryEmbedding,
          limit: request.limit || 10,
          score_threshold: request.threshold || 0.7,
          filter,
        },
      );

      // Convert results to our format
      const results = await this.convertSearchResults(
        searchResults as any[],
        request,
      );

      // Track usage
      await this.trackVectorSearchUsage(
        request.organizationId,
        request.query,
        results.length,
      );

      return results;
    } catch (error) {
      this.logger.error(`Vector search failed: ${error.message}`);

      // Fall back to text search
      return this.fallbackTextSearch(request);
    }
  }

  async indexChunk(chunk: DocumentChunk): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn("Qdrant not connected, skipping indexing");
      return false;
    }

    try {
      // Get organization ID from knowledge base
      const knowledgeBase = await this.knowledgeBaseRepository.findOne({
        where: { id: chunk.document?.knowledgeBaseId },
      });

      if (!knowledgeBase) {
        this.logger.error(`Knowledge base not found for chunk ${chunk.id}`);
        return false;
      }

      const collectionName = this.getCollectionName(
        knowledgeBase.organizationId,
      );

      // Ensure collection exists
      await this.ensureCollection(collectionName);

      // Generate embedding for the chunk
      const embedding = await this.generateEmbedding({
        text: chunk.content,
        model: "sentence-transformers/all-MiniLM-L6-v2",
      });

      // Index the chunk
      await this.qdrantClient.upsert(collectionName, {
        points: [
          {
            id: chunk.id,
            vector: embedding,
            payload: {
              chunkId: chunk.id,
              documentId: chunk.documentId,
              knowledgeBaseId: chunk.document?.knowledgeBaseId,
              content: chunk.content,
              chunkOrder: chunk.chunkOrder,
              characterCount: chunk.characterCount,
              tokenCount: chunk.tokenCount,
              metadata: chunk.metadata,
            },
          },
        ],
      });

      // Update chunk with vector ID
      chunk.metadata = {
        ...chunk.metadata,
        vectorId: chunk.id,
        embeddings: embedding.slice(0, 10), // Store first 10 dimensions for debugging
      };

      await this.chunkRepository.save(chunk);

      this.logger.debug(
        `Indexed chunk ${chunk.id} in collection ${collectionName}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to index chunk ${chunk.id}: ${error.message}`);
      return false;
    }
  }

  async deleteChunk(chunkId: string, organizationId: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const collectionName = this.getCollectionName(organizationId);

      await this.qdrantClient.delete(collectionName, {
        points: [chunkId],
      });

      this.logger.debug(
        `Deleted chunk ${chunkId} from collection ${collectionName}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete chunk ${chunkId}: ${error.message}`);
      return false;
    }
  }

  async rebuildKnowledgeBase(knowledgeBaseId: string): Promise<boolean> {
    try {
      const knowledgeBase = await this.knowledgeBaseRepository.findOne({
        where: { id: knowledgeBaseId },
        relations: ["documents", "documents.chunks"],
      });

      if (!knowledgeBase) {
        throw new Error("Knowledge base not found");
      }

      this.logger.log(
        `Rebuilding vector index for knowledge base: ${knowledgeBase.name}`,
      );

      let indexedCount = 0;
      const totalChunks =
        knowledgeBase.documents?.reduce(
          (total, doc) => total + (doc.chunks?.length || 0),
          0,
        ) || 0;

      for (const document of knowledgeBase.documents || []) {
        for (const chunk of document.chunks || []) {
          const success = await this.indexChunk(chunk);
          if (success) {
            indexedCount++;
          }

          // Log progress every 50 chunks
          if (indexedCount % 50 === 0) {
            this.logger.log(`Indexed ${indexedCount}/${totalChunks} chunks`);
          }
        }
      }

      this.logger.log(
        `Completed rebuilding index: ${indexedCount}/${totalChunks} chunks indexed`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to rebuild knowledge base index: ${error.message}`,
      );
      return false;
    }
  }

  async getCollectionStats(organizationId: string): Promise<any> {
    if (!this.isConnected) {
      return { error: "Qdrant not connected" };
    }

    try {
      const collectionName = this.getCollectionName(organizationId);

      const info = await this.qdrantClient.getCollection(collectionName);

      return {
        name: collectionName,
        vectorsCount: info.vectors_count || 0,
        status: info.status,
        config: info.config,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection stats: ${error.message}`);
      return { error: error.message };
    }
  }

  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      if (!this.isConnected) {
        return { status: "unhealthy", details: "Not connected to Qdrant" };
      }

      // Try to get collections info
      const collections = await this.qdrantClient.getCollections();

      return {
        status: "healthy",
        details: {
          connected: this.isConnected,
          collections: collections.collections?.length || 0,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        details: { error: error.message },
      };
    }
  }

  private async initializeQdrant(): Promise<void> {
    try {
      // Initialize Qdrant client
      this.qdrantClient = new QdrantClient({
        url: process.env.QDRANT_URL || "http://localhost:6333",
        apiKey: process.env.QDRANT_API_KEY,
      });

      // Test connection
      await this.qdrantClient.getCollections();
      this.isConnected = true;

      this.logger.log("Successfully connected to Qdrant");
    } catch (error) {
      this.logger.error(`Failed to connect to Qdrant: ${error.message}`);
      this.isConnected = false;
    }
  }

  private async ensureCollection(collectionName: string): Promise<void> {
    try {
      // Check if collection exists
      await this.qdrantClient.getCollection(collectionName);
    } catch (error) {
      // Collection doesn't exist, create it
      this.logger.log(`Creating Qdrant collection: ${collectionName}`);

      await this.qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 384, // sentence-transformers/all-MiniLM-L6-v2 dimension
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
    }
  }

  private getCollectionName(organizationId: string): string {
    return `org_${organizationId.replace(/-/g, "_")}`;
  }

  private buildSearchFilter(request: VectorSearchRequest): any {
    const filter: any = {};

    // Filter by knowledge base IDs if specified
    if (request.knowledgeBaseIds && request.knowledgeBaseIds.length > 0) {
      filter.must = [
        {
          key: "knowledgeBaseId",
          match: {
            any: request.knowledgeBaseIds,
          },
        },
      ];
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private async convertSearchResults(
    qdrantResults: any[],
    request: VectorSearchRequest,
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const result of qdrantResults) {
      try {
        // Get full chunk data from database
        const chunk = await this.chunkRepository.findOne({
          where: { id: result.payload.chunkId },
          relations: ["document", "document.knowledgeBase"],
        });

        if (chunk && chunk.document) {
          results.push({
            chunk: request.includeContent
              ? chunk
              : ({ ...chunk, content: "" } as DocumentChunk),
            score: result.score,
            document: {
              id: chunk.document.id,
              title: chunk.document.title,
              filename: chunk.document.filename,
              type: chunk.document.type,
            },
            knowledgeBase: {
              id: chunk.document.knowledgeBase.id,
              name: chunk.document.knowledgeBase.name,
            },
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to convert search result: ${error.message}`);
      }
    }

    return results;
  }

  private async fallbackTextSearch(
    request: VectorSearchRequest,
  ): Promise<VectorSearchResult[]> {
    // Fallback to PostgreSQL full-text search
    let queryBuilder = this.chunkRepository
      .createQueryBuilder("chunk")
      .leftJoinAndSelect("chunk.document", "document")
      .leftJoinAndSelect("document.knowledgeBase", "knowledgeBase")
      .where("knowledgeBase.organizationId = :organizationId", {
        organizationId: request.organizationId,
      })
      .andWhere(
        "to_tsvector('english', chunk.content) @@ plainto_tsquery('english', :query)",
        {
          query: request.query,
        },
      );

    if (request.knowledgeBaseIds && request.knowledgeBaseIds.length > 0) {
      queryBuilder = queryBuilder.andWhere(
        "document.knowledgeBaseId IN (:...kbIds)",
        {
          kbIds: request.knowledgeBaseIds,
        },
      );
    }

    const chunks = await queryBuilder
      .addSelect(
        "ts_rank(to_tsvector('english', chunk.content), plainto_tsquery('english', :query))",
        "score",
      )
      .orderBy("score", "DESC")
      .limit(request.limit || 10)
      .getMany();

    return chunks.map((chunk) => ({
      chunk: request.includeContent
        ? chunk
        : ({ ...chunk, content: "" } as DocumentChunk),
      score: 0.8, // Default score for text search
      document: {
        id: chunk.document.id,
        title: chunk.document.title,
        filename: chunk.document.filename,
        type: chunk.document.type,
      },
      knowledgeBase: {
        id: chunk.document.knowledgeBase.id,
        name: chunk.document.knowledgeBase.name,
      },
    }));
  }

  private async generateEmbedding(
    request: EmbeddingRequest,
  ): Promise<number[]> {
    // This would integrate with a sentence transformer service
    // For now, return a mock embedding of the right size
    const mockEmbedding = new Array(384).fill(0).map(() => Math.random() - 0.5);

    // In production, this would call something like:
    // const response = await fetch('http://embedding-service:8000/embed', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(request),
    // });
    // return response.json().embedding;

    return mockEmbedding;
  }

  private async trackVectorSearchUsage(
    organizationId: string,
    query: string,
    resultCount: number,
  ): Promise<void> {
    const metric = this.usageMetricRepository.create({
      organizationId,
      type: UsageMetricType.VECTOR_SEARCHES,
      value: 1,
      date: new Date().toISOString().split("T")[0], // Format as YYYY-MM-DD
      metadata: {},
    });

    await this.usageMetricRepository.save(metric);
  }
}
