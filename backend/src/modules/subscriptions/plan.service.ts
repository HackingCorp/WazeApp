import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../common/entities';

// Cache refresh interval in milliseconds - plans are refreshed from DB every 60 seconds
const CACHE_REFRESH_INTERVAL = 60 * 1000;

// Default plan configurations (only used for initial seeding if plans don't exist)
const DEFAULT_PLANS = [
  {
    code: 'free',
    name: 'Free',
    description: 'Perfect for trying out our platform',
    priceMonthlyXAF: 0,
    priceAnnualXAF: 0,
    priceMonthlyUSD: 0,
    priceAnnualUSD: 0,
    maxAgents: 1,
    maxKnowledgeBases: 1,
    maxDocumentsPerKb: 10,
    maxStorageBytes: 104857600, // 100MB
    maxKnowledgeCharacters: 100000,
    maxWhatsAppMessages: 100,
    maxApiRequests: 1000,
    maxLlmTokens: 50000,
    maxVectorSearches: 100,
    maxConversations: 50,
    maxFileUploadBytes: 5242880, // 5MB
    maxBroadcastContacts: 50,
    maxMessageTemplates: 3,
    maxCampaignsPerMonth: 5,
    maxMessagesPerCampaign: 50,
    featureSso: false,
    featureWebhooks: false,
    featureAnalytics: false,
    featureApiAccess: false,
    featureWhiteLabel: false,
    featureAdvancedLlms: false,
    featureImageAnalysis: false,
    featureCustomBranding: false,
    featureFunctionCalling: false,
    featurePrioritySupport: false,
    featureCustomEmbeddings: false,
    featurePremiumVectorSearch: false,
    featureScheduledCampaigns: false,
    featureEscalation: false,
    featureEcommerce: false,
    trialDays: 0,
    displayOrder: 0,
  },
  {
    code: 'standard',
    name: 'Standard',
    description: 'Idéal pour les petites entreprises',
    priceMonthlyXAF: 19000,
    priceAnnualXAF: 190000,
    priceMonthlyUSD: 29,
    priceAnnualUSD: 290,
    maxAgents: 1,
    maxKnowledgeBases: 3,
    maxDocumentsPerKb: 50,
    maxStorageBytes: 524288000, // 500MB
    maxKnowledgeCharacters: 500000,
    maxWhatsAppMessages: 2000,
    maxApiRequests: 10000,
    maxLlmTokens: 200000,
    maxVectorSearches: 500,
    maxConversations: 200,
    maxFileUploadBytes: 10485760, // 10MB
    maxBroadcastContacts: 500,
    maxMessageTemplates: 10,
    maxCampaignsPerMonth: 20,
    maxMessagesPerCampaign: 500,
    featureSso: false,
    featureWebhooks: true,
    featureAnalytics: true,
    featureApiAccess: false,
    featureWhiteLabel: false,
    featureAdvancedLlms: false,
    featureImageAnalysis: false,
    featureCustomBranding: false,
    featureFunctionCalling: false,
    featurePrioritySupport: false,
    featureCustomEmbeddings: false,
    featurePremiumVectorSearch: false,
    featureScheduledCampaigns: true,
    featureEscalation: false,
    featureEcommerce: false,
    trialDays: 0,
    displayOrder: 1,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Pour les équipes en croissance',
    priceMonthlyXAF: 32000,
    priceAnnualXAF: 320000,
    priceMonthlyUSD: 49,
    priceAnnualUSD: 490,
    maxAgents: 3,
    maxKnowledgeBases: 10,
    maxDocumentsPerKb: 200,
    maxStorageBytes: 2147483648, // 2GB
    maxKnowledgeCharacters: 2000000,
    maxWhatsAppMessages: 8000,
    maxApiRequests: 50000,
    maxLlmTokens: 1000000,
    maxVectorSearches: 2000,
    maxConversations: 1000,
    maxFileUploadBytes: 52428800, // 50MB
    maxBroadcastContacts: 2000,
    maxMessageTemplates: 50,
    maxCampaignsPerMonth: 100,
    maxMessagesPerCampaign: 2000,
    featureSso: false,
    featureWebhooks: true,
    featureAnalytics: true,
    featureApiAccess: true,
    featureWhiteLabel: false,
    featureAdvancedLlms: true,
    featureImageAnalysis: true,
    featureCustomBranding: false,
    featureFunctionCalling: true,
    featurePrioritySupport: true,
    featureCustomEmbeddings: false,
    featurePremiumVectorSearch: true,
    featureScheduledCampaigns: true,
    featureEscalation: true,
    featureEcommerce: true,
    trialDays: 0,
    displayOrder: 2,
  },
  {
    code: 'enterprise',
    name: 'Entreprise',
    description: 'Pour les grandes organisations',
    priceMonthlyXAF: 130000,
    priceAnnualXAF: 1300000,
    priceMonthlyUSD: 199,
    priceAnnualUSD: 1990,
    maxAgents: 10,
    maxKnowledgeBases: -1, // Unlimited
    maxDocumentsPerKb: -1, // Unlimited
    maxStorageBytes: 10737418240, // 10GB
    maxKnowledgeCharacters: -1, // Unlimited
    maxWhatsAppMessages: -1, // Unlimited
    maxApiRequests: -1, // Unlimited
    maxLlmTokens: -1, // Unlimited
    maxVectorSearches: -1, // Unlimited
    maxConversations: -1, // Unlimited
    maxFileUploadBytes: 104857600, // 100MB
    maxBroadcastContacts: -1, // Unlimited
    maxMessageTemplates: -1, // Unlimited
    maxCampaignsPerMonth: -1, // Unlimited
    maxMessagesPerCampaign: -1, // Unlimited
    featureSso: true,
    featureWebhooks: true,
    featureAnalytics: true,
    featureApiAccess: true,
    featureWhiteLabel: true,
    featureAdvancedLlms: true,
    featureImageAnalysis: true,
    featureCustomBranding: true,
    featureFunctionCalling: true,
    featurePrioritySupport: true,
    featureCustomEmbeddings: true,
    featurePremiumVectorSearch: true,
    featureScheduledCampaigns: true,
    featureEscalation: true,
    featureEcommerce: true,
    trialDays: 0,
    displayOrder: 3,
  },
];

