import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsNumber,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ProviderType,
  ProviderStatus,
  DeploymentType,
} from "../../../common/enums";

export class CreateLlmProviderDto {
  @ApiProperty({ description: "Provider name" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Provider type", enum: ProviderType })
  @IsEnum(ProviderType)
  type: ProviderType;

  @ApiProperty({ description: "Deployment type", enum: DeploymentType })
  @IsEnum(DeploymentType)
  deploymentType: DeploymentType;

  @ApiProperty({
    description: "Provider configuration",
    example: {
      apiEndpoint: "https://api.deepseek.com/v1",
      apiKey: "your-api-key",
      model: "deepseek-r1",
      maxTokens: 2000,
      temperature: 0.7,
      timeout: 30000,
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 50000,
        requestsPerDay: 1000,
      },
    },
  })
  @IsObject()
  config: {
    apiEndpoint: string;
    apiKey?: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    timeout?: number;
    retryAttempts?: number;
    rateLimits?: {
      requestsPerMinute: number;
      tokensPerMinute: number;
      requestsPerDay: number;
    };
    supportedFeatures?: {
      streaming: boolean;
      functionCalling: boolean;
      imageAnalysis: boolean;
      codeGeneration: boolean;
    };
  };

  @ApiPropertyOptional({
    description: "Provider priority (higher = preferred)",
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number = 1;

  @ApiPropertyOptional({
    description: "Health check configuration",
    example: {
      enabled: true,
      interval: 300,
      timeout: 10,
      failureThreshold: 3,
      successThreshold: 2,
    },
  })
  @IsOptional()
  @IsObject()
  healthCheck?: {
    enabled: boolean;
    interval: number;
    timeout: number;
    failureThreshold: number;
    successThreshold: number;
  };
}

export class UpdateLlmProviderDto {
  @ApiPropertyOptional({ description: "Provider name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Provider status" })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @ApiPropertyOptional({ description: "Provider configuration" })
  @IsOptional()
  @IsObject()
  config?: any;

  @ApiPropertyOptional({ description: "Provider priority" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ description: "Health check configuration" })
  @IsOptional()
  @IsObject()
  healthCheck?: any;
}

export class LlmProviderQueryDto {
  @ApiPropertyOptional({ description: "Filter by provider type" })
  @IsOptional()
  @IsEnum(ProviderType)
  type?: ProviderType;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @ApiPropertyOptional({ description: "Filter by deployment type" })
  @IsOptional()
  @IsEnum(DeploymentType)
  deploymentType?: DeploymentType;

  @ApiPropertyOptional({ description: "Page number", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;
}

export class LlmRequestDto {
  @ApiProperty({
    description: "Messages for the LLM",
    example: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, how are you?" },
    ],
  })
  @IsObject()
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;

  @ApiPropertyOptional({
    description: "Maximum tokens to generate",
    default: 2000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTokens?: number;

  @ApiPropertyOptional({
    description: "Temperature (randomness)",
    default: 0.7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: "Top-p sampling", default: 0.9 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  topP?: number;

  @ApiPropertyOptional({ description: "Frequency penalty", default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  frequencyPenalty?: number;

  @ApiPropertyOptional({ description: "Presence penalty", default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  presencePenalty?: number;

  @ApiPropertyOptional({ description: "Stream response", default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ description: "Agent ID for context" })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({
    description: "Priority level",
    enum: ["low", "normal", "high"],
  })
  @IsOptional()
  @IsString()
  priority?: "low" | "normal" | "high";

  @ApiPropertyOptional({ description: "Requires function calling capability" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresFunctionCalling?: boolean;

  @ApiPropertyOptional({ description: "Requires image analysis capability" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresImageAnalysis?: boolean;
}

export class LlmProviderStatsDto {
  @ApiProperty({ description: "Total providers" })
  total: number;

  @ApiProperty({ description: "Active providers" })
  active: number;

  @ApiProperty({ description: "Providers by type" })
  byType: Record<ProviderType, number>;

  @ApiProperty({ description: "Providers by status" })
  byStatus: Record<ProviderStatus, number>;

  @ApiProperty({ description: "Total requests handled" })
  totalRequests: number;

  @ApiProperty({ description: "Total tokens processed" })
  totalTokens: number;

  @ApiProperty({ description: "Average response time in milliseconds" })
  averageResponseTime: number;

  @ApiProperty({ description: "Overall error rate" })
  errorRate: number;

  @ApiProperty({ description: "Estimated monthly cost" })
  estimatedMonthlyCost: number;
}

export class TestProviderDto {
  @ApiProperty({ description: "Test message to send" })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: "Maximum tokens for test", default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTokens?: number = 100;
}
