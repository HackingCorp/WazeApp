import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { UserRole, ProviderType, DeploymentType } from "../../../common/enums";
import { User } from "../../../common/entities";
import {
  LlmProviderService,
  LlmProviderConfig,
} from "../services/llm-provider.service";

class CreateProviderDto {
  name: string;
  type: ProviderType;
  model: string;
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  deploymentType: DeploymentType;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  metadata?: Record<string, any>;
}

class UpdateProviderDto {
  name?: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  metadata?: Record<string, any>;
}

@ApiTags("llm-providers")
@Controller("llm-providers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LlmProviderController {
  constructor(private llmProviderService: LlmProviderService) {}

  @Get()
  @ApiOperation({ summary: "Get all LLM providers for organization" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Providers retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getProviders(@CurrentUser() user: User) {
    const providers = await this.llmProviderService.getProviders(
      user.currentOrganizationId!,
    );

    // Hide API keys in response
    const sanitizedProviders = providers.map((provider) => ({
      ...provider,
      config: {
        ...provider.config,
        apiKey: provider.config.apiKey ? "***masked***" : undefined,
      },
    }));

    return {
      success: true,
      providers: sanitizedProviders,
    };
  }

  @Post()
  @ApiOperation({ summary: "Create new LLM provider" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Provider created successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async createProvider(
    @CurrentUser() user: User,
    @Body() createDto: CreateProviderDto,
  ) {
    const config: LlmProviderConfig = {
      name: createDto.name,
      type: createDto.type,
      model: createDto.model,
      endpoint: createDto.endpoint,
      apiKey: createDto.apiKey,
      maxTokens: createDto.maxTokens,
      temperature: createDto.temperature,
      topP: createDto.topP,
      frequencyPenalty: createDto.frequencyPenalty,
      presencePenalty: createDto.presencePenalty,
      deploymentType: createDto.deploymentType,
      rateLimits: createDto.rateLimits,
      metadata: createDto.metadata,
    };

    const provider = await this.llmProviderService.createProvider(
      user.currentOrganizationId!,
      config,
    );

    return {
      success: true,
      provider: {
        ...provider,
        config: {
          ...provider.config,
          apiKey: provider.config.apiKey ? "***masked***" : undefined,
        },
      },
    };
  }

  @Get("defaults")
  @ApiOperation({ summary: "Get default provider configurations" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Default configs retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getDefaultConfigs() {
    const defaults = this.llmProviderService.getDefaultProviderConfigs();

    return {
      success: true,
      defaults,
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get LLM provider by ID" })
  @ApiParam({ name: "id", description: "Provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getProvider(@CurrentUser() user: User, @Param("id") id: string) {
    const provider = await this.llmProviderService.getProvider(
      id,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      provider: {
        ...provider,
        config: {
          ...provider.config,
          apiKey: provider.config.apiKey ? "***masked***" : undefined,
        },
      },
    };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update LLM provider" })
  @ApiParam({ name: "id", description: "Provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider updated successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async updateProvider(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() updateDto: UpdateProviderDto,
  ) {
    const provider = await this.llmProviderService.updateProvider(
      id,
      user.currentOrganizationId!,
      updateDto,
    );

    return {
      success: true,
      provider: {
        ...provider,
        config: {
          ...provider.config,
          apiKey: provider.config.apiKey ? "***masked***" : undefined,
        },
      },
    };
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete LLM provider" })
  @ApiParam({ name: "id", description: "Provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider deleted successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async deleteProvider(@CurrentUser() user: User, @Param("id") id: string) {
    await this.llmProviderService.deleteProvider(
      id,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      message: "Provider deleted successfully",
    };
  }

  @Post(":id/test")
  @ApiOperation({ summary: "Test LLM provider connection" })
  @ApiParam({ name: "id", description: "Provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Provider test completed",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async testProvider(@CurrentUser() user: User, @Param("id") id: string) {
    // Verify provider belongs to user's organization
    await this.llmProviderService.getProvider(id, user.currentOrganizationId!);

    const testResult = await this.llmProviderService.testProvider(id);

    return {
      success: true,
      testResult,
    };
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Get provider usage statistics" })
  @ApiParam({ name: "id", description: "Provider ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statistics retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getProviderStats(@CurrentUser() user: User, @Param("id") id: string) {
    // Verify provider belongs to user's organization
    const provider = await this.llmProviderService.getProvider(
      id,
      user.currentOrganizationId!,
    );

    // TODO: Implement actual usage statistics
    const mockStats = {
      totalRequests: 1250,
      totalTokens: 125000,
      averageResponseTime: 850,
      successRate: 98.4,
      lastUsed: new Date().toISOString(),
      topModels: [{ model: provider.config.model, usage: 100 }],
      usage24h: {
        requests: 45,
        tokens: 4500,
        errors: 1,
      },
      usage7d: {
        requests: 312,
        tokens: 31200,
        errors: 5,
      },
      usage30d: {
        requests: 1250,
        tokens: 125000,
        errors: 18,
      },
    };

    return {
      success: true,
      stats: mockStats,
    };
  }
}