@Injectable()
export class PlanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlanService.name);
  private plansCache: Map<string, Plan> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
    await this.refreshCache();

    // Start automatic cache refresh every 60 seconds
    this.refreshInterval = setInterval(async () => {
      await this.refreshCache();
    }, CACHE_REFRESH_INTERVAL);

    this.logger.log(`Plans cache auto-refresh enabled (every ${CACHE_REFRESH_INTERVAL / 1000}s)`);
  }

  onModuleDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Seed default plans - only creates plans if they don't exist
   * Quotas are managed entirely from the database, not overwritten by code
   */
  async seedPlans(): Promise<void> {
    this.logger.log('Checking for missing plans...');

    for (const planData of DEFAULT_PLANS) {
      const existing = await this.planRepository.findOne({
        where: { code: planData.code },
      });

      if (!existing) {
        // Create new plan only if it doesn't exist
        const plan = this.planRepository.create(planData);
        await this.planRepository.save(plan);
        this.logger.log(`Created plan: ${planData.code}`);
      } else if (existing.trialDays !== planData.trialDays) {
        // Sync trialDays with code (essais supprimés : 0 partout)
        existing.trialDays = planData.trialDays;
        await this.planRepository.save(existing);
        this.logger.log(`Updated trialDays for plan ${planData.code}: ${planData.trialDays} days`);
      }
    }

    this.logger.log('Plans seed check completed');
  }

  /**
   * Refresh the plans cache from database
   */
  async refreshCache(): Promise<void> {
    try {
      const plans = await this.planRepository.find({ where: { isActive: true } });
      this.plansCache.clear();
      plans.forEach(plan => this.plansCache.set(plan.code.toLowerCase(), plan));
      this.logger.debug(`Plans cache refreshed from database: ${this.plansCache.size} plans`);
    } catch (error) {
      this.logger.error('Failed to refresh plans cache from database', error);
    }
  }

  /**
   * Get plan by code (uses in-memory cache, auto-refreshed from DB every 60s)
   */
  getPlanByCode(code: string): Plan | undefined {
    return this.plansCache.get(code.toLowerCase());
  }

  /**
   * Get plan by code directly from database (bypasses cache)
   */
  async getPlanByCodeFromDb(code: string): Promise<Plan | null> {
    return this.planRepository.findOne({
      where: { code: code.toLowerCase() },
    });
  }

  /**
   * Get all active plans
   */
  async getAllPlans(): Promise<Plan[]> {
    return this.planRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });
  }

  /**
   * Get trial days for a plan
   */
  getTrialDays(code: string): number {
    const plan = this.getPlanByCode(code);
    return plan?.trialDays ?? 0;
  }

  /**
   * Get plan price in XAF
   */
  getPlanPriceXAF(code: string, billingPeriod: 'monthly' | 'annual' = 'monthly'): number {
    const plan = this.getPlanByCode(code);
    if (!plan) return 0;
    return billingPeriod === 'monthly' ? plan.priceMonthlyXAF : plan.priceAnnualXAF;
  }

  /**
   * Get plan quota value
   */
  getPlanQuota(code: string, quotaName: string): number {
    const plan = this.getPlanByCode(code);
    if (!plan) return 0;
    return (plan as unknown as Record<string, unknown>)[quotaName] as number ?? 0;
  }

  /**
   * Check if plan has feature
   */
  planHasFeature(code: string, featureName: string): boolean {
    const plan = this.getPlanByCode(code);
    if (!plan) return false;
    return (plan as unknown as Record<string, unknown>)[featureName] as boolean ?? false;
  }

  /**
   * Update a plan
   */
  async updatePlan(code: string, updates: Partial<Plan>): Promise<Plan | null> {
    const plan = await this.planRepository.findOne({ where: { code } });
    if (!plan) return null;

    Object.assign(plan, updates);
    const savedPlan = await this.planRepository.save(plan);
    await this.refreshCache();
    return savedPlan;
  }

  /**
   * Get plan limits in the format expected by quota enforcement
   */
  getPlanLimits(code: string): {
    maxAgents: number;
    maxRequestsPerMonth: number;
    maxStorageBytes: number;
    maxKnowledgeChars: number;
    maxKnowledgeBases: number;
    maxLLMTokensPerMonth: number;
    maxVectorSearches: number;
    maxConversationsPerMonth: number;
    maxDocumentsPerKB: number;
    maxFileUploadSize: number;
    broadcastContacts: number;
    maxFacebookComments: number;
  } {
    const plan = this.getPlanByCode(code);

    // Default FREE limits if plan not found
    if (!plan) {
      return {
        maxAgents: 1,
        maxRequestsPerMonth: 100,
        maxStorageBytes: 100 * 1024 * 1024,
        maxKnowledgeChars: 50000,
        maxKnowledgeBases: 1,
        maxLLMTokensPerMonth: 10000,
        maxVectorSearches: 500,
        maxConversationsPerMonth: 50,
        maxDocumentsPerKB: 50,
        maxFileUploadSize: 10 * 1024 * 1024,
        broadcastContacts: 50,
        maxFacebookComments: 100,
      };
    }

    return {
      maxAgents: plan.maxAgents,
      maxRequestsPerMonth: plan.maxWhatsAppMessages,
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxKnowledgeChars: plan.maxKnowledgeCharacters,
      maxKnowledgeBases: plan.maxKnowledgeBases,
      maxLLMTokensPerMonth: plan.maxLlmTokens,
      maxVectorSearches: plan.maxVectorSearches,
      maxConversationsPerMonth: plan.maxConversations,
      maxDocumentsPerKB: plan.maxDocumentsPerKb,
      maxFileUploadSize: plan.maxFileUploadBytes,
      broadcastContacts: plan.maxBroadcastContacts,
      maxFacebookComments: plan.maxFacebookComments || 0,
    };
  }

  /**
   * Get plan features in the format expected by quota enforcement
   */
  getPlanFeatures(code: string): {
    customBranding: boolean;
    prioritySupport: boolean;
    analytics: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
    advancedLLMs: boolean;
    premiumVectorSearch: boolean;
    functionCalling: boolean;
    imageAnalysis: boolean;
    customEmbeddings: boolean;
    webhooks: boolean;
    scheduling: boolean;
    sso: boolean;
    escalation: boolean;
    ecommerce: boolean;
  } {
    const plan = this.getPlanByCode(code);

    // Default FREE features if plan not found
    if (!plan) {
      return {
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
        escalation: false,
        ecommerce: false,
      };
    }

    return {
      customBranding: plan.featureCustomBranding,
      prioritySupport: plan.featurePrioritySupport,
      analytics: plan.featureAnalytics,
      apiAccess: plan.featureApiAccess,
      whiteLabel: plan.featureWhiteLabel,
      advancedLLMs: plan.featureAdvancedLlms,
      premiumVectorSearch: plan.featurePremiumVectorSearch,
      functionCalling: plan.featureFunctionCalling,
      imageAnalysis: plan.featureImageAnalysis,
      customEmbeddings: plan.featureCustomEmbeddings,
      webhooks: plan.featureWebhooks,
      scheduling: plan.featureScheduledCampaigns,
      sso: plan.featureSso,
      escalation: plan.featureEscalation,
      ecommerce: plan.featureEcommerce,
    };
  }

  /**
   * Get all plan limits (for iteration)
   */
  getAllPlanLimits(): Record<string, ReturnType<typeof this.getPlanLimits>> {
    const result: Record<string, ReturnType<typeof this.getPlanLimits>> = {};
    for (const [code] of this.plansCache) {
      result[code] = this.getPlanLimits(code);
    }
    return result;
  }

  /**
   * Get all plan features (for iteration)
   */
  getAllPlanFeatures(): Record<string, ReturnType<typeof this.getPlanFeatures>> {
    const result: Record<string, ReturnType<typeof this.getPlanFeatures>> = {};
    for (const [code] of this.plansCache) {
      result[code] = this.getPlanFeatures(code);
    }
    return result;
  }
}
