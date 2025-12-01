import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  IsUrl,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { AgentStatus, AgentLanguage, AgentTone } from "../../../common/enums";

export class CreateAiAgentDto {
  @ApiProperty({ description: "Agent name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Agent description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Agent avatar URL" })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiProperty({ description: "Agent primary language", enum: AgentLanguage })
  @IsEnum(AgentLanguage)
  primaryLanguage: AgentLanguage;

  @ApiPropertyOptional({
    description: "Agent supported languages",
    enum: AgentLanguage,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentLanguage, { each: true })
  supportedLanguages?: AgentLanguage[];

  @ApiProperty({ description: "Agent personality tone", enum: AgentTone })
  @IsEnum(AgentTone)
  tone: AgentTone;

  @ApiProperty({ description: "System prompt template" })
  @IsString()
  systemPrompt: string;

  @ApiPropertyOptional({ description: "Welcome message" })
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @ApiPropertyOptional({
    description: "Fallback message when no knowledge found",
  })
  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @ApiPropertyOptional({
    description: "Agent configuration",
    example: {
      maxTokens: 2000,
      temperature: 0.7,
      topP: 0.9,
      contextWindow: 4000,
      memorySize: 10,
      responseFormat: "text",
      enableFunctionCalling: false,
      enableWebSearch: false,
      confidenceThreshold: 0.7,
    },
  })
  @IsOptional()
  @IsObject()
  config?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    contextWindow?: number;
    memorySize?: number;
    responseFormat?: "text" | "json" | "markdown";
    enableFunctionCalling?: boolean;
    enableWebSearch?: boolean;
    enableImageAnalysis?: boolean;
    confidenceThreshold?: number;
    maxRetries?: number;
  };

  @ApiPropertyOptional({ description: "Knowledge base IDs to associate" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({ description: "Agent tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateAiAgentDto {
  @ApiPropertyOptional({ description: "Agent name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Agent description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Agent avatar URL" })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: "Agent status" })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({ description: "Agent primary language" })
  @IsOptional()
  @IsEnum(AgentLanguage)
  primaryLanguage?: AgentLanguage;

  @ApiPropertyOptional({ description: "Agent supported languages" })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentLanguage, { each: true })
  supportedLanguages?: AgentLanguage[];

  @ApiPropertyOptional({ description: "Agent personality tone" })
  @IsOptional()
  @IsEnum(AgentTone)
  tone?: AgentTone;

  @ApiPropertyOptional({ description: "System prompt template" })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: "Welcome message" })
  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @ApiPropertyOptional({
    description: "Fallback message when no knowledge found",
  })
  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @ApiPropertyOptional({ description: "Agent configuration" })
  @IsOptional()
  @IsObject()
  config?: any;

  @ApiPropertyOptional({ description: "Knowledge base IDs to associate" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knowledgeBaseIds?: string[];

  @ApiPropertyOptional({ description: "Agent tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class AgentQueryDto {
  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;

  @ApiPropertyOptional({ description: "Filter by language" })
  @IsOptional()
  @IsEnum(AgentLanguage)
  language?: AgentLanguage;

  @ApiPropertyOptional({ description: "Filter by tone" })
  @IsOptional()
  @IsEnum(AgentTone)
  tone?: AgentTone;

  @ApiPropertyOptional({ description: "Filter by tags" })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.split(",") : value,
  )
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

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

export class AgentStatsDto {
  @ApiProperty({ description: "Total agents" })
  total: number;

  @ApiProperty({ description: "Total agents count" })
  totalAgents: number;

  @ApiProperty({ description: "Active agents" })
  active: number;

  @ApiProperty({ description: "Active agents count" })
  activeAgents: number;

  @ApiProperty({ description: "Conversations today" })
  conversationsToday: number;

  @ApiProperty({ description: "Conversations this month" })
  conversationsThisMonth: number;

  @ApiProperty({ description: "Average response time" })
  averageResponseTime: number;

  @ApiProperty({ description: "Satisfaction rate" })
  satisfactionRate: number;

  @ApiProperty({ description: "Agents by status" })
  byStatus: Record<AgentStatus, number>;

  @ApiProperty({ description: "Agents by language" })
  byLanguage: Record<AgentLanguage, number>;

  @ApiProperty({ description: "Total conversations" })
  totalConversations: number;

  @ApiProperty({ description: "Total messages" })
  totalMessages: number;

  @ApiProperty({ description: "Average satisfaction score" })
  averageSatisfaction: number;

  @ApiProperty({ description: "Agent usage by subscription plan" })
  agentUsage: {
    used: number;
    limit: number;
    percentage: number;
  };
}

export class GenerateFaqDto {
  @ApiPropertyOptional({
    description: "Knowledge base ID to generate FAQ from",
  })
  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @ApiPropertyOptional({
    description: "Maximum number of FAQ items to generate",
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxItems?: number = 10;

  @ApiPropertyOptional({
    description: "Minimum confidence threshold for FAQ items",
    default: 0.8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  confidenceThreshold?: number = 0.8;

  @ApiPropertyOptional({ description: "Language for FAQ generation" })
  @IsOptional()
  @IsEnum(AgentLanguage)
  language?: AgentLanguage;
}

export class TestAgentDto {
  @ApiProperty({ description: "Test message to send to agent" })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: "Context for the test conversation" })
  @IsOptional()
  @IsObject()
  context?: {
    userProfile?: {
      name?: string;
      phone?: string;
      email?: string;
      language?: string;
    };
    sessionId?: string;
    customData?: Record<string, any>;
  };

  @ApiPropertyOptional({
    description: "Include knowledge base sources in response",
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeSources?: boolean = false;
}
