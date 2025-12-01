import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsNumber,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import {
  ConversationStatus,
  ConversationChannel,
  MessageRole,
} from "../../../common/enums";

export class CreateConversationDto {
  @ApiProperty({ description: "Agent ID" })
  @IsString()
  agentId: string;

  @ApiProperty({
    description: "Communication channel",
    enum: ConversationChannel,
  })
  @IsEnum(ConversationChannel)
  channel: ConversationChannel;

  @ApiPropertyOptional({ description: "External channel identifier" })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ description: "Conversation title" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: "Initial conversation context",
    example: {
      userProfile: {
        name: "John Doe",
        phone: "+1234567890",
        language: "en",
      },
      sessionId: "session-123",
    },
  })
  @IsOptional()
  @IsObject()
  context?: {
    sessionId?: string;
    userProfile?: {
      name?: string;
      phone?: string;
      email?: string;
      language?: string;
      timezone?: string;
    };
    customData?: Record<string, any>;
  };
}

export class SendMessageDto {
  @ApiProperty({ description: "Message content" })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: "Message role (defaults to user)",
    enum: MessageRole,
  })
  @IsOptional()
  @IsEnum(MessageRole)
  role?: MessageRole = MessageRole.USER;

  @ApiPropertyOptional({ description: "External message ID from channel" })
  @IsOptional()
  @IsString()
  externalMessageId?: string;

  @ApiPropertyOptional({
    description: "Message metadata",
    example: {
      attachments: [
        {
          type: "image",
          url: "https://example.com/image.jpg",
          name: "image.jpg",
          size: 1024,
        },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: {
    attachments?: Array<{
      type: "image" | "video" | "audio" | "document";
      url: string;
      name: string;
      size: number;
    }>;
    intent?: string;
    entities?: Record<string, any>;
    language?: string;
  };
}

export class ConversationQueryDto {
  @ApiPropertyOptional({ description: "Filter by agent ID" })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ description: "Filter by channel" })
  @IsOptional()
  @IsEnum(ConversationChannel)
  channel?: ConversationChannel;

  @ApiPropertyOptional({ description: "Search in conversation content" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by tags" })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.split(",") : value,
  )
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Filter by date range - start date (ISO string)",
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "Filter by date range - end date (ISO string)",
  })
  @IsOptional()
  @IsString()
  endDate?: string;

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

export class UpdateConversationDto {
  @ApiPropertyOptional({ description: "Conversation title" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: "Conversation status" })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @ApiPropertyOptional({ description: "Conversation context" })
  @IsOptional()
  @IsObject()
  context?: any;

  @ApiPropertyOptional({ description: "Conversation tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ConversationStatsDto {
  @ApiProperty({ description: "Total conversations" })
  total: number;

  @ApiProperty({ description: "Conversations by status" })
  byStatus: Record<ConversationStatus, number>;

  @ApiProperty({ description: "Conversations by channel" })
  byChannel: Record<ConversationChannel, number>;

  @ApiProperty({ description: "Total messages" })
  totalMessages: number;

  @ApiProperty({ description: "Average conversation duration in minutes" })
  avgDuration: number;

  @ApiProperty({ description: "Average messages per conversation" })
  avgMessages: number;

  @ApiProperty({ description: "Average response time in seconds" })
  avgResponseTime: number;

  @ApiProperty({ description: "Customer satisfaction score (1-5)" })
  satisfactionScore: number;

  @ApiProperty({ description: "Conversation resolution rate" })
  resolutionRate: number;
}
