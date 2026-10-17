import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ArrayMaxSize,
  ArrayMinSize,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/**
 * A message is addressed by the WhatsApp id we stored (externalMessageId)
 * and the chat it lives in. `fromMe` says whether we sent it — editing and
 * deleting only work on our own messages.
 */
export class MessageRefDto {
  @ApiProperty({ description: "Chat: phone number, LID, group id or full JID" })
  @IsString()
  chat: string;

  @ApiProperty({ description: "WhatsApp message id" })
  @IsString()
  messageId: string;

  @ApiPropertyOptional({ description: "True when the message was sent by this session", default: true })
  @IsOptional()
  @IsBoolean()
  fromMe?: boolean;

  @ApiPropertyOptional({ description: "Sender JID inside a group (needed to react to someone else's message)" })
  @IsOptional()
  @IsString()
  participant?: string;
}

export class MediaDto {
  @ApiProperty({ description: "Public URL of the media file" })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ enum: ["image", "video", "document", "audio"] })
  @IsIn(["image", "video", "document", "audio"])
  type: "image" | "video" | "document" | "audio";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;

  @ApiPropertyOptional({ description: "File name shown for documents" })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: "MIME type, inferred from the URL when omitted" })
  @IsOptional()
  @IsString()
  mimetype?: string;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export class SendPollDto {
  @ApiProperty({ description: "Chat: phone number, LID, group id or full JID" })
  @IsString()
  chat: string;

  @ApiProperty({ description: "The question" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  question: string;

  @ApiProperty({ type: [String], description: "2 to 12 options" })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  options: string[];

  @ApiPropertyOptional({ description: "How many options a voter may pick (0 = several)", default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  selectableCount?: number;
}

export class SendLocationDto {
  @ApiProperty()
  @IsString()
  chat: string;

  @ApiProperty()
  @IsNumber()
  latitude: number;

  @ApiProperty()
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ description: "Place name shown above the map" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class ContactCardDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty({ description: "Phone with country code" })
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;
}

export class SendContactsDto {
  @ApiProperty()
  @IsString()
  chat: string;

  @ApiProperty({ type: [ContactCardDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ContactCardDto)
  contacts: ContactCardDto[];
}

export class SendVoiceDto {
  @ApiProperty()
  @IsString()
  chat: string;

  @ApiPropertyOptional({ description: "Text to synthesize into a voice note (OpenAI TTS)" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @ApiPropertyOptional({ description: "URL of an audio file to send as a voice note instead of text" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  audioUrl?: string;

  @ApiPropertyOptional({ description: "OpenAI voice (alloy, echo, fable, onyx, nova, shimmer…)" })
  @IsOptional()
  @IsString()
  voice?: string;
}

export class ReactDto extends MessageRefDto {
  @ApiProperty({ description: "Emoji; empty string removes the reaction" })
  @IsString()
  @MaxLength(8)
  emoji: string;
}

export class EditMessageDto extends MessageRefDto {
  @ApiProperty({ description: "New text" })
  @IsString()
  @MinLength(1)
  text: string;
}

export class ForwardMessageDto extends MessageRefDto {
  @ApiProperty({ type: [String], description: "Destination chats (1 to 20)" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  to: string[];
}

export class MarkReadDto {
  @ApiProperty()
  @IsString()
  chat: string;

  @ApiPropertyOptional({ type: [String], description: "Message ids; omit to mark the whole chat read" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messageIds?: string[];
}

export class DisappearingDto {
  @ApiProperty()
  @IsString()
  chat: string;

  @ApiProperty({ description: "0 (off), 86400 (24h), 604800 (7 days) or 7776000 (90 days)" })
  @IsIn([0, 86400, 604800, 7776000])
  seconds: number;
}

// ---------------------------------------------------------------------------
// Chats, labels, blocking
// ---------------------------------------------------------------------------

export class ChatActionDto {
  @ApiProperty()
  @IsString()
  chat: string;
}

export class ChatToggleDto extends ChatActionDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  value?: boolean;
}

export class MuteDto extends ChatActionDto {
  @ApiPropertyOptional({ description: "Duration in hours; omit or 0 to unmute", default: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;
}

export class CreateLabelDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: "WhatsApp colour index 0-19", default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(19)
  color?: number;
}

export class ChatLabelDto extends ChatActionDto {
  @ApiProperty({ description: "Label id as returned by GET /labels" })
  @IsString()
  labelId: string;
}

export class BlockDto {
  @ApiProperty({ description: "Phone number or JID" })
  @IsString()
  contact: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  block?: boolean;
}

// ---------------------------------------------------------------------------
// Profile & presence
// ---------------------------------------------------------------------------

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: "Display name" })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  name?: string;

  @ApiPropertyOptional({ description: '"About" text' })
  @IsOptional()
  @IsString()
  @MaxLength(139)
  about?: string;

  @ApiPropertyOptional({ description: "URL of the new profile picture (JPEG/PNG)" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  pictureUrl?: string;

  @ApiPropertyOptional({ description: "Remove the profile picture" })
  @IsOptional()
  @IsBoolean()
  removePicture?: boolean;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export class CreateGroupDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subject: string;

  @ApiProperty({ type: [String], description: "Initial members (phone numbers or JIDs), 1 to 50" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  participants: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;
}

export class GroupParticipantsDto {
  @ApiProperty({ type: [String], description: "Phone numbers or JIDs, 1 to 50" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  participants: string[];

  @ApiProperty({ enum: ["add", "remove", "promote", "demote"] })
  @IsIn(["add", "remove", "promote", "demote"])
  action: "add" | "remove" | "promote" | "demote";
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @ApiPropertyOptional({ description: "URL of the new group picture" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  pictureUrl?: string;

  @ApiPropertyOptional({ description: "Only admins may send messages" })
  @IsOptional()
  @IsBoolean()
  announcementOnly?: boolean;

  @ApiPropertyOptional({ description: "Only admins may edit group info" })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({ description: "Require admin approval to join" })
  @IsOptional()
  @IsBoolean()
  joinApproval?: boolean;

  @ApiPropertyOptional({ description: "Disappearing messages timer in seconds (0 = off)" })
  @IsOptional()
  @IsIn([0, 86400, 604800, 7776000])
  disappearingSeconds?: number;
}

export class JoinGroupDto {
  @ApiProperty({ description: "Invite code or full https://chat.whatsapp.com/… link" })
  @IsString()
  invite: string;
}

export class GroupJoinRequestsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participants: string[];

  @ApiProperty({ enum: ["approve", "reject"] })
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";
}

// ---------------------------------------------------------------------------
// Channels & statuses
// ---------------------------------------------------------------------------

export class CreateChannelDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;
}

export class UpdateChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @ApiPropertyOptional({ description: "URL of the new channel picture" })
  @IsOptional()
  @IsUrl({ require_tld: false })
  pictureUrl?: string;

  @ApiPropertyOptional({ description: "Remove the channel picture" })
  @IsOptional()
  @IsBoolean()
  removePicture?: boolean;
}

export class PublishContentDto {
  @ApiPropertyOptional({ description: "Text (or caption when media is given)" })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  @ApiPropertyOptional({ type: MediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  media?: MediaDto;

  @ApiPropertyOptional({ description: "Status only: background colour for text statuses (#RRGGBB)" })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({ description: "Status only: font index 0-5" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  font?: number;
}

export class StatusAudienceDto {
  @ApiProperty({ enum: ["optin", "contacts", "jids"], description: "optin = organisation's subscribed broadcast contacts; contacts = every contact known to the session; jids = explicit list" })
  @IsIn(["optin", "contacts", "jids"])
  type: "optin" | "contacts" | "jids";

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jids?: string[];

  @ApiPropertyOptional({ type: [String], description: "optin only: restrict to contacts carrying these tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class PublishStatusDto extends PublishContentDto {
  @ApiProperty({ type: StatusAudienceDto })
  @ValidateNested()
  @Type(() => StatusAudienceDto)
  audience: StatusAudienceDto;
}

export class SchedulePostDto extends PublishContentDto {
  @ApiProperty({ enum: ["channel", "status", "group", "chat"] })
  @IsIn(["channel", "status", "group", "chat"])
  kind: "channel" | "status" | "group" | "chat";

  @ApiPropertyOptional({ description: "Channel / group / chat JID (not for statuses)" })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ type: StatusAudienceDto, description: "Statuses only" })
  @IsOptional()
  @ValidateNested()
  @Type(() => StatusAudienceDto)
  audience?: StatusAudienceDto;

  @ApiProperty({ description: "ISO date-time of the (first) publication" })
  @IsString()
  scheduledAt: string;

  @ApiPropertyOptional({ description: "Cron expression for recurring publication, e.g. \"0 9 * * 1\"" })
  @IsOptional()
  @IsString()
  cron?: string;
}

// ---------------------------------------------------------------------------
// Automation settings
// ---------------------------------------------------------------------------

export class VoiceRepliesDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onlyWhenClientUsesVoice?: boolean;
}

export class AutomationSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoRead?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rejectCalls?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) rejectCallsMessage?: string;
  @ApiPropertyOptional({ type: VoiceRepliesDto }) @IsOptional() @ValidateNested() @Type(() => VoiceRepliesDto) voiceReplies?: VoiceRepliesDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() presenceTracking?: boolean;
  @ApiPropertyOptional({ description: "Emoji reaction sent to every inbound message; empty to disable" }) @IsOptional() @IsString() @MaxLength(8) acknowledgeReaction?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() labelOnNewConversation?: string;
  @ApiPropertyOptional({ description: "order status → label id" }) @IsOptional() labelsByOrderStatus?: Record<string, string>;
  @ApiPropertyOptional() @IsOptional() @IsIn([0, 86400, 604800, 7776000]) disappearingSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100) autoBlockAfterAbuse?: number;
}
