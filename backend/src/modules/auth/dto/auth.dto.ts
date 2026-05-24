import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ description: "User password", minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      "Password must contain uppercase, lowercase, number/special character",
  })
  password: string;

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

  @ApiPropertyOptional({ description: "Organization name" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  organizationName?: string;

  @ApiPropertyOptional({ description: "Invitation token" })
  @IsOptional()
  @IsString()
  invitationToken?: string;

  @ApiPropertyOptional({ description: "Selected subscription plan", enum: ['FREE', 'STANDARD', 'PRO', 'ENTERPRISE'] })
  @IsOptional()
  @IsString()
  plan?: 'FREE' | 'STANDARD' | 'PRO' | 'ENTERPRISE';

  @ApiPropertyOptional({ description: "Payment method preference", enum: ['stripe', 'mobile_money'] })
  @IsOptional()
  @IsIn(['stripe', 'mobile_money'])
  paymentMethod?: 'stripe' | 'mobile_money';

  @ApiPropertyOptional({ description: "Detected country code (ISO 3166-1 alpha-2)" })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

export class LoginDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ description: "User password" })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ description: "Remember me flag" })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: "Password reset token" })
  @IsString()
  token: string;

  @ApiProperty({ description: "New password", minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      "Password must contain uppercase, lowercase, number/special character",
  })
  password: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: "Email verification token" })
  @IsString()
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: "Refresh token" })
  @IsString()
  refreshToken: string;
}

export class TwoFactorAuthDto {
  @ApiProperty({ description: "2FA verification code" })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: "Access token" })
  accessToken: string;

  @ApiProperty({ description: "Refresh token" })
  refreshToken: string;

  @ApiProperty({ description: "Token expiry time" })
  expiresIn: number;

  @ApiProperty({ description: "User information" })
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };

  @ApiPropertyOptional({ description: "Stripe Checkout URL for payment setup" })
  @IsOptional()
  stripeCheckoutUrl?: string;
}

export class UpdateOnboardingStepDto {
  @ApiProperty({ description: "Onboarding step (1-5) or null to mark as complete", nullable: true })
  @IsOptional()
  step: number | null;
}

export class OAuthCallbackDto {
  @ApiPropertyOptional({ description: "OAuth authorization code" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: "OAuth state parameter" })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: "OAuth error" })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({ description: "OAuth error description" })
  @IsOptional()
  @IsString()
  error_description?: string;
}
