import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, IsNull } from "typeorm";
import {
  AiAgent,
  KnowledgeBase,
  Organization,
  AgentConversation,
  AgentMessage,
  User,
  Subscription,
  KnowledgeDocument,
  EcommerceStore,
} from "../../common/entities";
import {
  AgentStatus,
  AgentLanguage,
  SubscriptionPlan,
  ConversationStatus,
  AuditAction,
} from "../../common/enums";
import {
  CreateAiAgentDto,
  UpdateAiAgentDto,
  AgentQueryDto,
  AgentStatsDto,
  GenerateFaqDto,
  TestAgentDto,
} from "./dto/ai-agent.dto";
import { AuditService } from "../audit/audit.service";
import { LLMRouterService } from "../llm-providers/llm-router.service";
import { VectorSearchService } from "../vector-search/vector-search.service";
import { ProductSearchService } from "../ecommerce/services/product-search.service";
import { OrderTagParserService } from "../orders/services/order-tag-parser.service";

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    @InjectRepository(AiAgent)
    private readonly agentRepository: Repository<AiAgent>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(KnowledgeDocument)
    private readonly knowledgeDocumentRepository: Repository<KnowledgeDocument>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,

    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,

    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,

    @InjectRepository(EcommerceStore)
    private readonly ecommerceStoreRepository: Repository<EcommerceStore>,

    private readonly auditService: AuditService,

    @Inject(forwardRef(() => LLMRouterService))
    private readonly llmRouter: LLMRouterService,

    @Inject(forwardRef(() => VectorSearchService))
    private readonly vectorSearch: VectorSearchService,

    @Inject(forwardRef(() => ProductSearchService))
    private readonly productSearchService: ProductSearchService,

    private readonly orderTagParserService: OrderTagParserService,
  ) {}

  async create(
    organizationId: string | null,
    userId: string,
    createDto: CreateAiAgentDto,
  ): Promise<AiAgent> {
    // Check agent limits for all users (by organization or by user)
    await this.checkAgentLimit(organizationId, userId);

    // Validate system prompt if provided
    if (createDto.systemPrompt) {
      this.validateSystemPrompt(createDto.systemPrompt);
    }

    // Validate knowledge bases for all users
    if (createDto.knowledgeBaseIds?.length) {
      await this.validateKnowledgeBases(
        organizationId,
        userId,
        createDto.knowledgeBaseIds,
      );
    }

    const agent = this.agentRepository.create({
      ...createDto,
      organizationId: organizationId || undefined,
      createdBy: userId,
      supportedLanguages: createDto.supportedLanguages || [
        createDto.primaryLanguage,
      ],
      config: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        ...createDto.config,
      },
      metrics: {
        totalConversations: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        satisfactionScore: 0,
        successfulResponses: 0,
        failedResponses: 0,
        knowledgeBaseHits: 0,
      },
      faq: [],
    });

    const saved = await this.agentRepository.save(agent);

    // Associate knowledge bases if provided
    if (createDto.knowledgeBaseIds?.length) {
      const knowledgeBases = await this.knowledgeBaseRepository.findBy({
        id: In(createDto.knowledgeBaseIds),
      });
      saved.knowledgeBases = knowledgeBases;
      await this.agentRepository.save(saved);
    }

    // Associate catalogs if provided
    if (createDto.catalogIds?.length) {
      const catalogs = await this.ecommerceStoreRepository.findBy({
        id: In(createDto.catalogIds),
      });
      saved.catalogs = catalogs;
      saved.ecommerceEnabled = true;
      await this.agentRepository.save(saved);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ai_agent",
      resourceId: saved.id,
      description: `Created AI agent: ${saved.name}`,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async findAll(
    organizationId: string | null,
    userId: string,
    query: AgentQueryDto,
  ): Promise<{ data: AiAgent[]; total: number }> {
    const queryBuilder = this.agentRepository
      .createQueryBuilder("agent")
      .leftJoinAndSelect("agent.creator", "creator")
      .leftJoinAndSelect("agent.knowledgeBases", "knowledgeBases")
      .leftJoinAndSelect("agent.catalogs", "catalogs");

    // Filter by organization if available, otherwise by creator
    if (organizationId) {
      // Look for agents in the organization OR user-owned agents without organization
      queryBuilder.where(
        "(agent.organizationId = :organizationId OR (agent.createdBy = :userId AND agent.organizationId IS NULL))",
        { organizationId, userId }
      );
    } else {
      queryBuilder.where("agent.createdBy = :userId", { userId });
    }

    if (query.search) {
      queryBuilder.andWhere(
        "(agent.name ILIKE :search OR agent.description ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      queryBuilder.andWhere("agent.status = :status", { status: query.status });
    }

    if (query.language) {
      queryBuilder.andWhere(":language = ANY(agent.supportedLanguages)", {
        language: query.language,
      });
    }

    if (query.tone) {
      queryBuilder.andWhere("agent.tone = :tone", { tone: query.tone });
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere("agent.tags && :tags", { tags: query.tags });
    }

    queryBuilder.orderBy("agent.updatedAt", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    // Enrich agents with real-time statistics
    const enrichedData = await Promise.all(
      data.map(async (agent) => {
        const stats = await this.calculateAgentStats(agent.id);
        agent.metrics = {
          ...agent.metrics,
          totalConversations: stats.totalConversations,
          totalMessages: stats.totalMessages,
          averageResponseTime: stats.averageResponseTime,
          satisfactionScore: stats.satisfactionScore,
          lastActive: stats.lastActive,
        };
        return agent;
      }),
    );

    return { data: enrichedData, total };
  }

  /**
   * Calculate real-time statistics for an agent
   */
  async calculateAgentStats(agentId: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    averageResponseTime: number;
    satisfactionScore: number;
    lastActive: Date | null;
  }> {
    // Count conversations for this agent
    const conversationCount = await this.conversationRepository.count({
      where: { agentId },
    });

    // Count messages for this agent's conversations
    const messageStats = await this.messageRepository
      .createQueryBuilder("msg")
      .leftJoin("msg.conversation", "conv")
      .select([
        "COUNT(msg.id) as totalMessages",
        "MAX(msg.createdAt) as lastActive",
      ])
      .where("conv.agentId = :agentId", { agentId })
      .getRawOne();

    // Calculate average response time from conversations with metrics
    const responseTimeStats = await this.conversationRepository
      .createQueryBuilder("conv")
      .select("AVG((conv.metrics->>'averageResponseTime')::numeric)", "avgResponseTime")
      .where("conv.agentId = :agentId", { agentId })
      .andWhere("conv.metrics->>'averageResponseTime' IS NOT NULL")
      .andWhere("(conv.metrics->>'averageResponseTime')::numeric > 0")
      .getRawOne();

    // Calculate satisfaction score from conversations
    const satisfactionStats = await this.conversationRepository
      .createQueryBuilder("conv")
      .select("AVG((conv.metrics->>'satisfactionScore')::numeric)", "avgSatisfaction")
      .where("conv.agentId = :agentId", { agentId })
      .andWhere("conv.metrics->>'satisfactionScore' IS NOT NULL")
      .getRawOne();

    return {
      totalConversations: conversationCount,
      totalMessages: parseInt(messageStats?.totalMessages) || 0,
      averageResponseTime: parseFloat(responseTimeStats?.avgResponseTime) || 0,
      satisfactionScore: parseFloat(satisfactionStats?.avgSatisfaction) || 0,
      lastActive: messageStats?.lastActive ? new Date(messageStats.lastActive) : null,
    };
  }

  async findOne(organizationId: string, id: string): Promise<AiAgent> {
    const agent = await this.agentRepository.findOne({
      where: { id, organizationId },
      relations: ["creator", "knowledgeBases", "catalogs", "conversations"],
    });

    if (!agent) {
      throw new NotFoundException("AI Agent not found");
    }

    return agent;
  }

  async findOneForUser(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<AiAgent> {
    let agent: AiAgent | null = null;

    if (organizationId) {
      // User has organization - find agent in organization OR user-owned without organization
      agent = await this.agentRepository.findOne({
        where: [
          { id, organizationId },
          { id, createdBy: userId, organizationId: IsNull() }
        ],
        relations: ["creator", "knowledgeBases", "catalogs", "conversations"],
      });
    } else {
      // User without organization - find only agents they created
      agent = await this.agentRepository.findOne({
        where: [
          { id, createdBy: userId },
        ],
        relations: ["creator", "knowledgeBases", "catalogs", "conversations"],
      });
    }

    if (!agent) {
      throw new NotFoundException("AI Agent not found");
    }

    return agent;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    updateDto: UpdateAiAgentDto,
  ): Promise<AiAgent> {
    const agent = await this.findOne(organizationId, id);

    // Validate system prompt if being updated
    if (updateDto.systemPrompt) {
      this.validateSystemPrompt(updateDto.systemPrompt);
    }

    // Track prompt version history
    if (updateDto.systemPrompt && updateDto.systemPrompt !== agent.systemPrompt) {
      if (!agent.promptHistory) agent.promptHistory = [];
      agent.promptHistory.push({
        prompt: agent.systemPrompt,
        version: agent.version,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      });
      // Keep only last 10 versions
      if (agent.promptHistory.length > 10) {
        agent.promptHistory = agent.promptHistory.slice(-10);
      }
    }

    // Validate knowledge bases if being updated
    if (updateDto.knowledgeBaseIds?.length) {
      await this.validateKnowledgeBases(
        organizationId,
        userId,
        updateDto.knowledgeBaseIds,
      );
    }

    // Deep merge config and strip deprecated properties from database
    if (updateDto.config) {
      updateDto.config = this.stripInvalidConfigKeys({ ...agent.config, ...updateDto.config });
    }

    Object.assign(agent, updateDto);
    agent.version += 1;

    const updated = await this.agentRepository.save(agent);

    // Update knowledge base associations if provided
    if (updateDto.knowledgeBaseIds !== undefined) {
      if (updateDto.knowledgeBaseIds.length > 0) {
        const knowledgeBases = await this.knowledgeBaseRepository.findBy({
          id: In(updateDto.knowledgeBaseIds),
        });
        updated.knowledgeBases = knowledgeBases;
      } else {
        updated.knowledgeBases = [];
      }
      await this.agentRepository.save(updated);
    }

    // Update catalog associations if provided
    if (updateDto.catalogIds !== undefined) {
      if (updateDto.catalogIds.length > 0) {
        const catalogs = await this.ecommerceStoreRepository.findBy({
          id: In(updateDto.catalogIds),
        });
        updated.catalogs = catalogs;
        updated.ecommerceEnabled = true;
      } else {
        updated.catalogs = [];
        updated.ecommerceEnabled = false;
      }
      await this.agentRepository.save(updated);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "ai_agent",
      resourceId: id,
      description: `Updated AI agent: ${id}`,
      metadata: { changes: updateDto },
    });

    return updated;
  }

  async updateForUser(
    organizationId: string | null,
    userId: string,
    id: string,
    updateDto: UpdateAiAgentDto,
  ): Promise<AiAgent> {
    const agent = await this.findOneForUser(organizationId, userId, id);

    // Validate system prompt if being updated
    if (updateDto.systemPrompt) {
      this.validateSystemPrompt(updateDto.systemPrompt);
    }

    // Track prompt version history
    if (updateDto.systemPrompt && updateDto.systemPrompt !== agent.systemPrompt) {
      if (!agent.promptHistory) agent.promptHistory = [];
      agent.promptHistory.push({
        prompt: agent.systemPrompt,
        version: agent.version,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
      });
      // Keep only last 10 versions
      if (agent.promptHistory.length > 10) {
        agent.promptHistory = agent.promptHistory.slice(-10);
      }
    }

    // Validate knowledge bases if being updated
    if (updateDto.knowledgeBaseIds?.length) {
      await this.validateKnowledgeBases(
        organizationId,
        userId,
        updateDto.knowledgeBaseIds,
      );
    }

    // Deep merge config and strip deprecated properties from database
    if (updateDto.config) {
      updateDto.config = this.stripInvalidConfigKeys({ ...agent.config, ...updateDto.config });
    }

    Object.assign(agent, updateDto);
    agent.version += 1;

    const updated = await this.agentRepository.save(agent);

    // Update knowledge base associations if provided
    if (updateDto.knowledgeBaseIds !== undefined) {
      if (updateDto.knowledgeBaseIds.length > 0) {
        const knowledgeBases = await this.knowledgeBaseRepository.findBy({
          id: In(updateDto.knowledgeBaseIds),
        });
        updated.knowledgeBases = knowledgeBases;
      } else {
        updated.knowledgeBases = [];
      }
      await this.agentRepository.save(updated);
    }

    // Update catalog associations if provided
    if (updateDto.catalogIds !== undefined) {
      if (updateDto.catalogIds.length > 0) {
        const catalogs = await this.ecommerceStoreRepository.findBy({
          id: In(updateDto.catalogIds),
        });
        updated.catalogs = catalogs;
        updated.ecommerceEnabled = true;
      } else {
        updated.catalogs = [];
        updated.ecommerceEnabled = false;
      }
      await this.agentRepository.save(updated);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "ai_agent",
      resourceId: id,
      description: `Updated AI agent: ${id}`,
      metadata: { changes: updateDto },
    });

    return updated;
  }

  async delete(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    const agent = await this.findOne(organizationId, id);

    // Check if agent has active conversations
    const activeConversations = await this.conversationRepository.count({
      where: { agentId: id, status: ConversationStatus.ACTIVE },
    });

    if (activeConversations > 0) {
      throw new BadRequestException(
        `Cannot delete agent with ${activeConversations} active conversations`,
      );
    }

    await this.agentRepository.remove(agent);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "ai_agent",
      resourceId: id,
      description: `Deleted AI agent: ${agent.name}`,
      metadata: { name: agent.name },
    });
  }

  async getStats(organizationId: string): Promise<AgentStatsDto> {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["subscriptions"],
    });

    const agentStats = await this.agentRepository
      .createQueryBuilder("agent")
      .select([
        "COUNT(*) as total",
        "SUM(CASE WHEN agent.status = :active THEN 1 ELSE 0 END) as active",
      ])
      .where("agent.organizationId = :organizationId", { organizationId })
      .setParameter("active", AgentStatus.ACTIVE)
      .getRawOne();

    const statusStats = await this.agentRepository
      .createQueryBuilder("agent")
      .select("agent.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("agent.organizationId = :organizationId", { organizationId })
      .groupBy("agent.status")
      .getRawMany();

    const languageStats = await this.agentRepository
      .createQueryBuilder("agent")
      .select("agent.primaryLanguage", "language")
      .addSelect("COUNT(*)", "count")
      .where("agent.organizationId = :organizationId", { organizationId })
      .groupBy("agent.primaryLanguage")
      .getRawMany();

    const conversationStats = await this.conversationRepository
      .createQueryBuilder("conv")
      .leftJoin("conv.agent", "agent")
      .select([
        "COUNT(*) as totalConversations",
        "COUNT(conv.messages) as totalMessages",
        "AVG(conv.metrics.satisfactionScore) as averageSatisfaction",
      ])
      .where("agent.organizationId = :organizationId", { organizationId })
      .getRawOne();

    // Get agent limits based on subscription
    const subscription = organization?.subscriptions?.[0];
    const plan = subscription?.plan || SubscriptionPlan.FREE;

    const agentLimits = {
      [SubscriptionPlan.FREE]: 1,
      [SubscriptionPlan.STANDARD]: 1,
      [SubscriptionPlan.PRO]: 3,
      [SubscriptionPlan.ENTERPRISE]: 10,
    };

    const limit = agentLimits[plan];
    const used = parseInt(agentStats.total) || 0;

    const byStatus = Object.values(AgentStatus).reduce(
      (acc, status) => {
        acc[status] = parseInt(
          statusStats.find((s) => s.status === status)?.count || "0",
        );
        return acc;
      },
      {} as Record<AgentStatus, number>,
    );

    const byLanguage = Object.values(AgentLanguage).reduce(
      (acc, language) => {
        acc[language] = parseInt(
          languageStats.find((l) => l.language === language)?.count || "0",
        );
        return acc;
      },
      {} as Record<AgentLanguage, number>,
    );

    return {
      total: used,
      totalAgents: used,
      active: parseInt(agentStats.active) || 0,
      activeAgents: parseInt(agentStats.active) || 0,
      conversationsToday: 0,
      conversationsThisMonth: 0,
      averageResponseTime: 0,
      satisfactionRate: 0,
      byStatus,
      byLanguage,
      totalConversations: parseInt(conversationStats.totalConversations) || 0,
      totalMessages: parseInt(conversationStats.totalMessages) || 0,
      averageSatisfaction:
        parseFloat(conversationStats.averageSatisfaction) || 0,
      agentUsage: {
        used,
        limit,
        percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
      },
    };
  }

  async generateFaq(
    organizationId: string,
    agentId: string,
    generateDto: GenerateFaqDto,
  ): Promise<
    Array<{
      question: string;
      answer: string;
      confidence: number;
      sourceDocuments: string[];
    }>
  > {
    // Load agent with knowledge bases
    const agent = await this.agentRepository.findOne({
      where: { id: agentId, organizationId },
      relations: ["knowledgeBases", "knowledgeBases.documents"],
    });

    if (!agent) {
      throw new NotFoundException("AI Agent not found");
    }

    if (!agent.knowledgeBases || agent.knowledgeBases.length === 0) {
      throw new BadRequestException(
        "Agent must have at least one knowledge base to generate FAQ",
      );
    }

    // Collect content from knowledge base documents (up to 5 documents, 8000 chars total)
    let combinedContent = "";
    const documentTitles: string[] = [];
    const maxChars = 8000;

    for (const kb of agent.knowledgeBases) {
      if (combinedContent.length >= maxChars) break;

      // Load documents for this KB
      const documents = await this.knowledgeDocumentRepository.find({
        where: { knowledgeBaseId: kb.id },
        order: { createdAt: "DESC" },
        take: 5,
      });

      for (const doc of documents) {
        if (combinedContent.length >= maxChars) break;

        if (doc.content) {
          const remainingChars = maxChars - combinedContent.length;
          const contentToAdd = doc.content.substring(0, remainingChars);
          combinedContent += `\n\n## ${doc.title}\n${contentToAdd}`;
          documentTitles.push(doc.title);
        }
      }
    }

    if (!combinedContent) {
      throw new BadRequestException(
        "No content found in knowledge bases to generate FAQ",
      );
    }

    // Generate FAQ using LLM
    const maxItems = generateDto.maxItems || 10;
    const language = generateDto.language || agent.primaryLanguage;

    const systemPrompt = `You are a helpful assistant that generates FAQ (Frequently Asked Questions) from documentation.
Your task is to analyze the provided content and create ${maxItems} useful FAQ items.

IMPORTANT: Return ONLY a valid JSON array with no additional text, markdown formatting, or code blocks.
The response must be a plain JSON array that can be parsed directly.

Format:
[
  {
    "question": "Question text here?",
    "answer": "Detailed answer here."
  }
]

Guidelines:
- Generate ${maxItems} FAQ items
- Questions should be natural and user-focused
- Answers should be clear, concise, and helpful
- Use ${language} language
- Focus on the most important information`;

    const userPrompt = `Based on the following knowledge base content, generate ${maxItems} FAQ items:\n\n${combinedContent}`;

    let faqItems: Array<{
      question: string;
      answer: string;
      confidence: number;
      sourceDocuments: string[];
      lastUpdated: Date;
    }> = [];

    try {
      const llmResponse = await this.llmRouter.generateResponse({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        organizationId,
        agentId,
        temperature: 0.3, // Lower temperature for more consistent output
        maxTokens: 2000,
      });

      // Parse LLM response as JSON
      let parsedFaq: Array<{ question: string; answer: string }>;

      try {
        // Try to parse the response directly
        parsedFaq = JSON.parse(llmResponse.content);
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = llmResponse.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsedFaq = JSON.parse(jsonMatch[1]);
        } else {
          // Try to find JSON array in the response
          const arrayMatch = llmResponse.content.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            parsedFaq = JSON.parse(arrayMatch[0]);
          } else {
            throw new Error("Could not parse FAQ from LLM response");
          }
        }
      }

      // Validate and format FAQ items
      if (Array.isArray(parsedFaq)) {
        faqItems = parsedFaq.map((item) => ({
          question: item.question || "",
          answer: item.answer || "",
          confidence: 0.85,
          sourceDocuments: documentTitles,
          lastUpdated: new Date(),
        }));
      }
    } catch (error) {
      // Fallback to some default FAQs if LLM fails
      faqItems = [
        {
          question: `What is ${agent.name}?`,
          answer: agent.description || `${agent.name} is an AI-powered assistant.`,
          confidence: 0.7,
          sourceDocuments: documentTitles,
          lastUpdated: new Date(),
        },
        {
          question: "How can I get help?",
          answer: agent.welcomeMessage || "Feel free to ask me any questions!",
          confidence: 0.7,
          sourceDocuments: documentTitles,
          lastUpdated: new Date(),
        },
      ];
    }

    // Update agent with generated FAQ
    agent.faq = faqItems;
    await this.agentRepository.save(agent);

    return faqItems;
  }

  async debugCatalog(organizationId: string, agentId: string) {
    // Try to find agent with org filter, then without
    let agent = await this.agentRepository.findOne({
      where: organizationId ? { id: agentId, organizationId } : { id: agentId },
      relations: ["knowledgeBases", "catalogs"],
    });

    if (!agent) {
      agent = await this.agentRepository.findOne({
        where: { id: agentId },
        relations: ["knowledgeBases", "catalogs"],
      });
      if (!agent) {
        return { error: "Agent not found", organizationId, agentId };
      }
    }

    const effectiveOrgId = organizationId || agent.organizationId;
    const catalogIds = agent.catalogs?.map(c => c.id) || [];
    const hasEcommerce = catalogIds.length > 0;

    // Raw DB counts for diagnostics
    let productDiagnostics: Record<string, number> = {};
    try {
      productDiagnostics = await this.productSearchService.countProductsDiagnostic(effectiveOrgId);
    } catch (e) {
      this.logger.error(`debugCatalog diagnostic error: ${e.message}`);
    }

    // Search with catalog filter (using general catalog query to get ALL products, not "test")
    let productCountWithCatalog = 0;
    let productCountNoCatalog = 0;
    try {
      const products = await this.productSearchService.searchProducts(
        effectiveOrgId, "quels produits avez-vous en stock", 50,
        catalogIds.length > 0 ? catalogIds : undefined,
      );
      productCountWithCatalog = products.length;
    } catch (e) {
      this.logger.error(`debugCatalog search error: ${e.message}`);
    }
    try {
      const products2 = await this.productSearchService.searchProducts(
        effectiveOrgId, "quels produits avez-vous en stock", 50,
      );
      productCountNoCatalog = products2.length;
    } catch (e) {
      this.logger.error(`debugCatalog search2 error: ${e.message}`);
    }

    return {
      agentName: agent.name,
      passedOrganizationId: organizationId,
      agentOrganizationId: agent.organizationId,
      effectiveOrgId,
      ecommerceEnabled: agent.ecommerceEnabled,
      catalogs: agent.catalogs?.map(c => ({ id: c.id, name: c.name, platform: c.platform })) || [],
      catalogIds,
      hasEcommerce,
      knowledgeBases: agent.knowledgeBases?.map(kb => ({ id: kb.id, name: kb.name })) || [],
      productDiagnostics,
      productCountWithCatalog,
      productCountNoCatalog,
    };
  }

  async testAgent(
    organizationId: string,
    agentId: string,
    testDto: TestAgentDto,
  ): Promise<{
    response: string;
    sources?: Array<{ document: string; chunk: string; confidence: number }>;
    metrics: { responseTime: number; tokensUsed: number; confidence: number };
    media?: Array<{ type: 'image' | 'video' | 'audio'; url: string; caption?: string }>;
  }> {
    const startTime = Date.now();

    // Load agent with knowledge bases and catalogs
    // Note: organizationId may be undefined for individual users, so we also try without it
    let agent = await this.agentRepository.findOne({
      where: organizationId ? { id: agentId, organizationId } : { id: agentId },
      relations: ["knowledgeBases", "catalogs"],
    });

    if (!agent) {
      throw new NotFoundException("AI Agent not found");
    }

    // Use agent's own organizationId as fallback when user's currentOrganizationId is undefined
    const effectiveOrgId = organizationId || agent.organizationId;

    let knowledgeBaseSources: Array<{ document: string; chunk: string; confidence: number }> = [];
    let contextFromKB = "";

    // If includeSources is true, run knowledge base search
    if (testDto.includeSources && agent.knowledgeBases?.length > 0) {
      try {
        const kbIds = agent.knowledgeBases.map((kb) => kb.id);
        const searchResults = await this.vectorSearch.hybridSearch({
          query: testDto.message,
          organizationId: effectiveOrgId,
          knowledgeBaseIds: kbIds,
          limit: 5,
          threshold: 0.6,
          includeContent: true,
        });

        knowledgeBaseSources = searchResults.map((result) => ({
          document: result.document.title,
          chunk: result.chunk.content.substring(0, 200) + "...",
          confidence: result.score,
        }));

        // Build context from search results
        if (searchResults.length > 0) {
          contextFromKB = searchResults
            .map((r) => `[From ${r.document.title}]: ${r.chunk.content}`)
            .join("\n\n");
        }
      } catch (error) {
        // Log error but continue with test
        this.logger.warn("KB search failed during agent test:", error.message);
      }
    }

    // Search product catalog ONLY if agent has actual catalogs linked
    let productContext = "";
    let foundProducts: any[] = [];
    const catalogIds = agent.catalogs?.map(c => c.id) || [];
    const hasEcommerce = catalogIds.length > 0;
    this.logger.log(`[TestAgent] Agent "${agent.name}": catalogIds=${JSON.stringify(catalogIds)}, ecommerceEnabled=${agent.ecommerceEnabled}, hasEcommerce=${hasEcommerce}, effectiveOrgId=${effectiveOrgId}`);
    if (hasEcommerce) {
      try {
        const products = await this.productSearchService.searchProducts(
          effectiveOrgId,
          testDto.message,
          10,
          catalogIds,
        );
        this.logger.log(`[TestAgent] searchProducts returned ${products.length} products`);

        if (products.length > 0) {
          productContext = this.productSearchService.formatProductsForPrompt(products);
          foundProducts = products;
        }
      } catch (error) {
        this.logger.warn("Product search failed during agent test:", error.message);
      }
    } else {
      this.logger.log(`[TestAgent] Skipping product search: hasEcommerce=${hasEcommerce}, effectiveOrgId=${effectiveOrgId}`);
    }

    // Media items will be populated AFTER LLM response (to filter by what the AI actually mentions)
    const mediaItems: Array<{ type: 'image' | 'video' | 'audio'; url: string; caption?: string }> = [];

    // Build system prompt: KB context goes into buildSystemPrompt, product context appended separately
    let systemPrompt = testDto.systemPromptOverride
      ? this.buildSystemPrompt({ ...agent, systemPrompt: testDto.systemPromptOverride } as any, contextFromKB || undefined)
      : this.buildSystemPrompt(agent, contextFromKB || undefined);

    // Append product catalog DIRECTLY to system prompt (not wrapped in KB context)
    // This ensures the LLM treats it as the actual product catalog, not just reference info
    if (productContext) {
      systemPrompt += `\n\n${productContext}`;

      // Add ORDER instructions for e-commerce agents
      systemPrompt += `\n\nORDER CREATION VIA WHATSAPP:
You are communicating with the customer via WhatsApp. There is NO website, NO shopping cart, NO online checkout.
The entire ordering process happens through this conversation.

When a customer wants to buy a product:
1. Confirm the product, variant, and quantity with the customer
2. Ask for their full name (if not already known)
3. Ask for their delivery address (city, neighborhood/street)
4. Ask for their preferred payment method (Mobile Money, cash on delivery, etc.)
5. Once ALL information is collected, you MUST include the [ORDER] tag below in your response to actually register the order

MANDATORY FORMAT — you MUST include this tag when confirming an order:
[ORDER]{"items":[{"productName":"Exact Product Name","variantName":"Variant (optional)","quantity":1}],"clientName":"Customer Name","deliveryAddress":{"street":"Street/Neighborhood","city":"City"},"notes":"Payment method and special instructions"}[/ORDER]

CRITICAL RULES:
- You MUST include the [ORDER] tag when confirming an order — without it the order is NOT registered in the system
- NEVER say "your order is registered" without including the [ORDER] tag
- NEVER mention a shopping cart, checkout page, website, or "add to cart" button
- Use exact product names from the catalog
- The [ORDER] tag is invisible to the customer, include it alongside your confirmation message`;
    }

    // Check escalation keywords before calling LLM
    const escalationConfig = agent.escalationConfig || {};
    const escalationEnabled = escalationConfig.enabled !== false;
    if (escalationEnabled) {
      const keywords = escalationConfig.keywords?.length
        ? escalationConfig.keywords
        : ['parler à un humain', 'agent humain', 'responsable', 'talk to human', 'real person', 'human agent', 'speak to someone'];
      const lowerMessage = testDto.message.toLowerCase();
      const matchedKeyword = keywords.find(kw => lowerMessage.includes(kw.toLowerCase()));
      if (matchedKeyword) {
        const escalationMessage = escalationConfig.escalationMessage
          || "Your conversation has been transferred to a human agent. Someone will assist you shortly. Thank you for your patience.";
        return {
          response: escalationMessage,
          escalated: true,
          escalationReason: `Keyword detected: ${matchedKeyword}`,
          metrics: { responseTime: Date.now() - startTime, tokensUsed: 0, confidence: 1 },
        };
      }

      // Add escalation instructions to system prompt
      systemPrompt += `\n\nESCALATION TO HUMAN OPERATOR:
If you cannot adequately help the user, or if the request requires human intervention, respond ONLY with:
[ESCALATE] Brief reason for escalation

You MUST escalate in these situations:
- The client reports an error in pricing, billing, or invoicing
- The client requests modification to account, order, or pricing
- Complex billing/payment disputes or refund requests
- Technical issues you cannot resolve
- Client is frustrated or explicitly asks for a human
- Any request requiring data system modification
CRITICAL: If you cannot ACTUALLY solve the problem with information from your knowledge base, you MUST escalate. NEVER fabricate a solution or pretend to take action.`;
    }

    // Build messages array: system prompt + conversation history + new user message
    const messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (testDto.conversationHistory?.length) {
      for (const msg of testDto.conversationHistory) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: testDto.message });

    // Call LLM to get actual response
    let response: string;
    let tokensUsed = 0;

    try {
      const llmResponse = await this.llmRouter.generateResponse({
        messages,
        organizationId: effectiveOrgId,
        agentId,
        temperature: agent.config?.temperature || 0.7,
        maxTokens: agent.config?.maxTokens || 2000,
      });

      response = llmResponse.content;
      tokensUsed = llmResponse.usage?.totalTokens || 0;
    } catch (error) {
      this.logger.error(`Agent test LLM error: ${error.message}`);
      throw new BadRequestException(
        `Erreur de generation IA: ${error.message}`,
      );
    }

    // Parse [IMAGE:slug] tags from LLM response (Knowledge Base images)
    const imageTagRegex = /\[IMAGE:([^\]]+)\]/g;
    let cleanResponse = response;
    let imageMatch;
    while ((imageMatch = imageTagRegex.exec(response)) !== null) {
      const slug = imageMatch[1];
      try {
        const kbIds = agent.knowledgeBases?.map(kb => kb.id) || [];
        if (kbIds.length > 0) {
          const doc = await this.knowledgeDocumentRepository.findOne({
            where: { slug, knowledgeBaseId: In(kbIds) },
          });
          if (doc?.filePath) {
            mediaItems.push({
              type: doc.type === 'video' ? 'video' : doc.type === 'audio' ? 'audio' : 'image',
              url: doc.filePath,
              caption: doc.title || slug,
            });
          }
        }
      } catch (e) { /* ignore */ }
      cleanResponse = cleanResponse.replace(imageMatch[0], '').trim();
    }

    // Parse [PRODUCT_IMAGE:N] tags from LLM response (product catalog images)
    // The AI decides which product images to show — only products it actively presents
    if (foundProducts.length > 0) {
      const productImageRegex = /\[PRODUCT_IMAGE:(\d+)\]/g;
      let productMatch;
      const shownProductIndices = new Set<number>();
      while ((productMatch = productImageRegex.exec(cleanResponse)) !== null) {
        const idx = parseInt(productMatch[1], 10) - 1; // 1-based in prompt → 0-based
        if (idx >= 0 && idx < foundProducts.length) {
          shownProductIndices.add(idx);
        }
        cleanResponse = cleanResponse.replace(productMatch[0], '').trim();
      }

      this.logger.log(`[TestAgent] Products: ${foundProducts.length} found, AI requested images for ${shownProductIndices.size} products`);

      for (const idx of shownProductIndices) {
        const product = foundProducts[idx];
        if (product.images?.length > 0) {
          const primaryImg = product.images.find((img: any) => img.isPrimary) || product.images[0];
          if (primaryImg?.url) {
            mediaItems.push({
              type: 'image',
              url: primaryImg.url,
              caption: `${product.name}${product.price ? ` - ${product.price} ${product.currency}` : ''}`,
            });
          }
        }
      }
    }

    // Parse [ORDER] tag from LLM response — create order and strip tag from response
    if (cleanResponse.includes('[ORDER]')) {
      try {
        const { cleanResponse: orderClean, order } = await this.orderTagParserService.parseAndProcess(
          cleanResponse,
          {
            organizationId: organizationId || agent.organizationId,
            agentId: agent.id,
            clientPhoneNumber: 'test-agent',
          },
        );
        cleanResponse = orderClean;
        if (order) {
          this.logger.log(`[TestAgent] Order created: ${order.orderNumber}`);
        }
      } catch (error) {
        this.logger.error(`[TestAgent] Failed to process ORDER tag: ${error.message}`);
        cleanResponse = cleanResponse.replace(/\[ORDER\][\s\S]*?\[\/ORDER\]/, '').trim();
      }
    }

    // Parse [APPOINTMENT] tag — strip it from response (not processed in test mode)
    cleanResponse = cleanResponse.replace(/\[APPOINTMENT\][\s\S]*?\[\/APPOINTMENT\]/, '').trim();

    // Detect [ESCALATE] or [ESCALADE] tag in AI response
    if (/\[ESCALAT[EE]\]/i.test(cleanResponse)) {
      const escalateMatch = cleanResponse.match(/\[ESCALAT[EE]\]\s*(.*)/i);
      const reason = escalateMatch?.[1]?.trim() || 'AI determined escalation needed';
      const escalationMessage = agent.escalationConfig?.escalationMessage
        || "Your conversation has been transferred to a human agent. Someone will assist you shortly. Thank you for your patience.";
      return {
        response: escalationMessage,
        escalated: true,
        escalationReason: reason,
        metrics: { responseTime: Date.now() - startTime, tokensUsed, confidence: 1 },
      };
    }

    response = cleanResponse;

    const responseTime = Date.now() - startTime;

    const result: {
      response: string;
      escalated?: boolean;
      escalationReason?: string;
      sources?: Array<{ document: string; chunk: string; confidence: number }>;
      metrics: { responseTime: number; tokensUsed: number; confidence: number };
      media?: Array<{ type: 'image' | 'video' | 'audio'; url: string; caption?: string }>;
    } = {
      response,
      metrics: {
        responseTime,
        tokensUsed,
        confidence: knowledgeBaseSources.length > 0 ? knowledgeBaseSources[0].confidence : 0.85,
      },
    };

    if (testDto.includeSources && knowledgeBaseSources.length > 0) {
      result.sources = knowledgeBaseSources;
    }

    if (mediaItems.length > 0) {
      result.media = mediaItems;
    }

    return result;
  }

  /**
   * Build system prompt for agent based on configuration
   */
  private buildSystemPrompt(agent: AiAgent, context?: string): string {
    let prompt = agent.systemPrompt;

    // Add tone instructions
    const toneInstructions = {
      professional: "Maintain a professional and formal tone.",
      friendly: "Be warm, friendly, and approachable in your responses.",
      casual: "Use a casual and conversational tone.",
      technical: "Use technical language and be precise in your explanations.",
      empathetic: "Show empathy and understanding in your responses.",
    };

    if (agent.tone && toneInstructions[agent.tone]) {
      prompt += `\n\n${toneInstructions[agent.tone]}`;
    }

    // Add language instructions
    if (agent.primaryLanguage) {
      prompt += `\n\nRespond primarily in ${agent.primaryLanguage}.`;
    }

    // Add emoji instructions
    if (agent.useEmojis) {
      prompt += "\n\nYou may use emojis when appropriate to make the conversation more engaging.";
    } else {
      prompt += "\n\nDo not use emojis in your responses.";
    }

    // Add response length guidance
    const lengthGuidance = {
      short: "Keep responses concise and brief (1-2 sentences when possible).",
      medium: "Provide balanced responses with adequate detail.",
      long: "Provide comprehensive and detailed responses.",
    };

    if (agent.responseLength && lengthGuidance[agent.responseLength]) {
      prompt += `\n\n${lengthGuidance[agent.responseLength]}`;
    }

    // Add knowledge base context if provided
    if (context) {
      prompt += `\n\n## Relevant Knowledge Base Context:\n${context}\n\nUse the above context to answer the user's question accurately.`;
    }

    return prompt;
  }

  private async checkAgentLimit(
    organizationId: string | null,
    userId: string,
  ): Promise<void> {
    let subscription;
    let currentCount;

    if (organizationId) {
      // Check organization subscription
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
        relations: ["subscriptions"],
      });
      subscription = organization?.subscriptions?.[0];

      // Count agents for organization
      currentCount = await this.agentRepository.count({
        where: { organizationId },
      });
    } else {
      // For users without organization, get their personal subscription from database
      const userSubscription = await this.subscriptionRepository.findOne({
        where: { userId, organizationId: IsNull() },
      });

      subscription = userSubscription || { plan: SubscriptionPlan.FREE };

      // Count agents for user
      currentCount = await this.agentRepository.count({
        where: { createdBy: userId, organizationId: IsNull() },
      });
    }

    const plan = subscription?.plan || SubscriptionPlan.FREE;

    const agentLimits = {
      [SubscriptionPlan.FREE]: 1,
      [SubscriptionPlan.STANDARD]: 1,
      [SubscriptionPlan.PRO]: 3,
      [SubscriptionPlan.ENTERPRISE]: 10,
    };

    if (currentCount >= agentLimits[plan]) {
      throw new ForbiddenException(
        `AI Agent limit (${agentLimits[plan]}) reached for ${plan} plan`,
      );
    }
  }

  private async validateKnowledgeBases(
    organizationId: string | null,
    userId: string,
    knowledgeBaseIds: string[],
  ): Promise<void> {
    // Build query based on whether user has organization or not
    const where = organizationId
      ? { id: In(knowledgeBaseIds), organizationId }
      : { id: In(knowledgeBaseIds), createdBy: userId };

    const knowledgeBases = await this.knowledgeBaseRepository.findBy(where);

    if (knowledgeBases.length !== knowledgeBaseIds.length) {
      throw new BadRequestException(
        "One or more knowledge bases not found or not accessible",
      );
    }
  }

  private static readonly VALID_CONFIG_KEYS = [
    'maxTokens', 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty',
    'avoidRepetition', 'useListsWhenAppropriate', 'includeGreetings', 'signOffStyle',
  ];

  private stripInvalidConfigKeys(config: any): any {
    if (!config) return config;
    const cleaned: any = {};
    for (const key of AiAgentService.VALID_CONFIG_KEYS) {
      if (key in config) cleaned[key] = config[key];
    }
    return cleaned;
  }

  private validateSystemPrompt(prompt: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Check length
    if (prompt.length < 10) {
      throw new BadRequestException(
        "System prompt is too short (minimum 10 characters)",
      );
    }
    if (prompt.length > 10000) {
      throw new BadRequestException(
        "System prompt is too long (maximum 10,000 characters)",
      );
    }

    // Check for injection patterns
    const injectionPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /ignore\s+(all\s+)?instructions/i,
      /disregard\s+(your\s+)?instructions/i,
      /forget\s+(your\s+)?rules/i,
      /you\s+are\s+now\s+a/i,
      /new\s+instructions\s*:/i,
      /system\s+override/i,
      /jailbreak/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(prompt)) {
        throw new BadRequestException(
          `System prompt contains a potentially dangerous instruction pattern. Please remove phrases like "${prompt.match(pattern)?.[0]}" from your prompt.`,
        );
      }
    }

    // Check for PII (warn only)
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(prompt)) {
      warnings.push(
        "Your prompt appears to contain a credit card number. Consider removing sensitive data.",
      );
    }

    return { warnings };
  }

  async getPromptHistory(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<
    Array<{
      prompt: string;
      version: number;
      updatedAt: string;
      updatedBy?: string;
    }>
  > {
    const agent = await this.findOneForUser(organizationId, userId, id);
    return agent.promptHistory || [];
  }

  async rollbackPrompt(
    organizationId: string | null,
    userId: string,
    id: string,
    version: number,
  ): Promise<AiAgent> {
    const agent = await this.findOneForUser(organizationId, userId, id);

    if (!agent.promptHistory || agent.promptHistory.length === 0) {
      throw new BadRequestException("No prompt history available");
    }

    const historicalEntry = agent.promptHistory.find(
      (entry) => entry.version === version,
    );

    if (!historicalEntry) {
      throw new BadRequestException(
        `Prompt version ${version} not found in history`,
      );
    }

    // Save current prompt to history before rolling back
    if (!agent.promptHistory) agent.promptHistory = [];
    agent.promptHistory.push({
      prompt: agent.systemPrompt,
      version: agent.version,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    });

    // Keep only last 10 versions
    if (agent.promptHistory.length > 10) {
      agent.promptHistory = agent.promptHistory.slice(-10);
    }

    // Set agent system prompt to the historical version
    agent.systemPrompt = historicalEntry.prompt;
    agent.version += 1;

    const updated = await this.agentRepository.save(agent);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "ai_agent",
      resourceId: id,
      description: `Rolled back AI agent prompt to version ${version}`,
      metadata: { rollbackToVersion: version },
    });

    return updated;
  }

  /**
   * Clone an existing agent with all its settings
   */
  async cloneAgent(
    organizationId: string | null,
    userId: string,
    id: string,
    customName?: string,
  ): Promise<AiAgent> {
    // Load source agent with knowledge bases
    const sourceAgent = await this.agentRepository.findOne({
      where: organizationId
        ? { id, organizationId }
        : { id, createdBy: userId },
      relations: ["knowledgeBases"],
    });

    if (!sourceAgent) {
      throw new NotFoundException("Source agent not found");
    }

    // Check agent limits before cloning
    await this.checkAgentLimit(organizationId, userId);

    // Create new agent with copied settings
    const clonedAgent = this.agentRepository.create({
      name: customName || `${sourceAgent.name} (Copy)`,
      description: sourceAgent.description,
      avatarUrl: sourceAgent.avatarUrl,
      primaryLanguage: sourceAgent.primaryLanguage,
      supportedLanguages: sourceAgent.supportedLanguages,
      tone: sourceAgent.tone,
      systemPrompt: sourceAgent.systemPrompt,
      welcomeMessage: sourceAgent.welcomeMessage,
      fallbackMessage: sourceAgent.fallbackMessage,
      responseLength: sourceAgent.responseLength,
      verbosity: sourceAgent.verbosity,
      useEmojis: sourceAgent.useEmojis,
      maxResponseChars: sourceAgent.maxResponseChars,
      config: { ...sourceAgent.config },
      tags: [...(sourceAgent.tags || [])],
      organizationId: organizationId || undefined,
      createdBy: userId,
      status: AgentStatus.INACTIVE, // Start as inactive
      metrics: {
        totalConversations: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        satisfactionScore: 0,
        successfulResponses: 0,
        failedResponses: 0,
        knowledgeBaseHits: 0,
      },
      faq: [],
      version: 1,
      promptHistory: [],
    });

    const saved = await this.agentRepository.save(clonedAgent);

    // Link the same knowledge bases
    if (sourceAgent.knowledgeBases && sourceAgent.knowledgeBases.length > 0) {
      saved.knowledgeBases = sourceAgent.knowledgeBases;
      await this.agentRepository.save(saved);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ai_agent",
      resourceId: saved.id,
      description: `Cloned AI agent from: ${sourceAgent.name}`,
      metadata: { sourceAgentId: sourceAgent.id, clonedName: saved.name },
    });

    return saved;
  }

  /**
   * Get conversations for a specific agent with pagination
   */
  async getAgentConversations(
    organizationId: string | null,
    userId: string,
    agentId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: Array<AgentConversation & { latestMessage?: AgentMessage }>;
    total: number;
    page: number;
    limit: number;
  }> {
    // Verify agent exists and user has access
    const agent = await this.findOneForUser(organizationId, userId, agentId);

    if (!agent) {
      throw new NotFoundException("Agent not found");
    }

    // Build query for conversations
    const queryBuilder = this.conversationRepository
      .createQueryBuilder("conversation")
      .where("conversation.agentId = :agentId", { agentId })
      .orderBy("conversation.updatedAt", "DESC");

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated data
    const conversations = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Load latest message for each conversation
    const conversationsWithMessages: Array<AgentConversation & { latestMessage?: AgentMessage }> = [];

    for (const conv of conversations) {
      const latestMessage = await this.messageRepository.findOne({
        where: { conversationId: conv.id },
        order: { createdAt: "DESC" },
      });

      conversationsWithMessages.push(
        Object.assign(conv, { latestMessage })
      );
    }

    return {
      data: conversationsWithMessages,
      total,
      page,
      limit,
    };
  }
}
