import { Injectable, ForbiddenException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import {
  Organization,
  Subscription,
  UsageMetric,
  AiAgent,
  KnowledgeBase,
  KnowledgeDocument,
  WhatsAppSession,
  User,
  AgentConversation,
  AgentMessage,
} from "../../common/entities";
import { MessageRole } from "../../common/enums";
import { SubscriptionPlan, UsageMetricType } from "../../common/enums";
import {
  SUBSCRIPTION_LIMITS,
  SUBSCRIPTION_FEATURES,
} from "../../common/entities/subscription.entity";

export interface QuotaCheck {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  percentUsed: number;
  message?: string;
}

export interface FeatureCheck {
  enabled: boolean;
  requiredPlan?: SubscriptionPlan;
  message?: string;
}

@Injectable()
export class QuotaEnforcementService {
  private readonly logger = new Logger(QuotaEnforcementService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,

    @InjectRepository(AiAgent)
    private readonly aiAgentRepository: Repository<AiAgent>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,

    @InjectRepository(WhatsAppSession)
    private readonly sessionRepository: Repository<WhatsAppSession>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,

    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
  ) {}

  async checkAgentQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxAgents;

    // Count WhatsApp sessions for the organization (not AI agents)
    const current = await this.sessionRepository.count({
      where: { organizationId },
    });

    return this.buildQuotaCheck(current, limit, "WhatsApp sessions");
  }

  async checkUserAgentQuota(userId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveUserSubscription(userId);
    const limit = subscription.limits.maxAgents;

    // Count WhatsApp sessions for the user instead of AI agents
    const current = await this.sessionRepository.count({
      where: { userId, organizationId: IsNull() },
    });

    return this.buildQuotaCheck(current, limit, "WhatsApp agents");
  }

  async checkKnowledgeBaseQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxKnowledgeBases;

    const current = await this.knowledgeBaseRepository.count({
      where: { organizationId },
    });

    return this.buildQuotaCheck(current, limit, "knowledge bases");
  }

  async checkDocumentQuota(
    organizationId: string,
    knowledgeBaseId: string,
  ): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxDocumentsPerKB;

    const current = await this.documentRepository.count({
      where: { knowledgeBaseId },
    });

    return this.buildQuotaCheck(current, limit, "documents per knowledge base");
  }

  async checkStorageQuota(
    organizationId: string,
    additionalBytes?: number,
  ): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxStorageBytes;

    // Get current storage usage
    const current = await this.getCurrentStorageUsage(organizationId);
    const totalUsage = current + (additionalBytes || 0);

    return this.buildQuotaCheck(totalUsage, limit, "storage", "bytes");
  }

  async checkKnowledgeCharacterQuota(
    organizationId: string,
    additionalChars?: number,
  ): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxKnowledgeChars;

    // Get current character usage from knowledge bases
    const knowledgeBases = await this.knowledgeBaseRepository.find({
      where: { organizationId },
      select: ["totalCharacters"],
    });

    const current = knowledgeBases.reduce(
      (total, kb) => total + (kb.totalCharacters || 0),
      0,
    );
    const totalUsage = current + (additionalChars || 0);

    return this.buildQuotaCheck(totalUsage, limit, "knowledge base characters");
  }

  async checkMonthlyRequestQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxRequestsPerMonth;

    const current = await this.getMonthlyUsage(
      organizationId,
      UsageMetricType.API_REQUESTS,
    );

    return this.buildQuotaCheck(current, limit, "monthly API requests");
  }

  async checkLLMTokenQuota(
    organizationId: string,
    additionalTokens?: number,
  ): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxLLMTokensPerMonth;

    const current = await this.getMonthlyUsage(
      organizationId,
      UsageMetricType.LLM_TOKENS,
    );
    const totalUsage = current + (additionalTokens || 0);

    return this.buildQuotaCheck(totalUsage, limit, "monthly LLM tokens");
  }

  async checkVectorSearchQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxVectorSearches;

    const current = await this.getMonthlyUsage(
      organizationId,
      UsageMetricType.VECTOR_SEARCHES,
    );

    return this.buildQuotaCheck(current, limit, "monthly vector searches");
  }

  async checkConversationQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxConversationsPerMonth;

    const current = await this.getMonthlyUsage(
      organizationId,
      UsageMetricType.AI_CONVERSATIONS,
    );

    return this.buildQuotaCheck(current, limit, "monthly conversations");
  }

  async checkFileUploadSize(
    organizationId: string,
    fileSize: number,
  ): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxFileUploadSize;

    return this.buildQuotaCheck(fileSize, limit, "file upload size", "bytes");
  }

  /**
   * Check WhatsApp message quota for an organization
   * Counts actual messages from AgentMessage table
   */
  async checkWhatsAppMessageQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const limit = subscription.limits.maxRequestsPerMonth; // Using requests limit for messages

    const current = await this.getActualWhatsAppMessageCount(organizationId);

    return this.buildQuotaCheck(current, limit, "monthly WhatsApp messages");
  }

  /**
   * Check WhatsApp message quota for a user (without organization)
   */
  async checkUserWhatsAppMessageQuota(userId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveUserSubscription(userId);
    const limit = subscription.limits.maxRequestsPerMonth;

    const current = await this.getUserActualWhatsAppMessageCount(userId);

    return this.buildQuotaCheck(current, limit, "monthly WhatsApp messages");
  }

  /**
   * Get actual WhatsApp message count for organization from AgentMessage table
   * Counts messages from conversations linked to sessions OR agents of this organization
   */
  private async getActualWhatsAppMessageCount(organizationId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get all sessions for this organization
    const sessions = await this.sessionRepository.find({
      where: { organizationId },
      select: ['id'],
      relations: ['agent'],
    });
    const sessionIds = sessions.map(s => s.id);
    const agentIds = sessions
      .filter(s => s.agent?.id)
      .map(s => s.agent.id);

    // Also get agents directly assigned to this organization
    const orgAgents = await this.aiAgentRepository.find({
      where: { organizationId },
      select: ['id'],
    });
    const orgAgentIds = orgAgents.map(a => a.id);

    // Combine all agent IDs
    const allAgentIds = [...new Set([...agentIds, ...orgAgentIds])];

    if (sessionIds.length === 0 && allAgentIds.length === 0) {
      return 0;
    }

    // Build query to find conversations by sessionId OR agentId
    const conversationQuery = this.conversationRepository
      .createQueryBuilder('conv')
      .select(['conv.id']);

    const conditions: string[] = [];
    const params: any = {};

    if (sessionIds.length > 0) {
      conditions.push('conv.sessionId IN (:...sessionIds)');
      params.sessionIds = sessionIds;
    }
    if (allAgentIds.length > 0) {
      conditions.push('conv.agentId IN (:...agentIds)');
      params.agentIds = allAgentIds;
    }

    if (conditions.length === 0) {
      return 0;
    }

    conversationQuery.where(`(${conditions.join(' OR ')})`, params);
    const conversations = await conversationQuery.getMany();
    const conversationIds = conversations.map(c => c.id);

    if (conversationIds.length === 0) {
      return 0;
    }

    // Count user messages this month
    const count = await this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId IN (:...conversationIds)', { conversationIds })
      .andWhere('msg.role = :role', { role: MessageRole.USER })
      .andWhere('msg.createdAt >= :startOfMonth', { startOfMonth })
      .getCount();

    return count;
  }

  /**
   * Get actual WhatsApp message count for user from AgentMessage table
   * Counts messages from conversations linked to user's sessions OR agents
   */
  private async getUserActualWhatsAppMessageCount(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get all sessions for this user (without organization)
    const sessions = await this.sessionRepository.find({
      where: { userId, organizationId: IsNull() },
      select: ['id'],
      relations: ['agent'],
    });
    const sessionIds = sessions.map(s => s.id);
    const agentIds = sessions
      .filter(s => s.agent?.id)
      .map(s => s.agent.id);

    // Also get agents created by this user
    const userAgents = await this.aiAgentRepository.find({
      where: { createdBy: userId },
      select: ['id'],
    });
    const userAgentIds = userAgents.map(a => a.id);

    // Combine all agent IDs
    const allAgentIds = [...new Set([...agentIds, ...userAgentIds])];

    if (sessionIds.length === 0 && allAgentIds.length === 0) {
      return 0;
    }

    // Build query to find conversations by sessionId OR agentId
    const conversationQuery = this.conversationRepository
      .createQueryBuilder('conv')
      .select(['conv.id']);

    const conditions: string[] = [];
    const params: any = {};

    if (sessionIds.length > 0) {
      conditions.push('conv.sessionId IN (:...sessionIds)');
      params.sessionIds = sessionIds;
    }
    if (allAgentIds.length > 0) {
      conditions.push('conv.agentId IN (:...agentIds)');
      params.agentIds = allAgentIds;
    }

    if (conditions.length === 0) {
      return 0;
    }

    conversationQuery.where(`(${conditions.join(' OR ')})`, params);
    const conversations = await conversationQuery.getMany();
    const conversationIds = conversations.map(c => c.id);

    if (conversationIds.length === 0) {
      return 0;
    }

    // Count user messages this month
    const count = await this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId IN (:...conversationIds)', { conversationIds })
      .andWhere('msg.role = :role', { role: MessageRole.USER })
      .andWhere('msg.createdAt >= :startOfMonth', { startOfMonth })
      .getCount();

    return count;
  }

  /**
   * Enforce WhatsApp message quota
   */
  async enforceWhatsAppMessageQuota(organizationId: string): Promise<void> {
    const check = await this.checkWhatsAppMessageQuota(organizationId);
    if (!check.allowed) {
      throw new ForbiddenException(
        `Message limit exceeded. You have used ${check.current} of ${check.limit} monthly messages. Please upgrade your plan.`
      );
    }
  }

  /**
   * Enforce user WhatsApp message quota
   */
  async enforceUserWhatsAppMessageQuota(userId: string): Promise<void> {
    const check = await this.checkUserWhatsAppMessageQuota(userId);
    if (!check.allowed) {
      throw new ForbiddenException(
        `Message limit exceeded. You have used ${check.current} of ${check.limit} monthly messages. Please upgrade your plan.`
      );
    }
  }

  // Feature access checks
  async checkFeatureAccess(
    organizationId: string,
    feature: keyof (typeof SUBSCRIPTION_FEATURES)[SubscriptionPlan.FREE],
  ): Promise<FeatureCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const enabled = subscription.features[feature];

    if (enabled) {
      return { enabled: true };
    }

    // Find the minimum required plan for this feature
    const requiredPlan = this.findRequiredPlan(feature);

    return {
      enabled: false,
      requiredPlan,
      message: `Feature '${feature}' requires ${requiredPlan} plan or higher`,
    };
  }

  async checkAdvancedLLMAccess(organizationId: string): Promise<FeatureCheck> {
    return this.checkFeatureAccess(organizationId, "advancedLLMs");
  }

  async checkFunctionCallingAccess(
    organizationId: string,
  ): Promise<FeatureCheck> {
    return this.checkFeatureAccess(organizationId, "functionCalling");
  }

  async checkImageAnalysisAccess(
    organizationId: string,
  ): Promise<FeatureCheck> {
    return this.checkFeatureAccess(organizationId, "imageAnalysis");
  }

  async checkPremiumVectorSearchAccess(
    organizationId: string,
  ): Promise<FeatureCheck> {
    return this.checkFeatureAccess(organizationId, "premiumVectorSearch");
  }

  // Enforcement methods that throw exceptions
  async enforceAgentQuota(organizationId: string): Promise<void> {
    const check = await this.checkAgentQuota(organizationId);
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceUserAgentQuota(userId: string): Promise<void> {
    const check = await this.checkUserAgentQuota(userId);
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceKnowledgeBaseQuota(organizationId: string): Promise<void> {
    const check = await this.checkKnowledgeBaseQuota(organizationId);
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceStorageQuota(
    organizationId: string,
    additionalBytes: number,
  ): Promise<void> {
    const check = await this.checkStorageQuota(organizationId, additionalBytes);
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceKnowledgeCharacterQuota(
    organizationId: string,
    additionalChars: number,
  ): Promise<void> {
    const check = await this.checkKnowledgeCharacterQuota(
      organizationId,
      additionalChars,
    );
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceLLMTokenQuota(
    organizationId: string,
    additionalTokens: number,
  ): Promise<void> {
    const check = await this.checkLLMTokenQuota(
      organizationId,
      additionalTokens,
    );
    if (!check.allowed) {
      throw new ForbiddenException(check.message);
    }
  }

  async enforceFeatureAccess(
    organizationId: string,
    feature: string,
  ): Promise<void> {
    const check = await this.checkFeatureAccess(organizationId, feature as any);
    if (!check.enabled) {
      throw new ForbiddenException(check.message);
    }
  }

  // Usage reporting
  async getUsageSummary(organizationId: string): Promise<any> {
    const subscription = await this.getActiveSubscription(organizationId);

    // Get organization details including name
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    const [
      agentCheck,
      kbCheck,
      storageCheck,
      characterCheck,
      requestCheck,
      tokenCheck,
      vectorSearchCheck,
      conversationCheck,
      whatsappMessageCheck,
    ] = await Promise.all([
      this.checkAgentQuota(organizationId),
      this.checkKnowledgeBaseQuota(organizationId),
      this.checkStorageQuota(organizationId),
      this.checkKnowledgeCharacterQuota(organizationId),
      this.checkMonthlyRequestQuota(organizationId),
      this.checkLLMTokenQuota(organizationId),
      this.checkVectorSearchQuota(organizationId),
      this.checkConversationQuota(organizationId),
      this.checkWhatsAppMessageQuota(organizationId),
    ]);

    return {
      plan: subscription.plan,
      status: subscription.status,
      organizationId,
      organizationName: organization?.name || null,
      usage: {
        agents: agentCheck,
        knowledgeBases: kbCheck,
        storage: storageCheck,
        knowledgeCharacters: characterCheck,
        monthlyRequests: requestCheck,
        monthlyTokens: tokenCheck,
        monthlyVectorSearches: vectorSearchCheck,
        monthlyConversations: conversationCheck,
        whatsappMessages: whatsappMessageCheck,
      },
      features: subscription.features,
    };
  }

  async getUserUsageSummary(userId: string): Promise<any> {
    console.log(`[USAGE] Getting user usage summary for userId: ${userId}`);
    const subscription = await this.getActiveUserSubscription(userId);
    console.log(`[USAGE] Got subscription plan: ${subscription.plan}`);

    // For individual users, we check WhatsApp agents and messages
    const [agentCheck, whatsappMessageCheck] = await Promise.all([
      this.checkUserAgentQuota(userId),
      this.checkUserWhatsAppMessageQuota(userId),
    ]);

    console.log(
      `[USAGE] Agent quota check: limit=${agentCheck.limit}, current=${agentCheck.current}`,
    );
    console.log(
      `[USAGE] WhatsApp message quota check: limit=${whatsappMessageCheck.limit}, current=${whatsappMessageCheck.current}`,
    );

    // Individual users don't have knowledge bases, storage, etc. for now
    // But they can have basic limits
    const basicQuota = {
      allowed: true,
      limit: 0,
      current: 0,
      remaining: 0,
      percentUsed: 0,
    };

    const result = {
      plan: subscription.plan,
      status: subscription.status,
      usage: {
        agents: agentCheck,
        knowledgeBases: basicQuota,
        storage: basicQuota,
        knowledgeCharacters: basicQuota,
        monthlyRequests: whatsappMessageCheck, // Use actual message count for requests
        monthlyTokens: basicQuota,
        monthlyVectorSearches: basicQuota,
        monthlyConversations: basicQuota,
        whatsappMessages: whatsappMessageCheck,
      },
      features: subscription.features,
    };

    console.log(`[USAGE] Returning result with plan: ${result.plan}`);
    return result;
  }

  private async getActiveSubscription(
    organizationId: string,
  ): Promise<Subscription> {
    this.logger.debug(`Looking for organization: ${organizationId}`);

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: ["subscriptions"],
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    this.logger.debug(
      `Found organization: ${organization.name}, subscriptions count: ${organization.subscriptions?.length || 0}`,
    );

    if (organization.subscriptions) {
      organization.subscriptions.forEach((sub) => {
        this.logger.debug(
          `Subscription: ${sub.id}, plan: ${sub.plan}, status: ${sub.status}, isActive: ${sub.isActive}`,
        );
      });
    }

    const activeSubscription = organization.subscriptions?.find(
      (sub) => sub.isActive,
    );

    if (!activeSubscription) {
      this.logger.debug(
        "No active subscription found, creating free subscription",
      );
      // Create default free subscription
      const freeSubscription = this.subscriptionRepository.create({
        organizationId,
        plan: SubscriptionPlan.FREE,
        limits: SUBSCRIPTION_LIMITS[SubscriptionPlan.FREE],
        features: SUBSCRIPTION_FEATURES[SubscriptionPlan.FREE],
        startsAt: new Date(),
      });

      return this.subscriptionRepository.save(freeSubscription);
    }

    // Always sync limits and features with the latest code values
    // This ensures upgrades and code updates are always reflected
    const planKey = activeSubscription.plan.toUpperCase() as keyof typeof SUBSCRIPTION_LIMITS;
    const currentLimits = SUBSCRIPTION_LIMITS[planKey] || SUBSCRIPTION_LIMITS[SubscriptionPlan.FREE];
    const currentFeatures = SUBSCRIPTION_FEATURES[planKey] || SUBSCRIPTION_FEATURES[SubscriptionPlan.FREE];

    // Check if limits/features need updating
    const limitsNeedUpdate = JSON.stringify(activeSubscription.limits) !== JSON.stringify(currentLimits);
    const featuresNeedUpdate = JSON.stringify(activeSubscription.features) !== JSON.stringify(currentFeatures);

    if (limitsNeedUpdate || featuresNeedUpdate) {
      this.logger.log(`Syncing subscription limits/features for plan ${activeSubscription.plan}`);
      activeSubscription.limits = currentLimits;
      activeSubscription.features = currentFeatures;
      await this.subscriptionRepository.save(activeSubscription);
    }

    this.logger.debug(
      `Returning active subscription: ${activeSubscription.plan}`,
    );
    return activeSubscription;
  }

  private async getActiveUserSubscription(
    userId: string,
  ): Promise<Subscription> {
    console.log(
      `[QUOTA] Getting active user subscription for userId: ${userId}`,
    );

    // Find active subscription for this user (not associated with organization)
    let activeSubscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        organizationId: IsNull(),
      },
    });

    console.log(
      `[QUOTA] Found existing subscription: ${activeSubscription ? "YES" : "NO"}`,
    );

    // Load user email for mapping
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const email = (user?.email || '').toLowerCase();

    // Helper to map demo/test emails to plans
    const mapEmailToPlan = (): SubscriptionPlan => {
      if (email === 'standard.user@wazeapp.com') return SubscriptionPlan.STANDARD;
      if (email === 'prouser@example.com' || email === 'pro.user@wazeapp.com') return SubscriptionPlan.PRO;
      if (email === 'enterprise@example.com') return SubscriptionPlan.ENTERPRISE;
      return SubscriptionPlan.FREE;
    };

    if (!activeSubscription) {
      // Default or mapped plan on first subscription creation
      const plan: SubscriptionPlan = mapEmailToPlan();
      console.log(`[QUOTA] Creating subscription for ${email} with plan ${plan}`);

      // Create subscription for user
      activeSubscription = this.subscriptionRepository.create({
        userId,
        organizationId: null,
        plan,
        limits: SUBSCRIPTION_LIMITS[plan],
        features: SUBSCRIPTION_FEATURES[plan],
        startsAt: new Date(),
      });

      console.log(
        `[QUOTA] Created subscription object with plan: ${activeSubscription.plan}`,
      );

      try {
        activeSubscription =
          await this.subscriptionRepository.save(activeSubscription);
        console.log(
          `[QUOTA] Successfully saved subscription with id: ${activeSubscription.id}, plan: ${activeSubscription.plan}`,
        );
      } catch (error) {
        console.error(`[QUOTA] Failed to save subscription: ${error.message}`);
        throw error;
      }
    } else {
      // If an existing subscription exists but mapping expects a higher plan (demo accounts), adjust it
      const desired = mapEmailToPlan();
      if (desired !== activeSubscription.plan) {
        console.log(
          `[QUOTA] Adjusting existing plan for ${email} from ${activeSubscription.plan} to ${desired}`,
        );
        activeSubscription.plan = desired;
        activeSubscription.limits = SUBSCRIPTION_LIMITS[desired];
        activeSubscription.features = SUBSCRIPTION_FEATURES[desired];
        await this.subscriptionRepository.save(activeSubscription);
      } else {
        // Always sync limits and features with the latest code values
        // This ensures upgrades and code updates are always reflected
        const planKey = activeSubscription.plan.toUpperCase() as keyof typeof SUBSCRIPTION_LIMITS;
        const currentLimits = SUBSCRIPTION_LIMITS[planKey] || SUBSCRIPTION_LIMITS[SubscriptionPlan.FREE];
        const currentFeatures = SUBSCRIPTION_FEATURES[planKey] || SUBSCRIPTION_FEATURES[SubscriptionPlan.FREE];

        const limitsNeedUpdate = JSON.stringify(activeSubscription.limits) !== JSON.stringify(currentLimits);
        const featuresNeedUpdate = JSON.stringify(activeSubscription.features) !== JSON.stringify(currentFeatures);

        if (limitsNeedUpdate || featuresNeedUpdate) {
          this.logger.log(`Syncing user subscription limits/features for plan ${activeSubscription.plan}`);
          activeSubscription.limits = currentLimits;
          activeSubscription.features = currentFeatures;
          await this.subscriptionRepository.save(activeSubscription);
        }
      }
    }

    return activeSubscription;
  }

  private buildQuotaCheck(
    current: number,
    limit: number,
    resource: string,
    unit: string = "items",
  ): QuotaCheck {
    const remaining = Math.max(0, limit - current);
    const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;
    const allowed = current < limit;

    return {
      allowed,
      limit,
      current,
      remaining,
      percentUsed,
      message: allowed
        ? undefined
        : `${resource} limit exceeded (${current}/${limit} ${unit})`,
    };
  }

  private async getCurrentStorageUsage(
    organizationId: string,
  ): Promise<number> {
    const result = await this.documentRepository
      .createQueryBuilder("doc")
      .leftJoin("doc.knowledgeBase", "kb")
      .select("SUM(doc.fileSize)", "totalSize")
      .where("kb.organizationId = :organizationId", { organizationId })
      .getRawOne();

    return parseInt(result.totalSize) || 0;
  }

  private async getMonthlyUsage(
    organizationId: string,
    type: UsageMetricType,
  ): Promise<number> {
    const currentDate = new Date();
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );

    const result = await this.usageMetricRepository
      .createQueryBuilder("metric")
      .select("COALESCE(SUM(metric.value), 0)", "total")
      .where("metric.organizationId = :organizationId", { organizationId })
      .andWhere("metric.type = :type", { type })
      .andWhere("metric.date >= :startOfMonth", { startOfMonth })
      .andWhere("metric.date <= :endOfMonth", { endOfMonth })
      .getRawOne();

    return parseInt(result.total) || 0;
  }

  private findRequiredPlan(feature: string): SubscriptionPlan {
    for (const [plan, features] of Object.entries(SUBSCRIPTION_FEATURES)) {
      if (features[feature as keyof typeof features]) {
        return plan as SubscriptionPlan;
      }
    }
    return SubscriptionPlan.ENTERPRISE;
  }
}
