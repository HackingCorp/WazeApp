import { Injectable, ForbiddenException, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan } from "typeorm";
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
  MessageCredit,
  MessageCreditStatus,
  OrganizationMember,
} from "../../common/entities";
import { MessageRole } from "../../common/enums";
import { SubscriptionPlan, UsageMetricType } from "../../common/enums";
import { PlanService } from "./plan.service";

export interface QuotaCheck {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  percentUsed: number;
  message?: string;
  resetDate?: string; // ISO date string for when quota resets (nextBillingDate)
  // Bonus credits info
  bonusCredits?: {
    available: number;
    used: number;
    nextExpiration?: Date;
  };
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

    @InjectRepository(MessageCredit)
    private readonly messageCreditRepository: Repository<MessageCredit>,

    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,

    private readonly planService: PlanService,
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
   * Counts AI responses (ASSISTANT role) from AgentMessage table
   * Only AI-generated messages count towards the quota limit
   * Bonus credits are consumed FIRST, then subscription quota is used
   */
  async checkWhatsAppMessageQuota(organizationId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveSubscription(organizationId);
    const planLimit = subscription.limits.maxRequestsPerMonth; // Using requests limit for messages

    // Get bonus credits info from database (includes both active and exhausted credits)
    const bonusCreditsInfo = await this.getBonusCreditsInfo(organizationId);

    // Get actual message count for this billing period
    const totalMessagesUsed = await this.getActualWhatsAppMessageCount(organizationId);

    // Bonus credits used comes from the database (actual consumed credits)
    // This includes credits from exhausted packs
    const bonusCreditsUsed = bonusCreditsInfo.used;

    // Bonus credits available is what's remaining in active credit packs
    const bonusCreditsAvailable = bonusCreditsInfo.available;

    // Total bonus capacity = available + already used
    const totalBonusCapacity = bonusCreditsAvailable + bonusCreditsUsed;

    // Messages from subscription = total messages - bonus credits used
    // (Bonus credits are consumed FIRST, so subscription is only used for messages beyond bonus)
    const messagesFromSubscription = Math.max(0, totalMessagesUsed - totalBonusCapacity);

    this.logger.log(`[QUOTA] Org ${organizationId}: ${totalMessagesUsed} total messages, ${bonusCreditsAvailable} bonus available, ${bonusCreditsUsed} bonus used, ${messagesFromSubscription} from subscription`);

    // Build quota check based on subscription usage only
    const quotaCheck = this.buildQuotaCheck(messagesFromSubscription, planLimit, "monthly WhatsApp messages");

    // Add reset date from subscription's nextBillingDate
    if (subscription.nextBillingDate) {
      quotaCheck.resetDate = subscription.nextBillingDate.toISOString();
    } else if (subscription.endsAt) {
      quotaCheck.resetDate = subscription.endsAt.toISOString();
    }

    // Add bonus credits info
    quotaCheck.bonusCredits = {
      available: bonusCreditsAvailable,
      used: bonusCreditsUsed,
      nextExpiration: bonusCreditsInfo.nextExpiration,
    };

    // Recalculate allowed status considering bonus credits
    // User can send messages if: bonusCreditsAvailable > 0 OR messagesFromSubscription < planLimit
    quotaCheck.allowed = bonusCreditsAvailable > 0 || messagesFromSubscription < planLimit;

    // Update remaining to include remaining bonus
    quotaCheck.remaining = bonusCreditsAvailable + Math.max(0, planLimit - messagesFromSubscription);

    return quotaCheck;
  }

  /**
   * Get bonus credits information for an organization
   */
  private async getBonusCreditsInfo(organizationId: string): Promise<{
    available: number;
    used: number;
    nextExpiration?: Date;
  }> {
    const now = new Date();

    // Get all active (non-expired) credits
    const activeCredits = await this.messageCreditRepository.find({
      where: {
        organizationId,
        status: MessageCreditStatus.ACTIVE,
        expiresAt: MoreThan(now),
      },
      order: {
        expiresAt: 'ASC', // Oldest first for next expiration
      },
    });

    const available = activeCredits.reduce((sum, c) => sum + c.remaining, 0);
    const used = activeCredits.reduce((sum, c) => sum + c.used, 0);

    // Also count used credits from exhausted packs in current period
    const exhaustedCredits = await this.messageCreditRepository.find({
      where: {
        organizationId,
        status: MessageCreditStatus.EXHAUSTED,
      },
    });
    const exhaustedUsed = exhaustedCredits.reduce((sum, c) => sum + c.used, 0);

    const nextExpiring = activeCredits.find(c => c.remaining > 0);

    return {
      available,
      used: used + exhaustedUsed,
      nextExpiration: nextExpiring?.expiresAt,
    };
  }

