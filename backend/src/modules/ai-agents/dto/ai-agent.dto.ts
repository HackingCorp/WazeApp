import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
  IsUrl,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
  IsIn,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { AgentStatus, AgentLanguage, AgentTone, ResponseLength, VerbosityLevel } from "../../../common/enums";

export class EscalationConfigDto {
  @ApiPropertyOptional({ description: "Enable escalation to human", default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: "Keywords that trigger escalation", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ description: "Message sent to client when escalated" })
  @IsOptional()
  @IsString()
  escalationMessage?: string;
}

export class AgentConfigDto {
  @ApiPropertyOptional({ description: "Temperature for LLM (0-2)", minimum: 0, maximum: 2, default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: "Maximum tokens to generate (1-32000)", minimum: 1, maximum: 32000, default: 2000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(32000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: "Top P sampling (0-1)", minimum: 0, maximum: 1, default: 0.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({ description: "Frequency penalty (-2 to 2)", minimum: -2, maximum: 2, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  frequencyPenalty?: number;

  @ApiPropertyOptional({ description: "Presence penalty (-2 to 2)", minimum: -2, maximum: 2, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  presencePenalty?: number;

  @ApiPropertyOptional({ description: "Avoid repetition in responses", default: false })
  @IsOptional()
  @IsBoolean()
  avoidRepetition?: boolean;

  @ApiPropertyOptional({ description: "Use lists when appropriate", default: true })
  @IsOptional()
  @IsBoolean()
  useListsWhenAppropriate?: boolean;

  @ApiPropertyOptional({ description: "Include greetings in responses", default: true })
  @IsOptional()
  @IsBoolean()
  includeGreetings?: boolean;

  @ApiPropertyOptional({ description: "Sign-off style", enum: ['none', 'simple', 'formal'], default: 'none' })
  @IsOptional()
  @IsIn(['none', 'simple', 'formal'])
  signOffStyle?: 'none' | 'simple' | 'formal';
}

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

  @ApiPropertyOptional({ description: "Response length preference", enum: ResponseLength, default: ResponseLength.MEDIUM })
  @IsOptional()
  @IsEnum(ResponseLength)
  responseLength?: ResponseLength;

  @ApiPropertyOptional({ description: "Verbosity level", enum: VerbosityLevel, default: VerbosityLevel.BALANCED })
  @IsOptional()
  @IsEnum(VerbosityLevel)
  verbosity?: VerbosityLevel;

  @ApiPropertyOptional({ description: "Use emojis in responses", default: false })
  @IsOptional()
  @IsBoolean()
  useEmojis?: boolean;

  @ApiPropertyOptional({ description: "Maximum response characters (0 = unlimited)", default: 0, minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  maxResponseChars?: number;

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
    type: AgentConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigDto)
  config?: AgentConfigDto;

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

  @ApiPropertyOptional({ description: "Escalation configuration", type: EscalationConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EscalationConfigDto)
  escalationConfig?: EscalationConfigDto;

  @ApiPropertyOptional({ description: "E-commerce catalog IDs to associate" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogIds?: string[];
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

  @ApiPropertyOptional({ description: "Response length preference", enum: ResponseLength })
  @IsOptional()
  @IsEnum(ResponseLength)
  responseLength?: ResponseLength;

  @ApiPropertyOptional({ description: "Verbosity level", enum: VerbosityLevel })
  @IsOptional()
  @IsEnum(VerbosityLevel)
  verbosity?: VerbosityLevel;

  @ApiPropertyOptional({ description: "Use emojis in responses" })
  @IsOptional()
  @IsBoolean()
  useEmojis?: boolean;

  @ApiPropertyOptional({ description: "Maximum response characters (0 = unlimited)", minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  maxResponseChars?: number;

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

  @ApiPropertyOptional({ description: "Agent configuration", type: AgentConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigDto)
  config?: AgentConfigDto;

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

  @ApiPropertyOptional({ description: "Escalation configuration", type: EscalationConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EscalationConfigDto)
  escalationConfig?: EscalationConfigDto;

  @ApiPropertyOptional({ description: "E-commerce catalog IDs to associate" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogIds?: string[];
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

  @ApiPropertyOptional({
    description: "Conversation history for multi-turn test conversations",
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;

  @ApiPropertyOptional({
    description: "Override system prompt for testing unsaved edits",
  })
  @IsOptional()
  @IsString()
  systemPromptOverride?: string;
}
