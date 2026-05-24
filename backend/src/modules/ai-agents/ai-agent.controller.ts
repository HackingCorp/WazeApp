import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
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
import {
  CurrentUser,
  AuthenticatedRequest,
} from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AllowIndividualUsers } from "../../common/decorators/allow-individual-users.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { AiAgentService } from "./ai-agent.service";
import {
  CreateAiAgentDto,
  UpdateAiAgentDto,
  AgentQueryDto,
  AgentStatsDto,
  GenerateFaqDto,
  TestAgentDto,
} from "./dto/ai-agent.dto";

@ApiTags("AI Agents")
@Controller("agents")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@AllowIndividualUsers()
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post()
  @ApiOperation({ summary: "Create a new AI agent" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "AI agent created successfully",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "AI agent limit reached",
  })
  async create(
    @CurrentUser() user: any,
    @Body() createAiAgentDto: CreateAiAgentDto,
  ) {
    // Users can create agents without organization - agents are user-owned
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.create(organizationId, userId, createAiAgentDto);
  }

  @Get()
  @ApiOperation({ summary: "Get all AI agents for user or organization" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "AI agents retrieved successfully",
  })
  async findAll(@CurrentUser() user: any, @Query() query: AgentQueryDto) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.findAll(organizationId, userId, query);
  }

  @Get("templates")
  @ApiOperation({ summary: "Get agent templates for onboarding" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Agent templates retrieved successfully",
  })
  async getTemplates() {
    return this.aiAgentService.getTemplates();
  }

  @Get("stats")
  @ApiOperation({ summary: "Get AI agent statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "AI agent statistics retrieved successfully",
    type: AgentStatsDto,
  })
  async getStats(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<AgentStatsDto> {
    // For users without organizations, return empty stats
    if (!user.organizationId) {
      return {
        total: 0,
        totalAgents: 0,
        active: 0,
        activeAgents: 0,
        conversationsToday: 0,
        conversationsThisMonth: 0,
        averageResponseTime: 0,
        satisfactionRate: 0,
        byStatus: {} as Record<string, number>,
        byLanguage: {} as Record<string, number>,
        totalConversations: 0,
        totalMessages: 0,
        averageSatisfaction: 0,
        agentUsage: {
          used: 0,
          limit: 0,
          percentage: 0,
        },
      };
    }
    return this.aiAgentService.getStats(user.organizationId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get AI agent by ID" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "AI agent retrieved successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "AI agent not found",
  })
  async findOne(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.findOneForUser(organizationId, userId, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update AI agent" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "AI agent updated successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "AI agent not found",
  })
  async update(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateAiAgentDto: UpdateAiAgentDto,
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.updateForUser(
      organizationId,
      userId,
      id,
      updateAiAgentDto,
    );
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete AI agent" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "AI agent deleted successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "AI agent not found",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Cannot delete agent with active conversations",
  })
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.aiAgentService.delete(user.currentOrganizationId || (user as any).organizationId || null, user.id, id);
    return { message: "AI agent deleted successfully" };
  }

  @Post(":id/generate-faq")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Generate FAQ from knowledge base" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "FAQ generated successfully",
  })
  async generateFaq(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() generateDto: GenerateFaqDto,
  ) {
    return this.aiAgentService.generateFaq(
      user.currentOrganizationId || (user as any).organizationId || null,
      id,
      generateDto,
    );
  }

  @Get(":id/debug-catalog")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Debug agent catalog resolution" })
  async debugCatalog(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.aiAgentService.debugCatalog(
      user.currentOrganizationId || (user as any).organizationId || null,
      id,
    );
  }

  @Post(":id/test")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Test AI agent with a message" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Agent test completed successfully",
  })
  async testAgent(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() testDto: TestAgentDto,
  ) {
    return this.aiAgentService.testAgent(
      user.currentOrganizationId || (user as any).organizationId || null,
      id,
      testDto,
    );
  }

  @Get(":id/conversations")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get conversations for AI agent" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Agent conversations retrieved successfully",
  })
  async getConversations(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.getAgentConversations(
      organizationId,
      userId,
      id,
      page,
      limit,
    );
  }

  @Post(":id/clone")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Clone an existing AI agent" })
  @ApiParam({ name: "id", description: "AI agent ID to clone" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "AI agent cloned successfully",
  })
  async cloneAgent(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body("name") name?: string,
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.cloneAgent(organizationId, userId, id, name);
  }

  @Get(":id/prompt/history")
  @ApiOperation({ summary: "Get agent system prompt version history" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Prompt history retrieved successfully",
  })
  async getPromptHistory(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.getPromptHistory(organizationId, userId, id);
  }

  @Post(":id/prompt/rollback")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Rollback agent system prompt to a previous version" })
  @ApiParam({ name: "id", description: "AI agent ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Prompt rolled back successfully",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Version not found or no history available",
  })
  async rollbackPrompt(
    @CurrentUser() user: any,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { version: number },
  ) {
    const organizationId =
      user.currentOrganizationId || user.organizationId || null;
    const userId = user.id || user.userId || user.sub;

    return this.aiAgentService.rollbackPrompt(
      organizationId,
      userId,
      id,
      body.version,
    );
  }
}
