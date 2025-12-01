import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  IsUUID,
  IsEnum,
  IsEmail,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { PaginationDto } from "@/common/dto/pagination.dto";
import { UserRole } from "@/common/enums";

export class CreateOrganizationDto {
  @ApiProperty({ description: "Organization name" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ description: "Organization description" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "Organization logo URL" })
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiPropertyOptional({ description: "Organization website" })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiPropertyOptional({ description: "Organization timezone" })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class OrganizationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Filter by active status" })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Filter by owner ID" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class InviteMemberDto {
  @ApiProperty({ description: "Email address of user to invite" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: "Role to assign to the invited user",
    enum: UserRole,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ description: "Custom invitation message" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: "New role for the member",
    enum: UserRole,
  })
  @IsEnum(UserRole)
  role: UserRole;
}

export class OrganizationResponseDto {
  @ApiProperty({ description: "Organization ID" })
  id: string;

  @ApiProperty({ description: "Organization name" })
  name: string;

  @ApiProperty({ description: "Organization slug" })
  slug: string;

  @ApiPropertyOptional({ description: "Organization description" })
  description?: string;

  @ApiPropertyOptional({ description: "Organization logo URL" })
  logo?: string;

  @ApiPropertyOptional({ description: "Organization website" })
  website?: string;

  @ApiProperty({ description: "Organization timezone" })
  timezone: string;

  @ApiProperty({ description: "Organization active status" })
  isActive: boolean;

  @ApiProperty({ description: "Organization settings" })
  settings: Record<string, any>;

  @ApiProperty({ description: "Member count" })
  memberCount: number;

  @ApiProperty({ description: "Organization owner" })
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
  };

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}

export class OrganizationMemberResponseDto {
  @ApiProperty({ description: "Membership ID" })
  id: string;

  @ApiProperty({ description: "Member role", enum: UserRole })
  role: UserRole;

  @ApiProperty({ description: "Member active status" })
  isActive: boolean;

  @ApiProperty({ description: "Invitation accepted status" })
  invitationAccepted: boolean;

  @ApiPropertyOptional({ description: "Date when member joined" })
  joinedAt?: Date;

  @ApiProperty({ description: "User information" })
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    avatar?: string;
    lastLoginAt?: Date;
  };

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}

export class OrganizationStatsDto {
  @ApiProperty({ description: "Total members count" })
  membersCount: number;

  @ApiProperty({ description: "Active members count" })
  activeMembersCount: number;

  @ApiProperty({ description: "Pending invitations count" })
  pendingInvitationsCount: number;

  @ApiProperty({ description: "WhatsApp sessions count" })
  whatsappSessionsCount: number;

  @ApiProperty({ description: "Active WhatsApp sessions count" })
  activeWhatsappSessionsCount: number;

  @ApiProperty({ description: "Current subscription plan" })
  subscriptionPlan: string;

  @ApiProperty({ description: "Monthly usage statistics" })
  monthlyUsage: {
    apiRequests: number;
    storageUsed: number;
    knowledgeChars: number;
    whatsappMessages: number;
  };

  @ApiProperty({ description: "Usage limits based on subscription" })
  usageLimits: {
    maxAgents: number;
    maxRequestsPerMonth: number;
    maxStorageBytes: number;
    maxKnowledgeChars: number;
  };
}
