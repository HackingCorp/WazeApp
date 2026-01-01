import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';

export enum MessageCreditStatus {
  ACTIVE = 'active',
  EXHAUSTED = 'exhausted',
  EXPIRED = 'expired',
}

@Entity('message_credits')
@Index(['organizationId', 'status'])
@Index(['expiresAt'])
export class MessageCredit extends BaseEntity {
  @ApiProperty({ description: 'Organization that owns these credits' })
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ApiProperty({ description: 'Total messages purchased in this credit pack' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({ description: 'Messages used from this credit pack' })
  @Column({ type: 'int', default: 0 })
  used: number;

  @ApiProperty({ description: 'Remaining messages in this credit pack' })
  @Column({ type: 'int' })
  remaining: number;

  @ApiProperty({ description: 'Status of the credit pack' })
  @Column({
    type: 'enum',
    enum: MessageCreditStatus,
    default: MessageCreditStatus.ACTIVE,
  })
  status: MessageCreditStatus;

  @ApiProperty({ description: 'When the credit pack expires' })
  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @ApiProperty({ description: 'Price per message in XAF' })
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerMessageXAF: number;

  @ApiProperty({ description: 'Total amount paid in XAF' })
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmountXAF: number;

  @ApiProperty({ description: 'Payment transaction ID' })
  @Column({ nullable: true })
  transactionId: string;

  @ApiProperty({ description: 'Payment Tracking Number from S3P' })
  @Column({ nullable: true })
  ptn: string;

  @ApiProperty({ description: 'Payment method used' })
  @Column({ nullable: true })
  paymentMethod: string;

  @ApiProperty({ description: 'Additional metadata' })
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    paymentProvider?: string;
    phoneNumber?: string;
    invoiceId?: string;
    notes?: string;
  };

  // Helper methods
  get isActive(): boolean {
    return this.status === MessageCreditStatus.ACTIVE &&
           this.remaining > 0 &&
           new Date() < new Date(this.expiresAt);
  }

  get isExpired(): boolean {
    return new Date() >= new Date(this.expiresAt);
  }

  get percentUsed(): number {
    if (this.amount === 0) return 0;
    return Math.round((this.used / this.amount) * 100);
  }
}
