import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsEmail,
  MinLength,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateType, TemplateCategory, RecurrenceType } from '../../../common/entities';

// ==========================================
// CONTACT DTOs
// ==========================================

export class CreateContactDto {
  @ApiProperty({ description: 'Phone number with country code' })
  @IsString()
  @MinLength(10)
  phoneNumber: string;

  @ApiProperty({ description: 'Contact name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Tags for segmentation' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Custom fields' })
  @IsOptional()
  customFields?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ImportContactsDto {
  @ApiPropertyOptional({ description: 'Session ID to use for WhatsApp validation' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Tags to apply to all imported contacts (JSON string or array)' })
  @IsOptional()
  tags?: string | string[];

  @ApiPropertyOptional({ description: 'Whether to validate WhatsApp numbers', default: true })
  @IsOptional()
  validateWhatsApp?: boolean | string;

  @ApiPropertyOptional({ description: 'Skip duplicates instead of updating', default: false })
  @IsOptional()
  skipDuplicates?: boolean | string;
}

export class ContactFilterDto {
  @ApiPropertyOptional({ description: 'Filter by tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Filter by WhatsApp validation status' })
  @IsOptional()
  @IsBoolean()
  isValidWhatsApp?: boolean;

  @ApiPropertyOptional({ description: 'Filter by subscription status' })
  @IsOptional()
  @IsBoolean()
  isSubscribed?: boolean;

  @ApiPropertyOptional({ description: 'Search by name or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

// ==========================================
// TEMPLATE DTOs
// ==========================================

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TemplateType, description: 'Message type' })
  @IsEnum(TemplateType)
  type: TemplateType;

  @ApiPropertyOptional({ enum: TemplateCategory, description: 'Template category' })
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @ApiProperty({ description: 'Message content (text or caption)' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Media URL for non-text messages' })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Caption for media messages' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Filename for document messages' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'Latitude for location messages' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude for location messages' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Location name' })
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiPropertyOptional({ description: 'Contact info for contact card messages' })
  @IsOptional()
  contactInfo?: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
  };

  @ApiPropertyOptional({ description: 'Variables used in template (e.g., ["nom", "entreprise"])' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: 'Template name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Template description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Message content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Media URL' })
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ==========================================
// CAMPAIGN DTOs
// ==========================================

export class CreateCampaignDto {
  @ApiProperty({ description: 'Campaign name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Campaign description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'WhatsApp session ID to use' })
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({ description: 'Template ID to use' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Custom message content (if not using template)' })
  @IsOptional()
  messageContent?: {
    type: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    filename?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
  };

  @ApiPropertyOptional({ description: 'Contact filter criteria' })
  @IsOptional()
  contactFilter?: {
    tags?: string[];
    includeUnverified?: boolean;
    customConditions?: Record<string, any>;
  };

  @ApiPropertyOptional({ description: 'Specific contact IDs to include' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  contactIds?: string[];

  @ApiPropertyOptional({ description: 'Scheduled date/time (ISO string)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: RecurrenceType, description: 'Recurrence type' })
  @IsOptional()
  @IsEnum(RecurrenceType)
  recurrenceType?: RecurrenceType;

  @ApiPropertyOptional({ description: 'Recurrence day (0-6 for weekly, 1-31 for monthly)' })
  @IsOptional()
  @IsNumber()
  recurrenceDay?: number;

  @ApiPropertyOptional({ description: 'Recurrence time (HH:MM)' })
  @IsOptional()
  @IsString()
  recurrenceTime?: string;

  @ApiPropertyOptional({ description: 'End date for recurring campaigns' })
  @IsOptional()
  @IsDateString()
  recurrenceEndDate?: string;

  @ApiPropertyOptional({ description: 'Delay between messages in ms', default: 3000 })
  @IsOptional()
  @IsNumber()
  delayBetweenMessages?: number;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional({ description: 'Campaign name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Campaign description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Scheduled date/time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Delay between messages in ms' })
  @IsOptional()
  @IsNumber()
  delayBetweenMessages?: number;
}

// ==========================================
// EXTERNAL API DTOs
// ==========================================

export class CreateApiKeyDto {
  @ApiProperty({ description: 'API key name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Permissions to grant', isArray: true })
  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Allowed IP addresses' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];

  @ApiPropertyOptional({ description: 'Rate limit per minute', default: 60 })
  @IsOptional()
  @IsNumber()
  rateLimitPerMinute?: number;
}

export class ExternalSendMessageDto {
  @ApiProperty({ description: 'WhatsApp session ID' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ description: 'Recipient phone number(s)' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  recipients: string[];

  @ApiPropertyOptional({ description: 'Template ID to use' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Custom message (if not using template)' })
  @IsOptional()
  message?: {
    type: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
  };

  @ApiPropertyOptional({ description: 'Variables to replace in template' })
  @IsOptional()
  variables?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Delay between messages in ms', default: 3000 })
  @IsOptional()
  @IsNumber()
  delayMs?: number;
}

export class CreateWebhookDto {
  @ApiProperty({ description: 'Webhook name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Webhook URL' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Events to subscribe to' })
  @IsArray()
  @IsString({ each: true })
  events: string[];

  @ApiPropertyOptional({ description: 'Custom headers' })
  @IsOptional()
  headers?: Record<string, string>;
}

// ==========================================
// RESPONSE DTOs
// ==========================================

export class ContactResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  company?: string;

  @ApiPropertyOptional()
  tags?: string[];

  @ApiPropertyOptional()
  isValidWhatsApp?: boolean;

  @ApiProperty()
  isSubscribed: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class ImportResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  totalProcessed: number;

  @ApiProperty()
  imported: number;

  @ApiProperty()
  updated: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty()
  failed: number;

  @ApiPropertyOptional()
  errors?: { row: number; error: string }[];
}

export class CampaignStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  delivered: number;

  @ApiProperty()
  read: number;

  @ApiProperty()
  failed: number;
}