  /**
   * Consume bonus credits for a message
   * Call this when processing a message to deduct from bonus credits first
   * Returns true if message was covered by bonus credits
   */
  async consumeBonusCredit(organizationId: string): Promise<boolean> {
    const now = new Date();

    // Find the oldest active credit with remaining balance (FIFO)
    const credit = await this.messageCreditRepository.findOne({
      where: {
        organizationId,
        status: MessageCreditStatus.ACTIVE,
        expiresAt: MoreThan(now),
      },
      order: {
        expiresAt: 'ASC',
      },
    });

    if (!credit || credit.remaining <= 0) {
      return false; // No bonus credits available
    }

    // Consume one credit
    credit.remaining -= 1;
    credit.used += 1;

    // Mark as exhausted if no more remaining
    if (credit.remaining <= 0) {
      credit.status = MessageCreditStatus.EXHAUSTED;
    }

    await this.messageCreditRepository.save(credit);
    this.logger.debug(`Consumed 1 bonus credit for org ${organizationId}, ${credit.remaining} remaining in pack ${credit.id}`);

    return true;
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
   * Get actual WhatsApp AI response count for organization from AgentMessage table
   * Counts only ASSISTANT messages (AI responses) - these are what count towards quota
   * Messages from conversations linked to sessions OR agents of this organization
   * Uses billing cycle based on subscription's nextBillingDate
   */
  private async getActualWhatsAppMessageCount(organizationId: string): Promise<number> {
    // Get subscription to determine billing period
    const subscription = await this.getActiveSubscription(organizationId);
    const { start: periodStart, end: periodEnd } = this.getBillingPeriod(subscription);

    this.logger.debug(`[QUOTA DEBUG] Org ${organizationId}: Billing period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Get all sessions for this organization (don't use select to ensure relations load)
    const sessions = await this.sessionRepository.find({
      where: { organizationId },
      relations: ['agent'],
    });
    const sessionIds = sessions.map(s => s.id);
    const agentIdsFromSessions = sessions
      .filter(s => s.agent?.id)
      .map(s => s.agent.id);

    this.logger.log(`[QUOTA] Org ${organizationId}: Found ${sessions.length} sessions`);

    // Also get agents directly assigned to this organization
    const orgAgents = await this.aiAgentRepository.find({
      where: { organizationId },
    });
    const orgAgentIds = orgAgents.map(a => a.id);

    this.logger.log(`[QUOTA] Org ${organizationId}: Found ${orgAgents.length} agents directly in org: ${JSON.stringify(orgAgentIds)}`);

    // Combine all agent IDs
    const allAgentIds = [...new Set([...agentIdsFromSessions, ...orgAgentIds])];

    this.logger.log(`[QUOTA] Org ${organizationId}: Combined ${allAgentIds.length} unique agent IDs: ${JSON.stringify(allAgentIds)}`);

    if (sessionIds.length === 0 && allAgentIds.length === 0) {
      this.logger.warn(`[QUOTA DEBUG] No sessions or agents found for org ${organizationId}`);
      return 0;
    }

    // Build query to find conversations by sessionId OR agentId
    // Also check context->>'sessionId' for backward compatibility with old conversations
    const conversationQuery = this.conversationRepository
      .createQueryBuilder('conv')
      .select(['conv.id']);

    const conditions: string[] = [];
    const params: any = {};

    if (sessionIds.length > 0) {
      // Check both the sessionId column AND the context->>'sessionId' JSON field
      conditions.push('conv.sessionId IN (:...sessionIds)');
      conditions.push("conv.context->>'sessionId' IN (:...contextSessionIds)");
      params.sessionIds = sessionIds;
      params.contextSessionIds = sessionIds;
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

    this.logger.log(`[QUOTA] Org ${organizationId}: Found ${conversations.length} conversations (checking sessionId column and context.sessionId)`);

    if (conversationIds.length === 0) {
      this.logger.warn(`[QUOTA] Org ${organizationId}: No conversations found, returning 0`);
      return 0;
    }

    // Count AI responses (ASSISTANT) for quota - only AI-generated messages count towards the limit
    const aiMessageCount = await this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId IN (:...conversationIds)', { conversationIds })
      .andWhere('msg.role = :role', { role: MessageRole.AGENT })
      .andWhere('msg.createdAt >= :periodStart', { periodStart })
      .getCount();

    this.logger.log(`[QUOTA] Org ${organizationId}: AI responses count = ${aiMessageCount} (period starts: ${periodStart.toISOString()})`);

    return aiMessageCount;
  }

  /**
   * Get actual WhatsApp AI response count for user from AgentMessage table
   * Counts only ASSISTANT messages (AI responses) - these are what count towards quota
   * Messages from conversations linked to user's sessions OR agents
   * Uses billing cycle based on subscription's nextBillingDate
   */
  private async getUserActualWhatsAppMessageCount(userId: string): Promise<number> {
    // Get subscription to determine billing period
    const subscription = await this.getActiveUserSubscription(userId);
    const { start: periodStart } = this.getBillingPeriod(subscription);

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

    // Also get agents created by this user that DON'T belong to an organization
    // This prevents double-counting: org agents are counted in org subscription, not user subscription
    const userAgents = await this.aiAgentRepository.find({
      where: { createdBy: userId, organizationId: IsNull() },
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

    // Count AI responses (ASSISTANT) for quota - only AI-generated messages count towards the limit
    const count = await this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.conversationId IN (:...conversationIds)', { conversationIds })
      .andWhere('msg.role = :role', { role: MessageRole.AGENT })
      .andWhere('msg.createdAt >= :periodStart', { periodStart })
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
    feature: string,
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
      // Create default free subscription using database plans
      const freeSubscription = this.subscriptionRepository.create({
        organizationId,
        plan: SubscriptionPlan.FREE,
        limits: this.planService.getPlanLimits('free'),
        features: this.planService.getPlanFeatures('free'),
        startsAt: new Date(),
      });

      return this.subscriptionRepository.save(freeSubscription);
    }

    // Always sync limits and features with the latest database values
    // This ensures upgrades and plan updates in database are always reflected
    const planCode = activeSubscription.plan.toLowerCase();
    const currentLimits = this.planService.getPlanLimits(planCode);
    const currentFeatures = this.planService.getPlanFeatures(planCode);

    // Check if limits/features need updating
    const limitsNeedUpdate = JSON.stringify(activeSubscription.limits) !== JSON.stringify(currentLimits);
    const featuresNeedUpdate = JSON.stringify(activeSubscription.features) !== JSON.stringify(currentFeatures);

    if (limitsNeedUpdate || featuresNeedUpdate) {
      this.logger.log(`Syncing subscription limits/features for plan ${activeSubscription.plan} from database`);
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
      const planCode = plan.toLowerCase();
      console.log(`[QUOTA] Creating subscription for ${email} with plan ${plan}`);

      // Create subscription for user using database plans
      activeSubscription = this.subscriptionRepository.create({
        userId,
        organizationId: null,
        plan,
        limits: this.planService.getPlanLimits(planCode),
        features: this.planService.getPlanFeatures(planCode),
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
        const desiredCode = desired.toLowerCase();
        console.log(
          `[QUOTA] Adjusting existing plan for ${email} from ${activeSubscription.plan} to ${desired}`,
        );
        activeSubscription.plan = desired;
        activeSubscription.limits = this.planService.getPlanLimits(desiredCode);
        activeSubscription.features = this.planService.getPlanFeatures(desiredCode);
        await this.subscriptionRepository.save(activeSubscription);
      } else {
        // Always sync limits and features with the latest database values
        // This ensures upgrades and plan updates in database are always reflected
        const planCode = activeSubscription.plan.toLowerCase();
        const currentLimits = this.planService.getPlanLimits(planCode);
        const currentFeatures = this.planService.getPlanFeatures(planCode);

        const limitsNeedUpdate = JSON.stringify(activeSubscription.limits) !== JSON.stringify(currentLimits);
        const featuresNeedUpdate = JSON.stringify(activeSubscription.features) !== JSON.stringify(currentFeatures);

        if (limitsNeedUpdate || featuresNeedUpdate) {
          this.logger.log(`Syncing user subscription limits/features for plan ${activeSubscription.plan} from database`);
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

  /**
   * Get the current billing period based on nextBillingDate
   * Returns { start, end } dates for the current billing cycle
   * Uses monthly intervals (not 30 days) for accurate billing period calculation
   *
   * IMPORTANT: If the user paid their renewal invoice early (before the current period ends),
   * nextBillingDate will be advanced but we should still count messages from the previous period
   * if we haven't reached the period start date yet.
   */
  private getBillingPeriod(subscription: Subscription): { start: Date; end: Date } {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

    // Use nextBillingDate if available, otherwise fall back to calculation
    if (subscription.nextBillingDate) {
      let periodEnd = new Date(subscription.nextBillingDate);
      periodEnd.setHours(23, 59, 59, 999);

      // Period start is 1 MONTH before nextBillingDate (not 30 days)
      // This handles varying month lengths correctly
      let periodStart = new Date(periodEnd);
      periodStart.setMonth(periodStart.getMonth() - 1);
      periodStart.setHours(0, 0, 0, 0);

      // If today is BEFORE the calculated period start, it means the user paid early
      // We need to use the PREVIOUS period instead
      if (now < periodStart) {
        this.logger.debug(`[BILLING PERIOD] Today (${now.toISOString()}) is before calculated periodStart (${periodStart.toISOString()}), using previous period`);
        // Go back one more month
        periodEnd = new Date(periodStart);
        periodEnd.setHours(23, 59, 59, 999);
        periodStart = new Date(periodEnd);
        periodStart.setMonth(periodStart.getMonth() - 1);
        periodStart.setHours(0, 0, 0, 0);
      }

      this.logger.debug(`[BILLING PERIOD] nextBillingDate=${subscription.nextBillingDate.toISOString()}, periodStart=${periodStart.toISOString()}, periodEnd=${periodEnd.toISOString()}`);

      return { start: periodStart, end: periodEnd };
    }

    // Fallback: calculate based on subscription start date using monthly intervals
    const subscriptionStart = new Date(subscription.startsAt);

    // Calculate how many complete months since subscription start
    let monthsDiff = (now.getFullYear() - subscriptionStart.getFullYear()) * 12 +
                     (now.getMonth() - subscriptionStart.getMonth());

    // If we haven't passed the billing day this month, we're still in the previous period
    if (now.getDate() < subscriptionStart.getDate()) {
      monthsDiff--;
    }

    const periodStart = new Date(subscriptionStart);
    periodStart.setMonth(periodStart.getMonth() + monthsDiff);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setHours(23, 59, 59, 999);

    this.logger.debug(`[BILLING PERIOD FALLBACK] start=${periodStart.toISOString()}, end=${periodEnd.toISOString()}`);

    return { start: periodStart, end: periodEnd };
  }

  /**
   * Check if subscription payment is due (within 7 days of next billing date)
   */
  isPaymentDue(subscription: Subscription): boolean {
    if (!subscription.nextBillingDate) return false;
    const now = new Date();
    const daysUntilDue = Math.ceil(
      (subscription.nextBillingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDue <= 7 && daysUntilDue >= 0;
  }

  /**
   * Check if subscription is expired (past billing date without payment)
   */
  isSubscriptionExpired(subscription: Subscription): boolean {
    if (!subscription.nextBillingDate) return false;
    return new Date() > subscription.nextBillingDate;
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
    // Get all plan features from database
    const allPlanFeatures = this.planService.getAllPlanFeatures();

    // Define plan order from lowest to highest
    const planOrder: SubscriptionPlan[] = [
      SubscriptionPlan.FREE,
      SubscriptionPlan.STANDARD,
      SubscriptionPlan.PRO,
      SubscriptionPlan.ENTERPRISE,
    ];

    // Find the lowest plan that has this feature
    for (const plan of planOrder) {
      const planCode = plan.toLowerCase();
      const features = allPlanFeatures[planCode];
      if (features && features[feature as keyof typeof features]) {
        return plan;
      }
    }

    return SubscriptionPlan.ENTERPRISE;
  }
}
