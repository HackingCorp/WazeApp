import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsBoolean,
  IsUUID,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { PaginationDto } from "@/common/dto/pagination.dto";

export class CreateUserDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ description: "User first name" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ description: "User last name" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiPropertyOptional({ description: "User phone number" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: "User avatar URL" })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: "User timezone" })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: "User language preference" })
  @IsOptional()
  @IsString()
  language?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: "User active status" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty({ description: "Current password" })
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty({ description: "New password", minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Filter by active status" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Filter by email verification status" })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({ description: "Filter by organization ID" })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class UserResponseDto {
  @ApiProperty({ description: "User ID" })
  id: string;

  @ApiProperty({ description: "User email address" })
  email: string;

  @ApiProperty({ description: "User first name" })
  firstName: string;

  @ApiProperty({ description: "User last name" })
  lastName: string;

  @ApiProperty({ description: "User full name" })
  fullName: string;

  @ApiPropertyOptional({ description: "User phone number" })
  phone?: string;

  @ApiPropertyOptional({ description: "User avatar URL" })
  avatar?: string;

  @ApiProperty({ description: "User timezone" })
  timezone: string;

  @ApiProperty({ description: "User language preference" })
  language: string;

  @ApiProperty({ description: "Email verification status" })
  emailVerified: boolean;

  @ApiProperty({ description: "2FA enabled status" })
  twoFactorEnabled: boolean;

  @ApiPropertyOptional({ description: "Last login timestamp" })
  lastLoginAt?: Date;

  @ApiProperty({ description: "User active status" })
  isActive: boolean;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}
