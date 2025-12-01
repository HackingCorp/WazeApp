import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsObject,
  IsUUID,
  MinLength,
  MaxLength,
  IsEnum,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { WhatsAppSessionStatus } from "@/common/enums";
import { PaginationDto } from "@/common/dto/pagination.dto";

export class CreateWhatsAppSessionDto {
  @ApiProperty({ description: "Session name/identifier" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ description: "WhatsApp phone number" })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: "Webhook URL for events" })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: "Auto-reconnect enabled" })
  @IsOptional()
  @IsBoolean()
  autoReconnect?: boolean;

  @ApiPropertyOptional({ description: "Session configuration" })
  @IsOptional()
  @IsObject()
  config?: {
    messageRetryCount?: number;
    markOnlineOnConnect?: boolean;
    syncFullHistory?: boolean;
    defaultPresence?: "available" | "unavailable";
  };
}

export class UpdateWhatsAppSessionDto extends PartialType(
  CreateWhatsAppSessionDto,
) {
  @ApiPropertyOptional({ description: "Session active status" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Assigned AI agent ID" })
  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class WhatsAppSessionQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: "Filter by status",
    enum: WhatsAppSessionStatus,
  })
  @IsOptional()
  @IsEnum(WhatsAppSessionStatus)
  status?: WhatsAppSessionStatus;

  @ApiPropertyOptional({ description: "Filter by active status" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Filter by phone number" })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: "Recipient phone number (with country code)" })
  @IsString()
  @MinLength(10)
  to: string;

  @ApiProperty({ description: "Message content" })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({
    description: "Message type (text, image, document, etc.)",
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: "Media URL for non-text messages" })
  @IsOptional()
  @IsUrl()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: "Caption for media messages" })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: "Filename for document messages" })
  @IsOptional()
  @IsString()
  filename?: string;
}

export class WhatsAppSessionResponseDto {
  @ApiProperty({ description: "Session ID" })
  id: string;

  @ApiProperty({ description: "Session name" })
  name: string;

  @ApiPropertyOptional({ description: "WhatsApp phone number" })
  phoneNumber?: string;

  @ApiProperty({ description: "Session status", enum: WhatsAppSessionStatus })
  status: WhatsAppSessionStatus;

  @ApiProperty({ description: "QR Code expiry time" })
  qrCodeExpiresAt?: Date;

  @ApiPropertyOptional({ description: "Last connection attempt" })
  lastConnectionAttempt?: Date;

  @ApiProperty({ description: "Connection retry count" })
  retryCount: number;

  @ApiPropertyOptional({ description: "Last seen timestamp" })
  lastSeenAt?: Date;

  @ApiProperty({ description: "Session active status" })
  isActive: boolean;

  @ApiProperty({ description: "Auto-reconnect enabled" })
  autoReconnect: boolean;

  @ApiPropertyOptional({ description: "Webhook URL" })
  webhookUrl?: string;

  @ApiProperty({ description: "Session configuration" })
  config: {
    messageRetryCount?: number;
    markOnlineOnConnect?: boolean;
    syncFullHistory?: boolean;
    defaultPresence?: "available" | "unavailable";
  };

  @ApiProperty({ description: "Is session connected" })
  isConnected: boolean;

  @ApiProperty({ description: "Is QR code valid" })
  isQrCodeValid: boolean;

  @ApiProperty({ description: "Should retry connection" })
  shouldRetry: boolean;

  @ApiProperty({ description: "User information" })
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };

  @ApiPropertyOptional({ description: "Organization information" })
  organization?: {
    id: string;
    name: string;
    slug: string;
  };

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}

export class QRCodeResponseDto {
  @ApiProperty({ description: "QR code data URL" })
  qrCode: string;

  @ApiProperty({ description: "QR code expiry time" })
  expiresAt: Date;

  @ApiProperty({ description: "Time remaining in seconds" })
  timeRemaining: number;
}

export class MessageResponseDto {
  @ApiProperty({ description: "Message ID" })
  messageId: string;

  @ApiProperty({ description: "Message status" })
  status: "sent" | "delivered" | "read" | "failed";

  @ApiProperty({ description: "Timestamp" })
  timestamp: Date;

  @ApiPropertyOptional({ description: "Error message if failed" })
  error?: string;
}

export class SessionStatsDto {
  @ApiProperty({ description: "Messages sent today" })
  messagesSentToday: number;

  @ApiProperty({ description: "Messages sent this month" })
  messagesSentThisMonth: number;

  @ApiProperty({ description: "Messages received today" })
  messagesReceivedToday: number;

  @ApiProperty({ description: "Messages received this month" })
  messagesReceivedThisMonth: number;

  @ApiProperty({ description: "Connection uptime percentage" })
  uptimePercentage: number;

  @ApiProperty({ description: "Last connection time" })
  lastConnected?: Date;

  @ApiProperty({ description: "Last disconnection time" })
  lastDisconnected?: Date;

  @ApiProperty({ description: "Total connection time today (seconds)" })
  connectionTimeToday: number;

  @ApiProperty({ description: "Total connection time this month (seconds)" })
  connectionTimeThisMonth: number;
}

export class WebhookEventDto {
  @ApiProperty({ description: "Event type" })
  event: string;

  @ApiProperty({ description: "Session ID" })
  sessionId: string;

  @ApiProperty({ description: "Event data" })
  data: any;

  @ApiProperty({ description: "Event timestamp" })
  timestamp: Date;
}
