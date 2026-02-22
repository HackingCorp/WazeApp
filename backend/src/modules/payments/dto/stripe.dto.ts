import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutSessionDto {
  @ApiProperty({ description: 'Plan code (STANDARD, PRO, ENTERPRISE)' })
  @IsString()
  @IsIn(['STANDARD', 'PRO', 'ENTERPRISE'])
  plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';

  @ApiProperty({ description: 'Billing period', required: false, default: 'monthly' })
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'annually'])
  billingPeriod?: 'monthly' | 'annually';

  @ApiProperty({ description: 'Success redirect URL', required: false })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiProperty({ description: 'Cancel redirect URL', required: false })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

export class CreatePortalSessionDto {
  @ApiProperty({ description: 'Return URL after portal session', required: false })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class CreateCreditCheckoutDto {
  @ApiProperty({ description: 'Number of message credits to purchase' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ description: 'Success redirect URL', required: false })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiProperty({ description: 'Cancel redirect URL', required: false })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}
