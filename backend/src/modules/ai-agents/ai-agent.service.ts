import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class AiAgentService {
  constructor(
    @InjectRepository(AiAgent)
    private readonly agentRepository: Repository<AiAgent>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

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

    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string | null,
    userId: string,
    createDto: CreateAiAgentDto,
  ): Promise<AiAgent> {
    // Check agent limits for all users (by organization or by user)
    await this.checkAgentLimit(organizationId, userId);

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
        maxTokens: 2000,
        temperature: 0.7,
        topP: 0.9,
        contextWindow: 4000,
        memorySize: 10,
        responseFormat: "text",
        enableFunctionCalling: false,
        enableWebSearch: false,
        enableImageAnalysis: false,
        confidenceThreshold: 0.7,
        maxRetries: 3,
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
      .leftJoinAndSelect("agent.knowledgeBases", "knowledgeBases");

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

    return { data, total };
  }

  async findOne(organizationId: string, id: string): Promise<AiAgent> {
    const agent = await this.agentRepository.findOne({
      where: { id, organizationId },
      relations: ["creator", "knowledgeBases", "conversations"],
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
        relations: ["creator", "knowledgeBases", "conversations"],
      });
    } else {
      // User without organization - find any agent they created OR any agent accessible to them
      agent = await this.agentRepository.findOne({
        where: [
          { id, createdBy: userId },
          { id, organizationId: IsNull() }
        ],
        relations: ["creator", "knowledgeBases", "conversations"],
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

    // Validate knowledge bases if being updated
    if (updateDto.knowledgeBaseIds?.length) {
      await this.validateKnowledgeBases(
        organizationId,
        userId,
        updateDto.knowledgeBaseIds,
      );
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

    // Validate knowledge bases if being updated
    if (updateDto.knowledgeBaseIds?.length) {
      await this.validateKnowledgeBases(
        organizationId,
        userId,
        updateDto.knowledgeBaseIds,
      );
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
    const agent = await this.findOne(organizationId, agentId);

    // This would use the LLM to generate FAQ items from knowledge base content
    // For now, return placeholder data
    const faqItems = [
      {
        question: "How do I reset my password?",
        answer:
          "To reset your password, click on the 'Forgot Password' link on the login page and follow the instructions.",
        confidence: 0.95,
        sourceDocuments: ["user-guide.pdf", "help-center.md"],
        lastUpdated: new Date(),
      },
      {
        question: "What are your business hours?",
        answer: "Our business hours are Monday to Friday, 9 AM to 6 PM EST.",
        confidence: 0.9,
        sourceDocuments: ["company-info.md"],
        lastUpdated: new Date(),
      },
    ];

    // Update agent with generated FAQ
    agent.faq = faqItems;
    await this.agentRepository.save(agent);

    return faqItems;
  }

  async testAgent(
    organizationId: string,
    agentId: string,
    testDto: TestAgentDto,
  ): Promise<{
    response: string;
    sources?: Array<{ document: string; chunk: string; confidence: number }>;
    metrics: { responseTime: number; tokensUsed: number; confidence: number };
  }> {
    const agent = await this.findOne(organizationId, agentId);

    const startTime = Date.now();

    // This would integrate with the LLM service to generate a response
    // For now, return a mock response
    const response = `Hello! This is a test response from ${agent.name}. Your message was: "${testDto.message}"`;

    const responseTime = Date.now() - startTime;

    const result = {
      response,
      metrics: {
        responseTime,
        tokensUsed: Math.ceil(response.length / 4), // Rough estimation
        confidence: 0.85,
      },
    };

    if (testDto.includeSources) {
      result["sources"] = [
        {
          document: "sample-document.pdf",
          chunk:
            "Sample chunk content that was used to generate this response...",
          confidence: 0.85,
        },
      ];
    }

    return result;
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
}
