import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { SubscriptionPlan, SubscriptionStatus } from "../enums";
import { UsageMetric } from "./usage-metric.entity";

@Entity("subscriptions")
@Index("IDX_SUBSCRIPTION_ORG", ["organizationId"])
@Index("IDX_SUBSCRIPTION_STATUS", ["status"])
export class Subscription extends BaseEntity {
  @ApiProperty({ description: "Subscription plan", enum: SubscriptionPlan })
  @Column({
    type: "enum",
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  plan: SubscriptionPlan;

  @ApiProperty({ description: "Subscription status", enum: SubscriptionStatus })
  @Column({
    type: "enum",
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @ApiProperty({ description: "Monthly price in cents" })
  @Column({ default: 0 })
  priceInCents: number;

  @ApiProperty({ description: "Price currency", enum: ['USD', 'XAF'] })
  @Column({ type: "varchar", default: 'USD' })
  currency: string;

  @ApiProperty({ description: "Subscription start date" })
  @Column({ type: "timestamp with time zone" })
  startsAt: Date;

  @ApiProperty({ description: "Subscription end date", required: false })
  @Column({ type: "timestamp with time zone", nullable: true })
  endsAt?: Date;

  @ApiProperty({ description: "Trial end date", required: false })
  @Column({ type: "timestamp with time zone", nullable: true })
  trialEndsAt?: Date;

  @ApiProperty({ description: "Next billing date", required: false })
  @Column({ type: "timestamp with time zone", nullable: true })
  nextBillingDate?: Date;

  @ApiProperty({ description: "Stripe subscription ID", required: false })
  @Column({ nullable: true })
  stripeSubscriptionId?: string;

  @ApiProperty({ description: "Stripe customer ID", required: false })
  @Column({ nullable: true })
  stripeCustomerId?: string;

  @ApiProperty({ description: "Subscription limits" })
  @Column({ type: "jsonb" })
  limits: {
    maxAgents: number;
    maxRequestsPerMonth: number;
    maxStorageBytes: number;
    maxKnowledgeChars: number;
    maxKnowledgeBases: number;
    maxLLMTokensPerMonth: number;
    maxVectorSearches: number;
    maxConversationsPerMonth: number;
    maxDocumentsPerKB: number;
    maxFileUploadSize: number; // bytes
  };

  @ApiProperty({ description: "Subscription features" })
  @Column({ type: "jsonb" })
  features: {
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
  };

  @ApiProperty({ description: "Subscription metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  // Relationships
  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, (org) => org.subscriptions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ApiProperty({
    description: "User ID for individual subscriptions",
    required: false,
  })
  @Column({ name: "userId", nullable: true })
  userId?: string;

  @OneToMany(() => UsageMetric, (metric) => metric.subscription)
  usageMetrics: UsageMetric[];

  // Virtual properties
  @ApiProperty({ description: "Is subscription active" })
  get isActive(): boolean {
    return (
      this.status === SubscriptionStatus.ACTIVE ||
      this.status === SubscriptionStatus.TRIALING
    );
  }

  @ApiProperty({ description: "Is subscription in trial" })
  get isTrialing(): boolean {
    return (
      this.status === SubscriptionStatus.TRIALING &&
      this.trialEndsAt &&
      this.trialEndsAt > new Date()
    );
  }

  @ApiProperty({ description: "Days remaining in trial" })
  get trialDaysRemaining(): number | null {
    if (!this.isTrialing || !this.trialEndsAt) return null;
    const diffTime = this.trialEndsAt.getTime() - new Date().getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

// Default subscription limits
export const SUBSCRIPTION_LIMITS = {
  [SubscriptionPlan.FREE]: {
    maxAgents: 1, // 1 WhatsApp account
    maxRequestsPerMonth: 100,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    maxKnowledgeChars: 50000,
    maxKnowledgeBases: 1,
    maxLLMTokensPerMonth: 10000,
    maxVectorSearches: 500,
    maxConversationsPerMonth: 50,
    maxDocumentsPerKB: 50,
    maxFileUploadSize: 10 * 1024 * 1024, // 10MB
  },
  [SubscriptionPlan.STANDARD]: {
    maxAgents: 1, // 1 WhatsApp account
    maxRequestsPerMonth: 2000,
    maxStorageBytes: 500 * 1024 * 1024, // 500MB
    maxKnowledgeChars: 1000000,
    maxKnowledgeBases: 3,
    maxLLMTokensPerMonth: 100000,
    maxVectorSearches: 5000,
    maxConversationsPerMonth: 500,
    maxDocumentsPerKB: 200,
    maxFileUploadSize: 25 * 1024 * 1024, // 25MB
  },
  [SubscriptionPlan.PRO]: {
    maxAgents: 3, // 3 WhatsApp accounts (updated for Mobile Money pricing)
    maxRequestsPerMonth: 8000,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
    maxKnowledgeChars: 5000000,
    maxKnowledgeBases: 10,
    maxLLMTokensPerMonth: 500000,
    maxVectorSearches: 25000,
    maxConversationsPerMonth: 2500,
    maxDocumentsPerKB: 1000,
    maxFileUploadSize: 100 * 1024 * 1024, // 100MB
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxAgents: 10, // 10 WhatsApp accounts (updated for Mobile Money pricing)
    maxRequestsPerMonth: 30000,
    maxStorageBytes: 20 * 1024 * 1024 * 1024, // 20GB
    maxKnowledgeChars: 20000000,
    maxKnowledgeBases: 50,
    maxLLMTokensPerMonth: 2000000,
    maxVectorSearches: 100000,
    maxConversationsPerMonth: 10000,
    maxDocumentsPerKB: 5000,
    maxFileUploadSize: 500 * 1024 * 1024, // 500MB
  },
};

// Default subscription features
// IMPORTANT: Must match currency.service.ts pricing page display!
export const SUBSCRIPTION_FEATURES = {
  [SubscriptionPlan.FREE]: {
    customBranding: false,
    prioritySupport: false,
    analytics: false,        // Basic analytics only
    apiAccess: false,        // No external API access
    whiteLabel: false,
    advancedLLMs: false,
    premiumVectorSearch: false,
    functionCalling: false,
    imageAnalysis: false,
    customEmbeddings: false,
    webhooks: false,         // No webhooks
    scheduling: false,       // No scheduled messages
    sso: false,
  },
  [SubscriptionPlan.STANDARD]: {
    customBranding: false,
    prioritySupport: false,
    analytics: true,         // Advanced analytics
    apiAccess: false,        // No external API access (matches pricing)
    whiteLabel: false,
    advancedLLMs: false,
    premiumVectorSearch: true,
    functionCalling: false,
    imageAnalysis: false,
    customEmbeddings: false,
    webhooks: false,         // No webhooks (matches pricing)
    scheduling: true,        // Scheduled messages
    sso: false,
  },
  [SubscriptionPlan.PRO]: {
    customBranding: true,
    prioritySupport: true,
    analytics: true,
    apiAccess: false,        // No external API access (matches pricing)
    whiteLabel: false,
    advancedLLMs: true,
    premiumVectorSearch: true,
    functionCalling: true,
    imageAnalysis: true,
    customEmbeddings: true,
    webhooks: true,          // Webhooks enabled (matches pricing)
    scheduling: true,        // Scheduled messages
    sso: false,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    customBranding: true,
    prioritySupport: true,
    analytics: true,
    apiAccess: true,         // Full API access (matches pricing)
    whiteLabel: true,
    advancedLLMs: true,
    premiumVectorSearch: true,
    functionCalling: true,
    imageAnalysis: true,
    customEmbeddings: true,
    webhooks: true,          // Webhooks enabled
    scheduling: true,        // Scheduled messages
    sso: true,
  },
};
