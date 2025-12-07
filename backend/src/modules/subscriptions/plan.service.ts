import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../common/entities';

// Default plan configurations
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
    displayOrder: 0,
  },
  {
    code: 'standard',
    name: 'Standard',
    description: 'Great for small businesses',
    priceMonthlyXAF: 1300, // TEMP TEST (real: 19000)
    priceAnnualXAF: 13000, // TEMP TEST (real: 190000)
    priceMonthlyUSD: 200, // ~$2 test (real: ~$29)
    priceAnnualUSD: 2000,
    maxAgents: 1,
    maxKnowledgeBases: 3,
    maxDocumentsPerKb: 50,
    maxStorageBytes: 524288000, // 500MB
    maxKnowledgeCharacters: 500000,
    maxWhatsAppMessages: 1000,
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
    displayOrder: 1,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For growing teams',
    priceMonthlyXAF: 1950, // TEMP TEST (real: 32000)
    priceAnnualXAF: 19500, // TEMP TEST (real: 320000)
    priceMonthlyUSD: 300, // ~$3 test (real: ~$49)
    priceAnnualUSD: 3000,
    maxAgents: 3,
    maxKnowledgeBases: 10,
    maxDocumentsPerKb: 200,
    maxStorageBytes: 2147483648, // 2GB
    maxKnowledgeCharacters: 2000000,
    maxWhatsAppMessages: 5000,
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
    displayOrder: 2,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthlyXAF: 2600, // TEMP TEST (real: 130000)
    priceAnnualXAF: 26000, // TEMP TEST (real: 1300000)
    priceMonthlyUSD: 400, // ~$4 test (real: ~$199)
    priceAnnualUSD: 4000,
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
    displayOrder: 3,
  },
];

@Injectable()
export class PlanService implements OnModuleInit {
  private readonly logger = new Logger(PlanService.name);
  private plansCache: Map<string, Plan> = new Map();

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async onModuleInit() {
    await this.seedPlans();
    await this.refreshCache();
  }

  /**
   * Seed default plans if they don't exist
   */
  async seedPlans(): Promise<void> {
    this.logger.log('Checking plans...');

    for (const planData of DEFAULT_PLANS) {
      const existing = await this.planRepository.findOne({
        where: { code: planData.code },
      });

      if (!existing) {
        const plan = this.planRepository.create(planData);
        await this.planRepository.save(plan);
        this.logger.log(`Created plan: ${planData.code}`);
      }
    }

    this.logger.log('Plans check completed');
  }

  /**
   * Refresh the plans cache
   */
  async refreshCache(): Promise<void> {
    const plans = await this.planRepository.find({ where: { isActive: true } });
    this.plansCache.clear();
    plans.forEach(plan => this.plansCache.set(plan.code.toLowerCase(), plan));
    this.logger.log(`Plans cache refreshed: ${this.plansCache.size} plans`);
  }

  /**
   * Get plan by code (uses cache)
   */
  getPlanByCode(code: string): Plan | undefined {
    return this.plansCache.get(code.toLowerCase());
  }

  /**
   * Get plan by code from database
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
    return (plan as any)[quotaName] ?? 0;
  }

  /**
   * Check if plan has feature
   */
  planHasFeature(code: string, featureName: string): boolean {
    const plan = this.getPlanByCode(code);
    if (!plan) return false;
    return (plan as any)[featureName] ?? false;
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
   * This replaces the hardcoded SUBSCRIPTION_LIMITS
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
      };
    }

    return {
      maxAgents: plan.maxAgents,
      maxRequestsPerMonth: plan.maxWhatsAppMessages, // Using WhatsApp messages as requests
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxKnowledgeChars: plan.maxKnowledgeCharacters,
      maxKnowledgeBases: plan.maxKnowledgeBases,
      maxLLMTokensPerMonth: plan.maxLlmTokens,
      maxVectorSearches: plan.maxVectorSearches,
      maxConversationsPerMonth: plan.maxConversations,
      maxDocumentsPerKB: plan.maxDocumentsPerKb,
      maxFileUploadSize: plan.maxFileUploadBytes,
      broadcastContacts: plan.maxBroadcastContacts,
    };
  }

  /**
   * Get plan features in the format expected by quota enforcement
   * This replaces the hardcoded SUBSCRIPTION_FEATURES
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
