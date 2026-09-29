import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsEmail, IsOptional, IsArray, ValidateNested, IsEnum, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentType {
  ORANGE = 'orange',
  MTN = 'mtn',
  MULTI_CHANNEL = 'multi_channel',
}

export class S3PPaymentDto {
  @ApiProperty({ description: 'Montant du paiement', example: 5000 })
  @IsNumber()
  @Min(1) // Allow small amounts in USD, will convert to XAF
  amount: number;

  @ApiPropertyOptional({ description: 'Devise du montant', example: 'XAF', default: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string;

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

  @ApiPropertyOptional({ description: 'Plan d\'abonnement', enum: ['STANDARD', 'PRO', 'ENTERPRISE'], example: 'PRO' })
  @IsOptional()
  @IsString()
  plan?: 'STANDARD' | 'PRO' | 'ENTERPRISE';

  @ApiPropertyOptional({ description: 'ID de l\'utilisateur', example: 'uuid-user-id' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Période de facturation', enum: ['monthly', 'annually'], example: 'monthly' })
  @IsOptional()
  @IsString()
  billingPeriod?: 'monthly' | 'annually';
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

export class NkapPayCustomerInfoDto {
  @ApiPropertyOptional({ description: 'Nom du client', example: 'Jean-Pierre Mbarga' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Email du client', example: 'client@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Téléphone du client (E.164)', example: '237670123456' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class NkapPayPaymentDto {
  @ApiProperty({ description: 'Montant en unité entière (5000 = 5 000 XAF)', example: 5000 })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiPropertyOptional({
    description: 'Devise de règlement. Auto-détectée depuis le pays si omise.',
    example: 'XAF',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Votre référence de commande interne' })
  @IsOptional()
  @IsString()
  merchantReference?: string;

  @ApiPropertyOptional({ description: 'Description affichée au client' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'MOBILE_MONEY ou BANK_CARD. Omettre pour laisser le client choisir.',
    enum: ['MOBILE_MONEY', 'BANK_CARD'],
  })
  @IsOptional()
  @IsIn(['MOBILE_MONEY', 'BANK_CARD'])
  paymentMethod?: 'MOBILE_MONEY' | 'BANK_CARD';

  @ApiPropertyOptional({
    description: 'SDK, DIRECT_API ou STRIPE. Auto-détecté si operator + customerPhone fournis.',
    enum: ['SDK', 'DIRECT_API', 'STRIPE'],
  })
  @IsOptional()
  @IsIn(['SDK', 'DIRECT_API', 'STRIPE'])
  paymentMode?: 'SDK' | 'DIRECT_API' | 'STRIPE';

  @ApiPropertyOptional({ description: 'Code pays ISO 3166-1 alpha-2', example: 'CM' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Code opérateur. Requis si paymentMode = DIRECT_API.',
    example: 'MTN',
  })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({
    description: 'Numéro du client. Requis si paymentMode = DIRECT_API.',
    example: '237670000000',
  })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Infos client', type: NkapPayCustomerInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NkapPayCustomerInfoDto)
  customerInfo?: NkapPayCustomerInfoDto;

  @ApiPropertyOptional({ description: 'URL de redirection après paiement' })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({ description: 'Webhook spécifique à ce paiement' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiPropertyOptional({ description: 'Montant indicatif affiché (jamais débité)', example: 50 })
  @IsOptional()
  @IsNumber()
  displayAmount?: number;

  @ApiPropertyOptional({ description: 'Devise du montant indicatif', example: 'EUR' })
  @IsOptional()
  @IsString()
  displayCurrency?: string;

  @ApiPropertyOptional({ description: 'Métadonnées libres renvoyées dans les webhooks' })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Buy a plan through Nkap Pay. The amount is deliberately absent: it is read
 * from the plan in the database, so the caller cannot choose what to pay.
 */
export class NkapPaySubscriptionDto {
  @ApiProperty({ description: 'Plan acheté', enum: ['STANDARD', 'PRO', 'ENTERPRISE'] })
  @IsIn(['STANDARD', 'PRO', 'ENTERPRISE'])
  planCode: 'STANDARD' | 'PRO' | 'ENTERPRISE';

  @ApiPropertyOptional({ description: 'Périodicité', enum: ['monthly', 'annually'] })
  @IsOptional()
  @IsIn(['monthly', 'annually'])
  billingPeriod?: 'monthly' | 'annually';

  @ApiPropertyOptional({ description: 'Code pays ISO 3166-1 alpha-2', example: 'CM' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Code opérateur Mobile Money', example: 'MTN' })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({ description: 'Numéro du payeur', example: '237670000000' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'MOBILE_MONEY ou BANK_CARD', enum: ['MOBILE_MONEY', 'BANK_CARD'] })
  @IsOptional()
  @IsIn(['MOBILE_MONEY', 'BANK_CARD'])
  paymentMethod?: 'MOBILE_MONEY' | 'BANK_CARD';

  @ApiPropertyOptional({ description: 'URL de retour après paiement' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

/** Buy message credits through Nkap Pay. Priced server-side, like the plans. */
export class NkapPayCreditsDto {
  @ApiProperty({ description: 'Nombre de messages achetés', example: 5000 })
  @IsNumber()
  @Min(1000)
  creditAmount: number;

  @ApiPropertyOptional({ description: 'Code pays ISO 3166-1 alpha-2', example: 'CM' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Code opérateur Mobile Money', example: 'MTN' })
  @IsOptional()
  @IsString()
  operator?: string;

  @ApiPropertyOptional({ description: 'Numéro du payeur', example: '237670000000' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'MOBILE_MONEY ou BANK_CARD', enum: ['MOBILE_MONEY', 'BANK_CARD'] })
  @IsOptional()
  @IsIn(['MOBILE_MONEY', 'BANK_CARD'])
  paymentMethod?: 'MOBILE_MONEY' | 'BANK_CARD';

  @ApiPropertyOptional({ description: 'URL de retour après paiement' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
