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
  Res,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { LlmProviderService } from "./llm-provider.service";
import { LLMRouterService } from "./llm-router.service";
import {
  CreateLlmProviderDto,
  UpdateLlmProviderDto,
  LlmProviderQueryDto,
  LlmRequestDto,
  LlmProviderStatsDto,
  TestProviderDto,
} from "./dto/llm-provider.dto";

@ApiTags("LLM Providers")
@Controller("api/v1/llm-providers")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LlmProviderController {
  constructor(
    private readonly llmProviderService: LlmProviderService,
    private readonly llmRouterService: LLMRouterService,
  ) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Create a new LLM provider" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "LLM provider created successfully",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Invalid configuration",
  })
  async create(
    @CurrentUser() user: User,
    @Body() createLlmProviderDto: CreateLlmProviderDto,
  ) {
    return this.llmProviderService.create(
      user.currentOrganizationId,
      user.id,
      createLlmProviderDto,
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get all LLM providers" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM providers retrieved successfully",
  })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: LlmProviderQueryDto,
  ) {
    return this.llmProviderService.findAll(user.currentOrganizationId, query);
  }

  @Get("global")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get global LLM providers" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Global LLM providers retrieved successfully",
  })
  async findGlobal(@Query() query: LlmProviderQueryDto) {
    return this.llmProviderService.findGlobal(query);
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get LLM provider statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM provider statistics retrieved successfully",
    type: LlmProviderStatsDto,
  })
  async getStats(@CurrentUser() user: User): Promise<LlmProviderStatsDto> {
    return this.llmProviderService.getStats(user.currentOrganizationId);
  }

  @Get("health")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get health status of all providers" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider health status retrieved successfully",
  })
  async getHealth() {
    return this.llmRouterService.getProviderHealth();
  }

  @Post("generate")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Generate LLM response using router" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Response generated successfully",
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: "Rate limit exceeded",
  })
  async generate(@CurrentUser() user: User, @Body() requestDto: LlmRequestDto) {
    const routerRequest = {
      ...requestDto,
      organizationId: user.currentOrganizationId,
      userId: user.id,
    };

    return this.llmRouterService.generateResponse(routerRequest);
  }

  @Post("generate-stream")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Generate streaming LLM response" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Streaming response started",
  })
  async generateStream(
    @CurrentUser() user: User,
    @Body() requestDto: LlmRequestDto,
    @Res() response: Response,
  ) {
    const routerRequest = {
      ...requestDto,
      organizationId: user.currentOrganizationId,
      userId: user.id,
      stream: true,
    };

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("Access-Control-Allow-Origin", "*");

    try {
      for await (const chunk of this.llmRouterService.generateStreamResponse(
        routerRequest,
      )) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      response.write("data: [DONE]\n\n");
      response.end();
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      response.end();
    }
  }

  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get LLM provider by ID" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM provider retrieved successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "LLM provider not found",
  })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.llmProviderService.findOne(user.currentOrganizationId, id);
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Update LLM provider" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM provider updated successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "LLM provider not found",
  })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateLlmProviderDto: UpdateLlmProviderDto,
  ) {
    return this.llmProviderService.update(
      user.currentOrganizationId,
      user.id,
      id,
      updateLlmProviderDto,
    );
  }

  @Delete(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete LLM provider" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "LLM provider deleted successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "LLM provider not found",
  })
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.llmProviderService.delete(
      user.currentOrganizationId,
      user.id,
      id,
    );
    return { message: "LLM provider deleted successfully" };
  }

  @Post(":id/test")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Test LLM provider" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider test completed successfully",
  })
  async testProvider(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() testDto: TestProviderDto,
  ) {
    return this.llmProviderService.testProvider(
      user.currentOrganizationId,
      id,
      testDto,
    );
  }

  @Post(":id/validate")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Validate LLM provider configuration" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider configuration validated",
  })
  async validateProvider(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const isValid = await this.llmProviderService.validateProvider(
      user.currentOrganizationId,
      id,
    );

    return { valid: isValid };
  }

  @Post(":id/health-check")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Run health check on specific provider" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Health check completed" })
  async healthCheck(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.llmProviderService.checkProviderHealth(
      user.currentOrganizationId,
      id,
    );
  }

  @Get(":id/usage")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get provider usage statistics" })
  @ApiParam({ name: "id", description: "LLM provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider usage statistics retrieved",
  })
  async getProviderUsage(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.llmProviderService.getProviderUsage(
      user.currentOrganizationId,
      id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
