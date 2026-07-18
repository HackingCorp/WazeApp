import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, AuthenticatedRequest } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AllowIndividualUsers } from "../../common/decorators/allow-individual-users.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { UserRole } from "../../common/enums";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
import { EngagementNotificationService } from "./engagement-notification.service";
import { TrialService } from "./trial.service";
import { PlanService } from "./plan.service";
import { SubscriptionPlan, SubscriptionStatus } from "../../common/enums";
import { Subscription } from "../../common/entities";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, IsNull, Not } from "typeorm";
import {
  QuotaCheckDto,
  FeatureCheckDto,
  UsageSummaryDto,
} from "./dto/subscription.dto";

@ApiTags("Subscriptions & Quotas")
@Controller("subscriptions")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(
    private readonly quotaEnforcementService: QuotaEnforcementService,
    private readonly quotaAlertService: QuotaAlertService,
    private readonly trialService: TrialService,
    private readonly planService: PlanService,
    private readonly engagementNotificationService: EngagementNotificationService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  @Get("usage-summary")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @AllowIndividualUsers()
  @ApiOperation({ summary: "Get comprehensive usage summary" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Usage summary retrieved successfully",
    type: UsageSummaryDto,
  })
  async getUsageSummary(@CurrentUser() user: AuthenticatedRequest): Promise<UsageSummaryDto> {
    // If user has organization, check role permissions
    if (user.organizationId) {
      return this.quotaEnforcementService.getUsageSummary(
        user.organizationId,
      );
    }

    // For users without organization, get individual user limits
    const usageSummary = await this.quotaEnforcementService.getUserUsageSummary(
      user.userId,
    );

    return usageSummary;
  }

  @Get("quota-check/agents")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Check AI agent quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Agent quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkAgentQuota(@CurrentUser() user: AuthenticatedRequest): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkAgentQuota(
      user.organizationId,
    );
  }

  @Get("quota-check/knowledge-bases")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Check knowledge base quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkKnowledgeBaseQuota(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkKnowledgeBaseQuota(
      user.organizationId,
    );
  }

  @Post("quota-check/storage")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: "Check storage quota with optional additional bytes",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Storage quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkStorageQuota(
    @CurrentUser() user: AuthenticatedRequest,
    @Body("additionalBytes") additionalBytes?: number,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkStorageQuota(
      user.organizationId,
      additionalBytes,
    );
  }

  @Post("quota-check/knowledge-characters")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Check knowledge base character quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge character quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkKnowledgeCharacterQuota(
    @CurrentUser() user: AuthenticatedRequest,
    @Body("additionalCharacters") additionalCharacters?: number,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkKnowledgeCharacterQuota(
      user.organizationId,
      additionalCharacters,
    );
  }

  @Get("quota-check/monthly-requests")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check monthly API request quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Monthly request quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkMonthlyRequestQuota(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkMonthlyRequestQuota(
      user.organizationId,
    );
  }

  @Post("quota-check/llm-tokens")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Check LLM token quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM token quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkLLMTokenQuota(
    @CurrentUser() user: AuthenticatedRequest,
    @Body("additionalTokens") additionalTokens?: number,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkLLMTokenQuota(
      user.organizationId,
      additionalTokens,
    );
  }

  @Get("quota-check/vector-searches")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check vector search quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Vector search quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkVectorSearchQuota(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkVectorSearchQuota(
      user.organizationId,
    );
  }

  @Get("quota-check/conversations")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check conversation quota" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkConversationQuota(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkConversationQuota(
      user.organizationId,
    );
  }

  @Post("quota-check/file-upload")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Check file upload size limit" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "File upload quota status retrieved successfully",
    type: QuotaCheckDto,
  })
  async checkFileUploadSize(
    @CurrentUser() user: AuthenticatedRequest,
    @Body("fileSize") fileSize: number,
  ): Promise<QuotaCheckDto> {
    return this.quotaEnforcementService.checkFileUploadSize(
      user.organizationId,
      fileSize,
    );
  }

  @Get("feature-check/advanced-llms")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check advanced LLM access" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Advanced LLM feature access status retrieved successfully",
    type: FeatureCheckDto,
  })
  async checkAdvancedLLMAccess(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FeatureCheckDto> {
    return this.quotaEnforcementService.checkAdvancedLLMAccess(
      user.organizationId,
    );
  }

  @Get("feature-check/function-calling")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check function calling access" })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      "Function calling feature access status retrieved successfully",
    type: FeatureCheckDto,
  })
  async checkFunctionCallingAccess(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FeatureCheckDto> {
    return this.quotaEnforcementService.checkFunctionCallingAccess(
      user.organizationId,
    );
  }

  @Get("feature-check/image-analysis")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check image analysis access" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Image analysis feature access status retrieved successfully",
    type: FeatureCheckDto,
  })
  async checkImageAnalysisAccess(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FeatureCheckDto> {
    return this.quotaEnforcementService.checkImageAnalysisAccess(
      user.organizationId,
    );
  }

  @Get("feature-check/premium-vector-search")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check premium vector search access" })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      "Premium vector search feature access status retrieved successfully",
    type: FeatureCheckDto,
  })
  async checkPremiumVectorSearchAccess(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FeatureCheckDto> {
    return this.quotaEnforcementService.checkPremiumVectorSearchAccess(
      user.organizationId,
    );
  }

  @Get("feature-check/:feature")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Check specific feature access" })
  @ApiParam({ name: "feature", description: "Feature name to check" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Feature access status retrieved successfully",
    type: FeatureCheckDto,
  })
  async checkFeatureAccess(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("feature") feature: string,
  ): Promise<FeatureCheckDto> {
    return this.quotaEnforcementService.checkFeatureAccess(
      user.organizationId,
      feature,
    );
  }

  @Post("quota-alerts/trigger")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Manually trigger quota alert check (admin only)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Quota alerts checked and sent if needed",
  })
  async triggerQuotaAlerts(): Promise<{ checked: number; alertsSent: number }> {
    return this.quotaAlertService.triggerQuotaCheck();
  }

  /**
   * Campagne ponctuelle de réactivation Free. Protégée par un secret (endpoint
   * public déclenché en interne). dry-run par défaut ; traitement par lots via
   * `limit` pour éviter les timeouts HTTP. Idempotent.
   */
  @Public()
  @Post("admin/free-reactivation-campaign")
  @ApiOperation({ summary: "Campagne réactivation Free (secret requis, dry-run par défaut)" })
  async runFreeReactivationCampaign(
    @Body()
    body: {
      secret?: string;
      dryRun?: boolean;
      testEmail?: string;
      limit?: number;
      throttleMs?: number;
    },
  ): Promise<any> {
    const CAMPAIGN_SECRET = "WZ-REACTIVATE-FREE-2026-x7k9";
    if (body.secret !== CAMPAIGN_SECRET) {
      return { success: false, message: "Secret invalide." };
    }
    const result = await this.engagementNotificationService.runFreeReactivationCampaign({
      dryRun: body.dryRun !== false && !body.testEmail,
      testEmail: body.testEmail,
      limit: body.limit,
      throttleMs: body.throttleMs,
    });
    return { success: true, ...result };
  }

  @Post("start-trial")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @AllowIndividualUsers()
  @ApiOperation({ summary: "Start a free trial for a paid plan (converts FREE subscription to trial)" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Trial started successfully",
  })
  async startTrial(
    @CurrentUser() user: AuthenticatedRequest,
    @Body("plan") planCode: string = 'standard',
  ): Promise<any> {
    const normalizedPlan = planCode.toLowerCase();
    const trialDays = this.planService.getTrialDays(normalizedPlan);
    if (trialDays <= 0) {
      return { success: false, message: 'This plan does not offer a free trial' };
    }

    // Find user's current FREE subscription
    const subscription = await this.subscriptionRepository.findOne({
      where: [
        { userId: user.userId, plan: SubscriptionPlan.FREE },
        { organizationId: user.organizationId, plan: SubscriptionPlan.FREE },
      ].filter(w => w.userId || w.organizationId),
    });

    if (!subscription) {
      return { success: false, message: 'No FREE subscription found to convert' };
    }

    if (subscription.status === SubscriptionStatus.TRIALING) {
      return { success: false, message: 'You already have an active trial' };
    }

    // Convert to trial
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    subscription.plan = normalizedPlan.toUpperCase() as SubscriptionPlan;
    subscription.status = SubscriptionStatus.TRIALING;
    subscription.startsAt = now;
    subscription.trialEndsAt = trialEndsAt;
    subscription.limits = this.planService.getPlanLimits(normalizedPlan);
    subscription.features = this.planService.getPlanFeatures(normalizedPlan);
    subscription.metadata = {
      ...subscription.metadata,
      trialStartedAt: now.toISOString(),
      trialDays,
      convertedFromFree: true,
    };

    await this.subscriptionRepository.save(subscription);

    // Start trial async (invoice + email)
    this.trialService.startTrial(subscription).catch(() => {});

    return {
      success: true,
      message: `Trial started for plan ${normalizedPlan} (${trialDays} days)`,
      trialEndsAt,
      plan: subscription.plan,
    };
  }

  @Post("refresh-quotas")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @AllowIndividualUsers()
  @ApiOperation({ summary: "Refresh quotas by clearing caches and fetching fresh data" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Quotas refreshed successfully",
  })
  async refreshQuotas(@CurrentUser() user: AuthenticatedRequest): Promise<any> {
    if (user.organizationId) {
      return this.quotaEnforcementService.refreshOrganizationQuotas(user.organizationId);
    }

    // For individual users
    await this.quotaEnforcementService.clearUserCaches(user.userId);
    return this.quotaEnforcementService.getUserUsageSummary(user.userId);
  }
}
