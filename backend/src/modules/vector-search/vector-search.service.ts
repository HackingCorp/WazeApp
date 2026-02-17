import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { ConfigService } from "@nestjs/config";
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
  private readonly openaiApiKey: string;
  private readonly ollamaBaseUrl: string;
  private embeddingProvider: 'openai' | 'ollama' | 'none' = 'none';

  constructor(
    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,

    private readonly configService: ConfigService,
  ) {
    this.openaiApiKey = this.configService.get('OPENAI_API_KEY') || '';
    this.ollamaBaseUrl = this.configService.get('OLLAMA_BASE_URL') || 'http://localhost:11434';
  }

  async onModuleInit() {
    await this.initializeQdrant();
    await this.detectEmbeddingProvider();
  }

  private async detectEmbeddingProvider(): Promise<void> {
    // Prefer Ollama embeddings (free, open-source, local)
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        this.embeddingProvider = 'ollama';
        this.logger.log('Using Ollama for embeddings (nomic-embed-text) - free/local');
        return;
      }
    } catch {
      // Ollama not available
    }

    // Fallback to OpenAI embeddings (paid)
    if (this.openaiApiKey) {
      this.embeddingProvider = 'openai';
      this.logger.log('Using OpenAI text-embedding-3-small for embeddings (Ollama not available)');
      return;
    }

    this.embeddingProvider = 'none';
    this.logger.warn('No embedding provider available. Set up Ollama with nomic-embed-text or set OPENAI_API_KEY.');
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
          score_threshold: request.threshold || 0.6, // Increased from 0.7 to 0.6
          filter,
        },
      );

      // Convert results to our format
      const results = await this.convertSearchResults(
        searchResults,
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

  async keywordSearch(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    let queryBuilder = this.chunkRepository
      .createQueryBuilder("chunk")
      .leftJoinAndSelect("chunk.document", "document")
      .leftJoinAndSelect("document.knowledgeBase", "knowledgeBase")
      .where("knowledgeBase.organizationId = :organizationId", {
        organizationId: request.organizationId,
      })
      .andWhere(
        "to_tsvector('simple', chunk.content) @@ plainto_tsquery('simple', :query)",
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

    const { entities, raw } = await queryBuilder
      .addSelect(
        "ts_rank(to_tsvector('simple', chunk.content), plainto_tsquery('simple', :query))",
        "score",
      )
      .orderBy("score", "DESC")
      .limit(request.limit || 10)
      .getRawAndEntities();

    return entities.map((chunk, index) => ({
      chunk: request.includeContent
        ? chunk
        : ({ ...chunk, content: "" } as DocumentChunk),
      score: parseFloat(raw[index]?.score) || 0,
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

  async hybridSearch(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    if (!this.isConnected) {
      this.logger.warn("Qdrant not connected, using keyword search only");
      return this.keywordSearch(request);
    }

    try {
      const limit = request.limit || 10;

      // Run both searches in parallel
      const [vectorResults, keywordResults] = await Promise.all([
        this.search({ ...request, limit: limit * 2 }), // Get more results for better fusion
        this.keywordSearch({ ...request, limit: limit * 2 }),
      ]);

      this.logger.log(`Hybrid search: ${vectorResults.length} vector, ${keywordResults.length} keyword results`);

      // Use Reciprocal Rank Fusion (RRF) to combine results
      const k = 60; // RRF constant
      const scoreMap = new Map<string, { result: VectorSearchResult; score: number }>();

      // Add vector results with RRF scoring
      vectorResults.forEach((result, index) => {
        const rrrScore = 1 / (k + index + 1);
        scoreMap.set(result.chunk.id, {
          result,
          score: rrrScore,
        });
      });

      // Add keyword results with RRF scoring
      keywordResults.forEach((result, index) => {
        const rrrScore = 1 / (k + index + 1);
        const existing = scoreMap.get(result.chunk.id);

        if (existing) {
          // Combine scores if chunk appears in both results
          existing.score += rrrScore;
        } else {
          scoreMap.set(result.chunk.id, {
            result,
            score: rrrScore,
          });
        }
      });

      // Convert to array and apply re-ranking
      let combinedResults = Array.from(scoreMap.values()).map(item => {
        const result = item.result;
        let score = item.score;

        // Re-ranking boosts
        const query = request.query.toLowerCase();
        const title = result.document.title.toLowerCase();
        const content = result.chunk.content.toLowerCase();

        // Boost for exact title match
        if (title.includes(query)) {
          score += 0.2;
          this.logger.debug(`Title match boost for chunk ${result.chunk.id}`);
        }

        // Boost for exact phrase match in content
        if (content.includes(query)) {
          score += 0.15;
          this.logger.debug(`Exact phrase match boost for chunk ${result.chunk.id}`);
        }

        // Penalize very short chunks
        if (result.chunk.characterCount < 50) {
          score -= 0.1;
          this.logger.debug(`Short chunk penalty for chunk ${result.chunk.id}`);
        }

        return {
          ...result,
          score,
        };
      });

      // Sort by combined score and apply threshold
      const threshold = request.threshold || 0.6;
      combinedResults = combinedResults
        .filter(r => r.score >= threshold / 10) // Adjust threshold for RRF scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      this.logger.log(`Hybrid search: returning ${combinedResults.length} results after fusion and re-ranking`);

      // Track usage
      await this.trackVectorSearchUsage(
        request.organizationId,
        request.query,
        combinedResults.length,
      );

      return combinedResults;
    } catch (error) {
      this.logger.error(`Hybrid search failed: ${error.message}`);
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
    const qdrantUrl = process.env.QDRANT_URL;

    // Skip Qdrant initialization if not configured
    if (!qdrantUrl) {
      this.logger.warn('QDRANT_URL not configured. Vector search will use PostgreSQL full-text search fallback. Set QDRANT_URL environment variable to enable vector search.');
      this.isConnected = false;
      return;
    }

    try {
      // Initialize Qdrant client
      this.qdrantClient = new QdrantClient({
        url: qdrantUrl,
        apiKey: process.env.QDRANT_API_KEY,
        timeout: 5000, // 5 second timeout
        checkCompatibility: false, // Disable version compatibility check to avoid warnings
      });

      // Test connection
      await this.qdrantClient.getCollections();
      this.isConnected = true;

      this.logger.log(`✅ Successfully connected to Qdrant at ${qdrantUrl}`);
    } catch (error) {
      this.logger.warn(`Qdrant not available (${error.message}). Using PostgreSQL full-text search fallback.`);
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
    if (qdrantResults.length === 0) return [];

    // Batch fetch all chunks in a single query (avoids N+1)
    const chunkIds = qdrantResults.map((r) => r.payload.chunkId);
    const chunks = await this.chunkRepository.find({
      where: { id: In(chunkIds) },
      relations: ["document", "document.knowledgeBase"],
    });

    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const results: VectorSearchResult[] = [];

    for (const result of qdrantResults) {
      const chunk = chunkMap.get(result.payload.chunkId);
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
        "to_tsvector('simple', chunk.content) @@ plainto_tsquery('simple', :query)",
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

    const { entities, raw } = await queryBuilder
      .addSelect(
        "ts_rank(to_tsvector('simple', chunk.content), plainto_tsquery('simple', :query))",
        "score",
      )
      .orderBy("score", "DESC")
      .limit(request.limit || 10)
      .getRawAndEntities();

    return entities.map((chunk, index) => ({
      chunk: request.includeContent
        ? chunk
        : ({ ...chunk, content: "" } as DocumentChunk),
      score: parseFloat(raw[index]?.score) || 0,
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
    if (this.embeddingProvider === 'openai') {
      return this.generateOpenAIEmbedding(request.text);
    }

    if (this.embeddingProvider === 'ollama') {
      return this.generateOllamaEmbedding(request.text);
    }

    throw new Error('No embedding provider configured. Set OPENAI_API_KEY or ensure Ollama is running.');
  }

  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Truncate to avoid token limits
        dimensions: 384, // Match existing Qdrant collection size
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  private async generateOllamaEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text.substring(0, 8000),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.embedding;

    // nomic-embed-text produces 768 dims, truncate to 384 if needed
    if (embedding.length > 384) {
      return embedding.slice(0, 384);
    }
    return embedding;
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
