import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID, IsNumber, IsArray, Min, Max } from "class-validator";

export class ConnectPageDto {
  @ApiProperty({ description: "Facebook Access Token (User or Page token from Graph API Explorer)" })
  @IsString()
  @IsNotEmpty()
  pageAccessToken: string;

  @ApiProperty({ description: "AI Agent ID to associate with this page", required: false })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: "Facebook Page ID (auto-detected if not provided)", required: false })
  @IsString()
  @IsOptional()
  pageId?: string;

  @ApiProperty({ description: "Session name (auto-detected from page name if not provided)", required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: "Enable AI auto-reply to comments", required: false })
  @IsBoolean()
  @IsOptional()
  aiResponsesEnabled?: boolean;

  @ApiProperty({ description: "Enable comment auto-reply", required: false })
  @IsBoolean()
  @IsOptional()
  commentAutoReplyEnabled?: boolean;

  @ApiProperty({ description: "Enable auto-reply (alias for commentAutoReplyEnabled)", required: false })
  @IsBoolean()
  @IsOptional()
  autoReplyEnabled?: boolean;

  @ApiProperty({ description: "Delay in seconds before replying", required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(300)
  replyDelay?: number;

  @ApiProperty({ description: "Keywords filter for auto-reply", required: false })
  @IsArray()
  @IsOptional()
  keywordsFilter?: string[];
}

export class UpdatePageSessionDto {
  @ApiProperty({ description: "Session name", required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: "AI Agent ID", required: false })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: "Enable AI responses", required: false })
  @IsBoolean()
  @IsOptional()
  aiResponsesEnabled?: boolean;

  @ApiProperty({ description: "Enable comment auto-reply", required: false })
  @IsBoolean()
  @IsOptional()
  commentAutoReplyEnabled?: boolean;

  @ApiProperty({ description: "Enable auto-reply (alias for commentAutoReplyEnabled)", required: false })
  @IsBoolean()
  @IsOptional()
  autoReplyEnabled?: boolean;

  @ApiProperty({ description: "Auto-reconnect enabled", required: false })
  @IsBoolean()
  @IsOptional()
  autoReconnect?: boolean;
}

export class FacebookPageSessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  pageId: string;

  @ApiProperty()
  pageName?: string;

  @ApiProperty()
  pageUsername?: string;

  @ApiProperty()
  pageAvatarUrl?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  aiResponsesEnabled: boolean;

  @ApiProperty()
  commentAutoReplyEnabled: boolean;

  @ApiProperty()
  autoReplyEnabled: boolean;

  @ApiProperty()
  isConnected: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
