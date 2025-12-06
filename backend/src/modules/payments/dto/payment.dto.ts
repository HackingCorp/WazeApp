import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsEmail, IsOptional, IsArray, ValidateNested, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentType {
  ORANGE = 'orange',
  MTN = 'mtn',
  MULTI_CHANNEL = 'multi_channel',
}

export class S3PPaymentDto {
  @ApiProperty({ description: 'Montant du paiement en XAF', example: 5000 })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ description: 'Numéro de téléphone du client à débiter', example: '237670000000' })
  @IsString()
  customerPhone: string;

  @ApiProperty({ description: 'Type de paiement Mobile Money', enum: PaymentType, example: PaymentType.ORANGE })
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @ApiPropertyOptional({ description: 'Nom du client', example: 'Jean Dupont' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Description du paiement', example: 'Abonnement WazeApp Pro' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class EnkapOrderItemDto {
  @ApiProperty({ description: 'ID de l\'article', example: '1' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Nom de l\'article', example: 'Abonnement Pro' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Quantité', example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Prix unitaire en XAF', example: 5000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Sous-total en XAF', example: 5000 })
  @IsOptional()
  @IsNumber()
  subtotal?: number;
}

export class EnkapPaymentDto {
  @ApiProperty({ description: 'Référence marchande unique', example: 'WAZEAPP-ORDER-123456' })
  @IsString()
  merchantReference: string;

  @ApiProperty({ description: 'Nom du client', example: 'Jean Dupont' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ description: 'Email du client', example: 'jean.dupont@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiProperty({ description: 'Numéro de téléphone du client', example: '237670000000' })
  @IsString()
  customerPhone: string;

  @ApiProperty({ description: 'Montant total', example: 5000 })
  @IsNumber()
  @Min(1)
  totalAmount: number;

  @ApiPropertyOptional({ description: 'Devise', example: 'XAF', default: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Description du paiement', example: 'Abonnement WazeApp' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Liste des articles', type: [EnkapOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EnkapOrderItemDto)
  items: EnkapOrderItemDto[];

  @ApiPropertyOptional({ description: 'URL de retour après paiement' })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({ description: 'URL de notification webhook' })
  @IsOptional()
  @IsString()
  notificationUrl?: string;
}

export class VerifyS3PPaymentDto {
  @ApiProperty({ description: 'Transaction ID ou PTN', example: 'WAZEAPP-1234567890' })
  @IsString()
  transactionRef: string;
}

export class CheckEnkapStatusDto {
  @ApiProperty({ description: 'Transaction ID E-nkap', example: 'TX-123456' })
  @IsString()
  txid: string;
}
