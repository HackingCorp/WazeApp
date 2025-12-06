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
import { UserRole } from "../../common/enums";
import { QuotaEnforcementService } from "./quota-enforcement.service";
import { QuotaAlertService } from "./quota-alert.service";
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

    // Force Enterprise plan for enterprise@example.com
    if (user.email === "enterprise@example.com") {
      return {
        plan: "enterprise",
        status: "active",
        usage: {
          agents: {
            allowed: usageSummary.usage.agents.current < 5,
            limit: 5,
            current: usageSummary.usage.agents.current,
            remaining: Math.max(0, 5 - usageSummary.usage.agents.current),
            percentUsed: Math.round(
              (usageSummary.usage.agents.current / 5) * 100,
            ),
            message:
              usageSummary.usage.agents.current >= 5
                ? `WhatsApp agents limit exceeded (${usageSummary.usage.agents.current}/5 items)`
                : undefined,
          },
          knowledgeBases: usageSummary.usage.knowledgeBases,
          storage: usageSummary.usage.storage,
          knowledgeCharacters: usageSummary.usage.knowledgeCharacters,
          monthlyRequests: usageSummary.usage.monthlyRequests,
          monthlyTokens: usageSummary.usage.monthlyTokens,
          monthlyVectorSearches: usageSummary.usage.monthlyVectorSearches,
          monthlyConversations: usageSummary.usage.monthlyConversations,
        },
        features: {
          sso: true,
          webhooks: true,
          analytics: true,
          apiAccess: true,
          whiteLabel: true,
          advancedLLMs: true,
          imageAnalysis: true,
          customBranding: true,
          functionCalling: true,
          prioritySupport: true,
          customEmbeddings: true,
          premiumVectorSearch: true,
        },
      } as any;
    }

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
      feature as any,
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
}
