import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, In, IsNull } from "typeorm";
import {
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
  Organization,
  UsageMetric,
  AiAgent,
} from "../../common/entities";
import {
  KnowledgeBaseStatus,
  DocumentStatus,
  UsageMetricType,
  SubscriptionPlan,
  AuditAction,
} from "../../common/enums";
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeBaseQueryDto,
  KnowledgeBaseStatsDto,
} from "./dto/knowledge-base.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,

    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,

    @InjectRepository(AiAgent)
    private readonly agentRepository: Repository<AiAgent>,

    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    createDto: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    // Check knowledge base limits by subscription plan
    await this.checkKnowledgeBaseLimit(organizationId);

    const knowledgeBase = this.knowledgeBaseRepository.create({
      ...createDto,
      organizationId,
      createdBy: userId,
      settings: {
        chunking: {
          strategy: "recursive",
          chunkSize: 1000,
          overlap: 100,
        },
        embedding: {
          model: "sentence-transformers/all-MiniLM-L6-v2",
          dimensions: 384,
        },
        search: {
          similarityThreshold: 0.7,
          maxResults: 10,
        },
        ...createDto.settings,
      },
    });

    const saved = await this.knowledgeBaseRepository.save(knowledgeBase);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "knowledge_base",
      resourceId: saved.id,
      description: `Created knowledge base: ${saved.name}`,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async createForUser(
    organizationId: string | null,
    userId: string,
    createDto: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    // Check knowledge base limits by subscription plan
    if (organizationId) {
      await this.checkKnowledgeBaseLimit(organizationId);
    } else {
      await this.checkUserKnowledgeBaseLimit(userId);
    }

    // Remove agentId from createDto to avoid validation error
    const { agentId, ...kbData } = createDto;

    const knowledgeBase = this.knowledgeBaseRepository.create({
      ...kbData,
      organizationId: organizationId || undefined,
      createdBy: userId,
      settings: {
        chunking: {
          strategy: "recursive",
          chunkSize: 1000,
          overlap: 100,
        },
        embedding: {
          model: "sentence-transformers/all-MiniLM-L6-v2",
          dimensions: 384,
        },
        search: {
          similarityThreshold: 0.7,
          maxResults: 10,
        },
        ...kbData.settings,
      },
    });

    const saved = await this.knowledgeBaseRepository.save(knowledgeBase);

    // If agentId is provided, associate the knowledge base with the agent
    if (agentId) {
      const agent = await this.agentRepository.findOne({
        where: { id: agentId },
        relations: ["knowledgeBases"],
      });

      if (agent) {
        if (!agent.knowledgeBases) {
          agent.knowledgeBases = [];
        }
        agent.knowledgeBases.push(saved);
        await this.agentRepository.save(agent);
      }
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "knowledge_base",
      resourceId: saved.id,
      description: `Created knowledge base: ${saved.name}`,
      metadata: { name: saved.name, agentId },
    });

    return saved;
  }

  async findAll(
    organizationId: string | null,
    userId: string,
    query: KnowledgeBaseQueryDto,
  ): Promise<{ data: KnowledgeBase[]; total: number }> {
    const queryBuilder = this.knowledgeBaseRepository
      .createQueryBuilder("kb")
      .leftJoinAndSelect("kb.creator", "creator");

    // Filter by organization if available, otherwise by creator
    if (organizationId) {
      // Look for knowledge bases in the organization OR user-owned knowledge bases without organization
      queryBuilder.where(
        "(kb.organizationId = :organizationId OR (kb.createdBy = :userId AND kb.organizationId IS NULL))",
        { organizationId, userId }
      );
    } else {
      queryBuilder.where("kb.createdBy = :userId AND kb.organizationId IS NULL", { userId });
    }

    if (query.search) {
      queryBuilder.andWhere(
        "(kb.name ILIKE :search OR kb.description ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere("kb.status = :status", { status: query.status });
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere("kb.tags && :tags", { tags: query.tags });
    }

    queryBuilder.orderBy("kb.updatedAt", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return { data, total };
  }

  async findOne(organizationId: string | null, id: string): Promise<KnowledgeBase> {
    // First try with the provided organizationId
    let knowledgeBase = await this.knowledgeBaseRepository.findOne({
      where: organizationId 
        ? { id, organizationId }
        : { id, organizationId: IsNull() },
      relations: ["creator", "documents"],
    });

    // If not found and organizationId was provided, try with organizationId = null
    // This handles cases where knowledge bases were created without organization
    if (!knowledgeBase && organizationId) {
      knowledgeBase = await this.knowledgeBaseRepository.findOne({
        where: { id, organizationId: IsNull() },
        relations: ["creator", "documents"],
      });
    }

    if (!knowledgeBase) {
      throw new NotFoundException("Knowledge base not found");
    }

    return knowledgeBase;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    updateDto: UpdateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    const knowledgeBase = await this.findOne(organizationId, id);

    Object.assign(knowledgeBase, updateDto);
    knowledgeBase.version += 1;

    const updated = await this.knowledgeBaseRepository.save(knowledgeBase);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "knowledge_base",
      resourceId: id,
      description: `Updated knowledge base: ${updated.name}`,
      metadata: { changes: updateDto },
    });

    return updated;
  }

  async delete(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    const knowledgeBase = await this.findOne(organizationId, id);

    await this.knowledgeBaseRepository.remove(knowledgeBase);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "knowledge_base",
      resourceId: id,
      description: `Deleted knowledge base: ${knowledgeBase.name}`,
      metadata: { name: knowledgeBase.name },
    });
  }

  async getStats(organizationId: string): Promise<KnowledgeBaseStatsDto> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["subscriptions"],
    });

    const kbStats = await this.knowledgeBaseRepository
      .createQueryBuilder("kb")
      .select([
        "COUNT(*) as total",
        "SUM(CASE WHEN kb.status = :active THEN 1 ELSE 0 END) as active",
        "SUM(CASE WHEN kb.status = :processing THEN 1 ELSE 0 END) as processing",
        "SUM(kb.documentCount) as totalDocuments",
        "SUM(kb.totalCharacters) as totalCharacters",
      ])
      .where("(kb.organizationId = :organizationId OR kb.organizationId IS NULL)", { organizationId })
      .setParameter("active", KnowledgeBaseStatus.ACTIVE)
      .setParameter("processing", KnowledgeBaseStatus.PROCESSING)
      .getRawOne();

    // Get character limits based on subscription
    const subscription = organization?.subscriptions?.[0];
    const plan = subscription?.plan || SubscriptionPlan.FREE;

    const characterLimits = {
      [SubscriptionPlan.FREE]: 100000, // 100K characters
      [SubscriptionPlan.STANDARD]: 1000000, // 1M characters
      [SubscriptionPlan.PRO]: 10000000, // 10M characters
      [SubscriptionPlan.ENTERPRISE]: 100000000, // 100M characters
    };

    const limit = characterLimits[plan];
    const used = parseInt(kbStats.totalCharacters) || 0;

    return {
      total: parseInt(kbStats.total) || 0,
      active: parseInt(kbStats.active) || 0,
      processing: parseInt(kbStats.processing) || 0,
      totalDocuments: parseInt(kbStats.totalDocuments) || 0,
      totalCharacters: used,
      characterUsage: {
        used,
        limit,
        percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
      },
    };
  }

  async updateStats(knowledgeBaseId: string): Promise<void> {
    // Count all documents (not just processed) for accurate document count
    // Use raw SQL to avoid any TypeORM column name issues
    const allDocsStats = await this.documentRepository.query(`
      SELECT COUNT(*) as "documentCount"
      FROM knowledge_documents
      WHERE "knowledgeBaseId" = $1
      AND status != 'archived'
    `, [knowledgeBaseId]);

    // For character count, only include processed documents (they have accurate character counts)
    const charStats = await this.documentRepository.query(`
      SELECT COALESCE(SUM("characterCount"), 0) as "totalCharacters"
      FROM knowledge_documents
      WHERE "knowledgeBaseId" = $1
      AND status = 'processed'
    `, [knowledgeBaseId]);

    const documentCount = parseInt(allDocsStats?.[0]?.documentCount) || 0;
    const totalCharacters = parseInt(charStats?.[0]?.totalCharacters) || 0;

    console.log(`📊 UPDATE STATS for KB ${knowledgeBaseId}:`);
    console.log(`   - Raw result:`, allDocsStats, charStats);
    console.log(`   - Parsed documentCount: ${documentCount}`);
    console.log(`   - Parsed totalCharacters: ${totalCharacters}`);

    await this.knowledgeBaseRepository.update(knowledgeBaseId, {
      documentCount,
      totalCharacters,
    });
  }

  /**
   * Refresh stats for all knowledge bases
   */
  async refreshAllStats(): Promise<{ updated: number }> {
    const knowledgeBases = await this.knowledgeBaseRepository.find({
      select: ['id'],
    });

    for (const kb of knowledgeBases) {
      await this.updateStats(kb.id);
    }

    return { updated: knowledgeBases.length };
  }

  /**
   * Debug method to list all documents in the database
   */
  async debugListAllDocuments(): Promise<any[]> {
    const docs = await this.documentRepository.find({
      select: ['id', 'title', 'status', 'characterCount', 'knowledgeBaseId', 'createdAt'],
      order: { createdAt: 'DESC' },
      take: 100, // Limit to 100 documents
    });

    return docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      characterCount: doc.characterCount,
      knowledgeBaseId: doc.knowledgeBaseId,
      createdAt: doc.createdAt,
    }));
  }

  /**
   * Debug raw document count for a KB
   */
  async debugRawDocCount(knowledgeBaseId: string): Promise<any> {
    // Raw SQL query
    const rawResult = await this.documentRepository.query(`
      SELECT
        COUNT(*) as total_count,
        COUNT(CASE WHEN status != 'archived' THEN 1 END) as non_archived_count,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_count,
        SUM(CASE WHEN status = 'processed' THEN "characterCount" ELSE 0 END) as total_chars
      FROM knowledge_documents
      WHERE "knowledgeBaseId" = $1
    `, [knowledgeBaseId]);

    // Also get all documents for this KB
    const allDocs = await this.documentRepository.query(`
      SELECT id, title, status, "characterCount", "knowledgeBaseId"
      FROM knowledge_documents
      WHERE "knowledgeBaseId" = $1
    `, [knowledgeBaseId]);

    // And list all KB IDs in the documents table
    const allKbIds = await this.documentRepository.query(`
      SELECT DISTINCT "knowledgeBaseId" FROM knowledge_documents
    `);

    return {
      knowledgeBaseId,
      rawResult: rawResult[0],
      documentsForThisKb: allDocs,
      allKbIdsInDocuments: allKbIds,
    };
  }

  /**
   * Add slug column to knowledge_documents if missing
   */
  async addSlugColumnIfMissing(): Promise<{ message: string }> {
    const queryRunner = this.knowledgeBaseRepository.manager.connection.createQueryRunner();

    try {
      await queryRunner.connect();

      // Check if column exists
      const hasColumn = await queryRunner.hasColumn('knowledge_documents', 'slug');

      if (!hasColumn) {
        // Add the column
        await queryRunner.query(`
          ALTER TABLE "knowledge_documents"
          ADD COLUMN "slug" varchar(100)
        `);

        // Add index
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_DOC_SLUG" ON "knowledge_documents" ("slug")
        `);

        return { message: 'Slug column added successfully' };
      }

      return { message: 'Slug column already exists' };
    } finally {
      await queryRunner.release();
    }
  }

  private async checkKnowledgeBaseLimit(organizationId: string): Promise<void> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["subscriptions"],
    });

    const subscription = organization?.subscriptions?.[0];
    const plan = subscription?.plan || SubscriptionPlan.FREE;

    const kbLimits = {
      [SubscriptionPlan.FREE]: 1,
      [SubscriptionPlan.STANDARD]: 3,
      [SubscriptionPlan.PRO]: 10,
      [SubscriptionPlan.ENTERPRISE]: 50,
    };

    const currentCount = await this.knowledgeBaseRepository.count({
      where: { organizationId },
    });

    if (currentCount >= kbLimits[plan]) {
      throw new ForbiddenException(
        `Knowledge base limit (${kbLimits[plan]}) reached for ${plan} plan`,
      );
    }
  }

  private async checkUserKnowledgeBaseLimit(userId: string): Promise<void> {
    // For individual users, they can create multiple knowledge bases based on their subscription
    // For now, allow creation since we're focusing on the 1 user = 1 agent = 1 KB architecture
    // This could be enhanced to check user subscription limits
    const currentCount = await this.knowledgeBaseRepository.count({
      where: { createdBy: userId, organizationId: IsNull() },
    });

    // For the 1:1:1 architecture, limit to reasonable number per user
    const USER_KB_LIMIT = 10; // Can be made configurable based on subscription

    if (currentCount >= USER_KB_LIMIT) {
      throw new ForbiddenException(
        `Knowledge base limit (${USER_KB_LIMIT}) reached for user`,
      );
    }
  }

  async checkCharacterLimit(
    organizationId: string,
    additionalChars: number,
  ): Promise<void> {
    const stats = await this.getStats(organizationId);

    if (
      stats.characterUsage.used + additionalChars >
      stats.characterUsage.limit
    ) {
      throw new ForbiddenException(
        `Character limit (${stats.characterUsage.limit.toLocaleString()}) would be exceeded`,
      );
    }
  }

  /**
   * Test KB search like AI does - for debugging
   */
  async testSearchForAI(knowledgeBaseId: string, query: string): Promise<any> {
    console.log(`🧪 TEST SEARCH: KB=${knowledgeBaseId}, Query="${query}"`);

    // Get knowledge base
    const kb = await this.knowledgeBaseRepository.findOne({
      where: { id: knowledgeBaseId },
    });

    if (!kb) {
      return { error: `Knowledge base ${knowledgeBaseId} not found` };
    }

    console.log(`🧪 KB Found: ${kb.name}`);

    // Get documents like AI does
    const documents = await this.documentRepository
      .createQueryBuilder("doc")
      .where("doc.knowledgeBaseId = :kbId", { kbId: knowledgeBaseId })
      .andWhere("doc.status IN (:...statuses)", { statuses: ["processed", "uploaded"] })
      .andWhere("doc.content IS NOT NULL")
      .andWhere("LENGTH(doc.content) > 10")
      .orderBy("doc.createdAt", "DESC")
      .getMany();

    console.log(`🧪 Documents found: ${documents.length}`);

    // Log each document
    const docDetails = documents.map((doc, idx) => {
      console.log(`🧪 Doc ${idx + 1}: "${doc.title}" - ${doc.content?.length || 0} chars - Status: ${doc.status}`);
      if (doc.content) {
        console.log(`🧪 Preview: ${doc.content.substring(0, 300).replace(/\n/g, ' ')}`);
      }
      return {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        contentLength: doc.content?.length || 0,
        preview: doc.content?.substring(0, 2000) || '[No content]',
        fullContent: doc.content || '[No content]',
      };
    });

    // Search with query terms
    const searchTerms = query.toLowerCase().split(/[\s,.'?!]+/).filter(t => t.length > 2);
    console.log(`🧪 Search terms: ${searchTerms.join(', ')}`);

    // Score documents
    const scoredDocs = documents.map(doc => {
      let score = 0;
      const content = (doc.content || "").toLowerCase();
      const title = (doc.title || "").toLowerCase();

      for (const term of searchTerms) {
        if (title.includes(term)) score += 10;
        const contentMatches = (content.match(new RegExp(term, 'gi')) || []).length;
        score += contentMatches * 2;
      }

      return { title: doc.title, score, hasContent: !!doc.content };
    }).filter(d => d.score > 0).sort((a, b) => b.score - a.score);

    console.log(`🧪 Scored documents: ${scoredDocs.length}`);

    return {
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        status: kb.status,
        totalCharacters: kb.totalCharacters,
        documentCount: kb.documentCount,
      },
      query,
      searchTerms,
      documentsFound: documents.length,
      documentsWithContent: documents.filter(d => d.content && d.content.length > 10).length,
      scoredResults: scoredDocs.slice(0, 5),
      allDocuments: docDetails,
    };
  }
}
