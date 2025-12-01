import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { AnalyticsService } from "./analytics.service";

@ApiTags("Analytics")
@Controller("analytics")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: "Get analytics dashboard data" })
  @ApiResponse({
    status: 200,
    description: "Analytics data retrieved successfully",
  })
  async getAnalytics(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analyticsService.getAnalytics(
      user.organizationId,
      user.userId,
      {
        period,
        startDate,
        endDate,
      },
    );
  }

  @Get("overview")
  @ApiOperation({ summary: "Get analytics overview" })
  @ApiResponse({
    status: 200,
    description: "Analytics overview retrieved successfully",
  })
  async getOverview(@CurrentUser() user: AuthenticatedRequest) {
    return this.analyticsService.getOverview(user.organizationId, user.userId);
  }

  @Get("agents")
  @ApiOperation({ summary: "Get agent performance analytics" })
  @ApiResponse({
    status: 200,
    description: "Agent analytics retrieved successfully",
  })
  async getAgentAnalytics(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("period") period?: string,
  ) {
    return this.analyticsService.getAgentAnalytics(
      user.organizationId,
      user.userId,
      period,
    );
  }

  @Get("conversations")
  @ApiOperation({ summary: "Get conversation analytics" })
  @ApiResponse({
    status: 200,
    description: "Conversation analytics retrieved successfully",
  })
  async getConversationAnalytics(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("period") period?: string,
  ) {
    return this.analyticsService.getConversationAnalytics(
      user.organizationId,
      user.userId,
      period,
    );
  }
}
