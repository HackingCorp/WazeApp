import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID } from "class-validator";

export class ConnectPageDto {
  @ApiProperty({ description: "Session name/identifier" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: "Facebook Page Access Token" })
  @IsString()
  @IsNotEmpty()
  pageAccessToken: string;

  @ApiProperty({ description: "Facebook Page ID" })
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @ApiProperty({ description: "AI Agent ID to associate with this page", required: false })
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: "Enable AI auto-reply to comments", required: false })
  @IsBoolean()
  @IsOptional()
  aiResponsesEnabled?: boolean;

  @ApiProperty({ description: "Enable comment auto-reply", required: false })
  @IsBoolean()
  @IsOptional()
  commentAutoReplyEnabled?: boolean;
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
  isConnected: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
