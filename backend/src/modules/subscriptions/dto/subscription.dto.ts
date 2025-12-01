import {
  IsEnum,
  IsOptional,
  IsNumber,
  IsPositive,
  IsDateString,
  IsString,
  IsObject,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SubscriptionPlan, SubscriptionStatus } from "@/common/enums";
import { PaginationDto } from "@/common/dto/pagination.dto";

export class CreateSubscriptionDto {
  @ApiProperty({ description: "Subscription plan", enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiPropertyOptional({ description: "Stripe payment method ID" })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({
    description: "Subscription plan",
    enum: SubscriptionPlan,
  })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({
    description: "Subscription status",
    enum: SubscriptionStatus,
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class SubscriptionQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: "Filter by plan",
    enum: SubscriptionPlan,
  })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({
    description: "Filter by status",
    enum: SubscriptionStatus,
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class UsageTrackingDto {
  @ApiProperty({ description: "Usage type" })
  @IsString()
  type: string;

  @ApiProperty({ description: "Usage value" })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({ description: "Usage metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class SubscriptionResponseDto {
  @ApiProperty({ description: "Subscription ID" })
  id: string;

  @ApiProperty({ description: "Subscription plan", enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ description: "Subscription status", enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @ApiProperty({ description: "Monthly price in cents" })
  priceInCents: number;

  @ApiProperty({ description: "Subscription start date" })
  startsAt: Date;

  @ApiPropertyOptional({ description: "Subscription end date" })
  endsAt?: Date;

  @ApiPropertyOptional({ description: "Trial end date" })
  trialEndsAt?: Date;

  @ApiPropertyOptional({ description: "Next billing date" })
  nextBillingDate?: Date;

  @ApiProperty({ description: "Subscription limits" })
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
    maxFileUploadSize: number;
  };

  @ApiProperty({ description: "Subscription features" })
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
    sso: boolean;
  };

  @ApiProperty({ description: "Is subscription active" })
  isActive: boolean;

  @ApiProperty({ description: "Is subscription in trial" })
  isTrialing: boolean;

  @ApiPropertyOptional({ description: "Days remaining in trial" })
  trialDaysRemaining?: number;

  @ApiProperty({ description: "Organization information" })
  organization: {
    id: string;
    name: string;
    slug: string;
  };

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}

export class UsageStatsDto {
  @ApiProperty({ description: "Current period usage" })
  currentUsage: {
    apiRequests: number;
    storageUsed: number;
    knowledgeChars: number;
    whatsappMessages: number;
  };

  @ApiProperty({ description: "Usage limits" })
  limits: {
    maxAgents: number;
    maxRequestsPerMonth: number;
    maxStorageBytes: number;
    maxKnowledgeChars: number;
  };

  @ApiProperty({ description: "Usage percentages" })
  usagePercentages: {
    apiRequests: number;
    storage: number;
    knowledge: number;
    messages: number;
  };

  @ApiProperty({ description: "Period start date" })
  periodStart: Date;

  @ApiProperty({ description: "Period end date" })
  periodEnd: Date;

  @ApiProperty({ description: "Days remaining in period" })
  daysRemaining: number;
}

export class BillingHistoryDto {
  @ApiProperty({ description: "Billing history items" })
  items: {
    id: string;
    date: Date;
    amount: number;
    status: string;
    description: string;
    invoiceUrl?: string;
  }[];

  @ApiProperty({ description: "Total items" })
  total: number;

  @ApiProperty({ description: "Current page" })
  page: number;

  @ApiProperty({ description: "Items per page" })
  limit: number;
}

export class QuotaCheckDto {
  @ApiProperty({ description: "Whether the action is allowed" })
  allowed: boolean;

  @ApiProperty({ description: "The quota limit" })
  limit: number;

  @ApiProperty({ description: "Current usage" })
  current: number;

  @ApiProperty({ description: "Remaining quota" })
  remaining: number;

  @ApiProperty({ description: "Percentage used (0-100)" })
  percentUsed: number;

  @ApiPropertyOptional({ description: "Error message if quota exceeded" })
  message?: string;
}

export class FeatureCheckDto {
  @ApiProperty({ description: "Whether the feature is enabled" })
  enabled: boolean;

  @ApiPropertyOptional({ description: "Required plan for this feature" })
  requiredPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: "Feature access message" })
  message?: string;
}

export class UsageSummaryDto {
  @ApiProperty({ description: "Current subscription plan" })
  plan: SubscriptionPlan;

  @ApiProperty({ description: "Subscription status" })
  status: SubscriptionStatus;

  @ApiProperty({ description: "Usage breakdown by resource type" })
  usage: {
    agents: QuotaCheckDto;
    knowledgeBases: QuotaCheckDto;
    storage: QuotaCheckDto;
    knowledgeCharacters: QuotaCheckDto;
    monthlyRequests: QuotaCheckDto;
    monthlyTokens: QuotaCheckDto;
    monthlyVectorSearches: QuotaCheckDto;
    monthlyConversations: QuotaCheckDto;
  };

  @ApiProperty({ description: "Enabled features" })
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
    sso: boolean;
  };
}
