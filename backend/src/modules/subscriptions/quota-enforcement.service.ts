import { Injectable, ForbiddenException, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan, Not, In } from "typeorm";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
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
import { SubscriptionPlan, SubscriptionStatus, UsageMetricType } from "../../common/enums";
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

  // Cache TTL constants (in milliseconds)
  private readonly SUBSCRIPTION_CACHE_TTL = 30000; // 30 seconds
  private readonly QUOTA_CACHE_TTL = 10000; // 10 seconds for quota checks

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

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
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
    // Check cache first for quota result
    const cacheKey = `quota:whatsapp:org:${organizationId}`;
    const cached = await this.cacheManager.get<QuotaCheck>(cacheKey);
    if (cached) {
      return cached;
    }

    const subscription = await this.getActiveSubscription(organizationId);
    const planLimit = subscription.limits.maxRequestsPerMonth; // Using requests limit for messages
    const { start: periodStart, end: periodEnd } = this.getBillingPeriod(subscription);

    // Get bonus credits info from database (includes both active and exhausted credits)
    const bonusCreditsInfo = await this.getBonusCreditsInfo(organizationId, periodStart);

    // Get actual message count for this billing period
    const totalMessagesUsed = await this.getActualWhatsAppMessageCount(organizationId);

    // Bonus credits used comes from the database (actual consumed credits)
    // This includes credits from exhausted packs
    const bonusCreditsUsed = bonusCreditsInfo.used;

    // Bonus credits available is what's remaining in active credit packs
    const bonusCreditsAvailable = bonusCreditsInfo.available;

    // Messages from subscription = total messages - bonus credits actually used
    // Only subtract credits that were actually consumed, NOT available/unused credits
    const messagesFromSubscription = Math.max(0, totalMessagesUsed - bonusCreditsUsed);

    this.logger.debug(`Org ${organizationId}: ${messagesFromSubscription}/${planLimit} messages (${bonusCreditsAvailable} bonus available, period: ${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)})`);

    // Build quota check based on subscription usage only
    const quotaCheck = this.buildQuotaCheck(messagesFromSubscription, planLimit, "monthly WhatsApp messages");

    // Use the computed billing period end as reset date (always in the future)
    quotaCheck.resetDate = periodEnd.toISOString();

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

    // Cache the result
    await this.cacheManager.set(cacheKey, quotaCheck, this.QUOTA_CACHE_TTL);

    return quotaCheck;
  }

  /**
   * Get bonus credits information for an organization
   */
  private async getBonusCreditsInfo(organizationId: string, periodStart?: Date): Promise<{
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

    // Also count used credits from exhausted packs that were created during the current billing period
    // Packs created before the current period should not be counted (they belong to a previous cycle)
    let exhaustedUsed = 0;
    if (periodStart) {
      const exhaustedCredits = await this.messageCreditRepository.find({
        where: {
          organizationId,
          status: MessageCreditStatus.EXHAUSTED,
          createdAt: MoreThan(periodStart),
        },
      });
      exhaustedUsed = exhaustedCredits.reduce((sum, c) => sum + c.used, 0);
    }

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

    // Use atomic UPDATE with WHERE remaining > 0 to prevent race conditions
    // This is safer than read-then-write even with pessimistic lock
    return this.messageCreditRepository.manager.transaction(async (em) => {
      // Find the oldest active credit pack (FIFO)
      const credit = await em.findOne(
        this.messageCreditRepository.target,
        {
          where: {
            organizationId,
            status: MessageCreditStatus.ACTIVE,
            expiresAt: MoreThan(now),
          },
          order: { expiresAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        },
      );

      if (!credit || credit.remaining <= 0) {
        return false;
      }

      // Atomic update: decrement remaining and increment used in a single query
      const result = await em
        .createQueryBuilder()
        .update(this.messageCreditRepository.target)
        .set({
          remaining: () => '"remaining" - 1',
          used: () => '"used" + 1',
          status: () => `CASE WHEN "remaining" - 1 <= 0 THEN 'exhausted' ELSE "status" END`,
        })
        .where('id = :id AND remaining > 0', { id: credit.id })
        .execute();

      if (result.affected === 0) {
        // Another concurrent request consumed the last credit
        return false;
      }

      this.logger.debug(`Consumed 1 bonus credit for org ${organizationId}, pack ${credit.id}`);

      // Invalidate quota cache so next check reflects the consumed credit
      await this.cacheManager.del(`quota:whatsapp:org:${organizationId}`);

      return true;
    });
  }

  /**
   * Check WhatsApp message quota for a user (without organization)
   */
  async checkUserWhatsAppMessageQuota(userId: string): Promise<QuotaCheck> {
    const subscription = await this.getActiveUserSubscription(userId);
    const limit = subscription.limits.maxRequestsPerMonth;
    const { end: periodEnd } = this.getBillingPeriod(subscription);

    const current = await this.getUserActualWhatsAppMessageCount(userId);

    const quotaCheck = this.buildQuotaCheck(current, limit, "monthly WhatsApp messages");

    // Use computed billing period end as reset date (always in the future)
    quotaCheck.resetDate = periodEnd.toISOString();

    return quotaCheck;
  }

  /**
   * Get actual WhatsApp AI response count for organization from AgentMessage table
   * Counts only ASSISTANT messages (AI responses) - these are what count towards quota
   * Messages from conversations linked to sessions OR agents of this organization
   * Uses billing cycle based on subscription's nextBillingDate
   */
  private async getActualWhatsAppMessageCount(organizationId: string): Promise<number> {
    const subscription = await this.getActiveSubscription(organizationId);
    const { start: periodStart } = this.getBillingPeriod(subscription);

    // Use a single efficient SQL query with subqueries to count AI messages
    // This avoids loading thousands of conversation IDs into memory
    const result = await this.messageRepository
      .createQueryBuilder('msg')
      .innerJoin('msg.conversation', 'conv')
      .where('msg.role = :role', { role: MessageRole.AGENT })
      .andWhere('msg.createdAt >= :periodStart', { periodStart })
      .andWhere(
        `(
          conv."sessionId" IN (SELECT id::text FROM whatsapp_sessions WHERE "organizationId" = :orgId)
          OR conv."agentId" IN (SELECT id FROM ai_agents WHERE "organizationId" = :orgId)
          OR conv.context->>'sessionId' IN (SELECT id::text FROM whatsapp_sessions WHERE "organizationId" = :orgId)
        )`,
        { orgId: organizationId },
      )
      .getCount();

    return result;
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

    // Use a single efficient SQL query with subqueries (same approach as org-based method)
    // This avoids loading thousands of conversation/session IDs into memory
    const result = await this.messageRepository
      .createQueryBuilder('msg')
      .innerJoin('msg.conversation', 'conv')
      .where('msg.role = :role', { role: MessageRole.AGENT })
      .andWhere('msg.createdAt >= :periodStart', { periodStart })
      .andWhere(
        `(
          conv."sessionId" IN (SELECT id::text FROM whatsapp_sessions WHERE "userId" = :userId AND "organizationId" IS NULL)
          OR conv."agentId" IN (SELECT id FROM ai_agents WHERE "createdBy" = :userId AND "organizationId" IS NULL)
        )`,
        { userId },
      )
      .getCount();

    return result;
  }

  /**
   * Atomically reserve a WhatsApp message quota slot using Redis INCR.
   * Prevents TOCTOU race conditions where two concurrent messages both pass the check.
   * Falls back to non-atomic check if Redis is unavailable.
   */
  async reserveMessageSlot(organizationId: string): Promise<QuotaCheck> {
    const check = await this.checkWhatsAppMessageQuota(organizationId);
    if (!check.allowed) return check;

    const reserveKey = `quota:reserve:org:${organizationId}`;
    try {
      const store = (this.cacheManager as any).store;
      const redisClient = store?.client;

      if (redisClient) {
        // Atomically increment the reservation counter
        const reserved = await redisClient.incr(reserveKey);
        // Set TTL on first reservation (matches quota cache TTL)
        if (reserved === 1) {
          await redisClient.expire(reserveKey, Math.ceil(this.QUOTA_CACHE_TTL / 1000));
        }
        // Deny if reserved slots exceed remaining quota
        if (reserved > check.remaining) {
          await redisClient.decr(reserveKey);
          check.allowed = false;
          check.message = `Message limit exceeded. You have used ${check.current} of ${check.limit} monthly messages. Please upgrade your plan.`;
          return check;
        }
      }
    } catch (error) {
      this.logger.warn(`Redis reservation failed, using non-atomic check: ${error.message}`);
    }

    return check;
  }

  /**
   * Enforce WhatsApp message quota with atomic reservation
   */
  async enforceWhatsAppMessageQuota(organizationId: string): Promise<void> {
    const check = await this.reserveMessageSlot(organizationId);
    if (!check.allowed) {
      throw new ForbiddenException(
        check.message || `Message limit exceeded. You have used ${check.current} of ${check.limit} monthly messages. Please upgrade your plan.`
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
    const check = await this.checkFeatureAccess(organizationId, feature);
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
      stripeCheckoutPending: subscription.metadata?.stripeCheckoutPending ?? false,
      stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
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
    const subscription = await this.getActiveUserSubscription(userId);

    // For individual users, we check WhatsApp agents and messages
    const [agentCheck, whatsappMessageCheck] = await Promise.all([
      this.checkUserAgentQuota(userId),
      this.checkUserWhatsAppMessageQuota(userId),
    ]);

    // Individual users don't have knowledge bases, storage, etc. for now
    const basicQuota = {
      allowed: true,
      limit: 0,
      current: 0,
      remaining: 0,
      percentUsed: 0,
    };

    return {
      plan: subscription.plan,
      status: subscription.status,
      stripeCheckoutPending: subscription.metadata?.stripeCheckoutPending ?? false,
      stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
      usage: {
        agents: agentCheck,
        knowledgeBases: basicQuota,
        storage: basicQuota,
        knowledgeCharacters: basicQuota,
        monthlyRequests: whatsappMessageCheck,
        monthlyTokens: basicQuota,
        monthlyVectorSearches: basicQuota,
        monthlyConversations: basicQuota,
        whatsappMessages: whatsappMessageCheck,
      },
      features: subscription.features,
    };
  }

  private async getActiveSubscription(
    organizationId: string,
  ): Promise<Subscription> {
    // Check cache first
    const cacheKey = `subscription:org:${organizationId}`;
    const cached = await this.cacheManager.get<Subscription>(cacheKey);
    if (cached) {
      return cached;
    }

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

    // Check status directly instead of using getter (getters don't survive cache serialization)
    const PLAN_TIER: Record<string, number> = { free: 0, standard: 1, pro: 2, enterprise: 3 };

    let activeSubscription = organization.subscriptions?.find(
      (sub) => sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIALING || sub.status === SubscriptionStatus.PAST_DUE,
    );

    // Duplicate detection: if the active/trialing subscription is a lower tier than
    // an expired one, it was auto-created by a previous bug. Clean it up.
    if (activeSubscription) {
      const expiredHigherPlan = organization.subscriptions?.find(
        (sub) =>
          sub.id !== activeSubscription.id &&
          (sub.status === SubscriptionStatus.INACTIVE || sub.status === SubscriptionStatus.CANCELLED || sub.status === SubscriptionStatus.PAST_DUE) &&
          (PLAN_TIER[sub.plan] ?? 0) > (PLAN_TIER[activeSubscription.plan] ?? 0),
      );

      if (expiredHigherPlan) {
        this.logger.warn(
          `Duplicate subscription detected: deactivating ${activeSubscription.plan} trial (${activeSubscription.id}), ` +
          `real subscription is ${expiredHigherPlan.plan} (${expiredHigherPlan.id})`,
        );
        activeSubscription.status = SubscriptionStatus.INACTIVE;
        activeSubscription.metadata = {
          ...activeSubscription.metadata,
          deactivatedAt: new Date().toISOString(),
          reason: 'duplicate_auto_cleanup',
        };
        await this.subscriptionRepository.save(activeSubscription);
        activeSubscription = undefined; // Fall through to expired handling
      }
    }

    if (!activeSubscription) {
      // Check if there's an existing expired/cancelled subscription
      const existingSubscription = organization.subscriptions?.sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
      )[0];

      if (existingSubscription) {
        // Return the expired subscription as-is (keeps original plan name for display)
        // but override limits/features in-memory to block all usage (NOT persisted to DB)
        this.logger.log(
          `Returning expired subscription ${existingSubscription.id} ` +
          `(${existingSubscription.plan}/${existingSubscription.status}) with blocked limits`,
        );
        existingSubscription.limits = {
          maxAgents: 0,
          maxRequestsPerMonth: 0,
          maxStorageBytes: 0,
          maxKnowledgeChars: 0,
          maxKnowledgeBases: 0,
          maxLLMTokensPerMonth: 0,
          maxVectorSearches: 0,
          maxConversationsPerMonth: 0,
          maxDocumentsPerKB: 0,
          maxFileUploadSize: 0,
        };
        existingSubscription.features = {
          customBranding: false,
          prioritySupport: false,
          analytics: false,
          apiAccess: false,
          whiteLabel: false,
          advancedLLMs: false,
          premiumVectorSearch: false,
          functionCalling: false,
          imageAnalysis: false,
          customEmbeddings: false,
          webhooks: false,
          scheduling: false,
          sso: false,
        };
        // Cache the blocked version (not persisted to DB)
        await this.cacheManager.set(cacheKey, existingSubscription, this.SUBSCRIPTION_CACHE_TTL);
        return existingSubscription;
      }

      // Only create STANDARD trial for brand-new organizations with no subscription history
      this.logger.debug(
        "No subscription found at all, creating standard trial subscription",
      );
      const trialDays = this.planService.getTrialDays('standard');
      const now = new Date();
      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + (trialDays || 7));

      try {
        const trialSubscription = this.subscriptionRepository.create({
          organizationId,
          plan: SubscriptionPlan.STANDARD,
          status: SubscriptionStatus.TRIALING,
          limits: this.planService.getPlanLimits('standard'),
          features: this.planService.getPlanFeatures('standard'),
          startsAt: now,
          trialEndsAt,
        });

        const saved = await this.subscriptionRepository.save(trialSubscription);
        await this.cacheManager.set(cacheKey, saved, this.SUBSCRIPTION_CACHE_TTL);
        return saved;
      } catch (error) {
        // Handle unique constraint violation (concurrent trial creation race condition)
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          this.logger.warn(`Duplicate trial creation race for org ${organizationId}, re-fetching`);
          const existing = await this.subscriptionRepository.findOne({
            where: {
              organizationId,
              status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
            },
          });
          if (existing) {
            await this.cacheManager.set(cacheKey, existing, this.SUBSCRIPTION_CACHE_TTL);
            return existing;
          }
        }
        throw error;
      }
    }

    // Always sync limits and features with the latest database values
    // This ensures upgrades and plan updates in database are always reflected
    const planCode = activeSubscription.plan.toLowerCase();
    const currentLimits = this.planService.getPlanLimits(planCode);
    const currentFeatures = this.planService.getPlanFeatures(planCode);

    // Check if limits/features need updating (use sorted keys to avoid false positives from key ordering)
    const sortedStringify = (obj: any) => JSON.stringify(obj, Object.keys(obj || {}).sort());
    const limitsNeedUpdate = sortedStringify(activeSubscription.limits) !== sortedStringify(currentLimits);
    const featuresNeedUpdate = sortedStringify(activeSubscription.features) !== sortedStringify(currentFeatures);

    if (limitsNeedUpdate || featuresNeedUpdate) {
      this.logger.log(`Syncing subscription limits/features for plan ${activeSubscription.plan} from database`);
      activeSubscription.limits = currentLimits;
      activeSubscription.features = currentFeatures;
      await this.subscriptionRepository.save(activeSubscription);
    }

    // Cache the result
    await this.cacheManager.set(cacheKey, activeSubscription, this.SUBSCRIPTION_CACHE_TTL);

    this.logger.debug(
      `Returning active subscription: ${activeSubscription.plan}`,
    );
    return activeSubscription;
  }

  private async getActiveUserSubscription(
    userId: string,
  ): Promise<Subscription> {
    // Check cache first
    const cacheKey = `subscription:user:${userId}`;
    const cached = await this.cacheManager.get<Subscription>(cacheKey);
    if (cached) {
      return cached;
    }

    // First, check if user already has an organization subscription
    // Users should have only ONE subscription (either individual OR via organization)
    const orgSubscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        organizationId: Not(IsNull()),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    if (orgSubscription) {
      await this.cacheManager.set(cacheKey, orgSubscription, this.SUBSCRIPTION_CACHE_TTL);
      return orgSubscription;
    }

    // Find active subscription for this user (not associated with organization)
    let activeSubscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        organizationId: IsNull(),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    // Duplicate detection: if active/trialing is lower tier than an expired one, clean it up
    if (activeSubscription) {
      const PLAN_TIER: Record<string, number> = { free: 0, standard: 1, pro: 2, enterprise: 3 };
      const expiredHigherPlan = await this.subscriptionRepository.findOne({
        where: {
          userId,
          organizationId: IsNull(),
          status: In([SubscriptionStatus.INACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.PAST_DUE]),
        },
        order: { updatedAt: 'DESC' },
      });

      if (
        expiredHigherPlan &&
        expiredHigherPlan.id !== activeSubscription.id &&
        (PLAN_TIER[expiredHigherPlan.plan] ?? 0) > (PLAN_TIER[activeSubscription.plan] ?? 0)
      ) {
        this.logger.warn(
          `Duplicate user subscription detected: deactivating ${activeSubscription.plan} trial (${activeSubscription.id}), ` +
          `real subscription is ${expiredHigherPlan.plan} (${expiredHigherPlan.id})`,
        );
        activeSubscription.status = SubscriptionStatus.INACTIVE;
        activeSubscription.metadata = {
          ...activeSubscription.metadata,
          deactivatedAt: new Date().toISOString(),
          reason: 'duplicate_auto_cleanup',
        };
        await this.subscriptionRepository.save(activeSubscription);
        activeSubscription = null; // Fall through to expired handling
      }
    }

    if (!activeSubscription) {
      // Check for existing expired/cancelled subscription
      const existingSubscription = await this.subscriptionRepository.findOne({
        where: {
          userId,
          organizationId: IsNull(),
        },
        order: { updatedAt: 'DESC' },
      });

      if (existingSubscription) {
        // Return expired subscription as-is (keeps original plan name for display)
        // but override limits/features in-memory to block all usage (NOT persisted to DB)
        this.logger.log(
          `Returning expired user subscription ${existingSubscription.id} ` +
          `(${existingSubscription.plan}/${existingSubscription.status}) with blocked limits`,
        );
        existingSubscription.limits = {
          maxAgents: 0,
          maxRequestsPerMonth: 0,
          maxStorageBytes: 0,
          maxKnowledgeChars: 0,
          maxKnowledgeBases: 0,
          maxLLMTokensPerMonth: 0,
          maxVectorSearches: 0,
          maxConversationsPerMonth: 0,
          maxDocumentsPerKB: 0,
          maxFileUploadSize: 0,
        };
        existingSubscription.features = {
          customBranding: false,
          prioritySupport: false,
          analytics: false,
          apiAccess: false,
          whiteLabel: false,
          advancedLLMs: false,
          premiumVectorSearch: false,
          functionCalling: false,
          imageAnalysis: false,
          customEmbeddings: false,
          webhooks: false,
          scheduling: false,
          sso: false,
        };
        activeSubscription = existingSubscription;
        // Cache the blocked version (not persisted to DB)
        await this.cacheManager.set(cacheKey, activeSubscription, this.SUBSCRIPTION_CACHE_TTL);
        return activeSubscription;
      } else {
        // Brand-new user with no subscription at all
        const plan: SubscriptionPlan = SubscriptionPlan.STANDARD;
        const planCode = plan.toLowerCase();
        const trialDays = this.planService.getTrialDays(planCode);
        const now = new Date();
        const trialEndsAt = new Date(now);
        trialEndsAt.setDate(trialEndsAt.getDate() + (trialDays || 7));

        activeSubscription = this.subscriptionRepository.create({
          userId,
          organizationId: null,
          plan,
          status: SubscriptionStatus.TRIALING,
          limits: this.planService.getPlanLimits(planCode),
          features: this.planService.getPlanFeatures(planCode),
          startsAt: now,
          trialEndsAt,
        });

        activeSubscription = await this.subscriptionRepository.save(activeSubscription);
        this.logger.log(`Created trial subscription for user ${userId} with plan ${plan}`);
      }
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

    // Cache the result
    await this.cacheManager.set(cacheKey, activeSubscription, this.SUBSCRIPTION_CACHE_TTL);

    return activeSubscription;
  }

  private buildQuotaCheck(
    current: number,
    limit: number,
    resource: string,
    unit: string = "items",
  ): QuotaCheck {
    // Negative limit means unlimited (e.g., Enterprise plan uses -1)
    if (limit < 0) {
      return { allowed: true, limit, current, remaining: Number.MAX_SAFE_INTEGER, percentUsed: 0, message: undefined };
    }

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
   * Get the current billing period based on nextBillingDate.
   * If nextBillingDate is in the past, advances it forward month-by-month
   * until it's in the future, then derives period start as (periodEnd - 1 month).
   * Clamps period start to not be before startsAt for new subscriptions.
   */
  private getBillingPeriod(subscription: Subscription): { start: Date; end: Date } {
    const now = new Date();

    if (subscription.nextBillingDate) {
      const periodEnd = new Date(subscription.nextBillingDate);

      // Advance stale nextBillingDate forward until it's in the future
      while (periodEnd < now) {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      periodEnd.setHours(23, 59, 59, 999);

      // Period start = periodEnd - 1 month
      const periodStart = new Date(periodEnd);
      periodStart.setMonth(periodStart.getMonth() - 1);
      periodStart.setHours(0, 0, 0, 0);

      // Clamp: period start should not be before subscription.startsAt
      if (subscription.startsAt) {
        const startsAt = new Date(subscription.startsAt);
        startsAt.setHours(0, 0, 0, 0);
        if (periodStart < startsAt) {
          periodStart.setTime(startsAt.getTime());
        }
      }

      return { start: periodStart, end: periodEnd };
    }

    // Fallback: use startsAt with 1 month periods, advance if stale
    if (subscription.startsAt) {
      const periodStart = new Date(subscription.startsAt);
      periodStart.setHours(0, 0, 0, 0);

      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      while (periodEnd < now) {
        periodStart.setMonth(periodStart.getMonth() + 1);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      periodEnd.setHours(23, 59, 59, 999);
      return { start: periodStart, end: periodEnd };
    }

    // Last resort: current calendar month
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start: periodStart, end: periodEnd };
  }

  /**
   * Check if subscription payment is due (within 7 days of next billing date)
   */
  isPaymentDue(subscription: Subscription): boolean {
    if (!subscription.nextBillingDate) return false;
    const now = new Date();
    // Handle both Date objects and strings (from cache serialization)
    const billingDate = new Date(subscription.nextBillingDate);
    const daysUntilDue = Math.ceil(
      (billingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDue <= 7 && daysUntilDue >= 0;
  }

  /**
   * Check if subscription is expired (past billing date without payment)
   */
  isSubscriptionExpired(subscription: Subscription): boolean {
    if (!subscription.nextBillingDate) return false;
    // Handle both Date objects and strings (from cache serialization)
    return new Date() > new Date(subscription.nextBillingDate);
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
    // Use billing period instead of calendar month for consistency with WhatsApp quota
    const subscription = await this.getActiveSubscription(organizationId);
    const { start: periodStart, end: periodEnd } = this.getBillingPeriod(subscription);

    const result = await this.usageMetricRepository
      .createQueryBuilder("metric")
      .select("COALESCE(SUM(metric.value), 0)", "total")
      .where("metric.organizationId = :organizationId", { organizationId })
      .andWhere("metric.type = :type", { type })
      .andWhere("metric.date >= :periodStart", { periodStart })
      .andWhere("metric.date <= :periodEnd", { periodEnd })
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

  /**
   * Clear all caches for an organization (use after payment or billing changes)
   */
  async clearOrganizationCaches(organizationId: string): Promise<void> {
    await this.cacheManager.del(`subscription:org:${organizationId}`);
    await this.cacheManager.del(`quota:whatsapp:org:${organizationId}`);
    this.logger.log(`Cleared all caches for organization ${organizationId}`);
  }

  /**
   * Clear all caches for a user (use after payment or billing changes)
   */
  async clearUserCaches(userId: string): Promise<void> {
    await this.cacheManager.del(`subscription:user:${userId}`);
    this.logger.log(`Cleared all caches for user ${userId}`);
  }

  /**
   * Force refresh quota data for an organization
   * This clears caches and returns fresh quota data
   */
  async refreshOrganizationQuotas(organizationId: string): Promise<any> {
    // Clear caches first
    await this.clearOrganizationCaches(organizationId);

    // Get fresh data
    return this.getUsageSummary(organizationId);
  }
}
