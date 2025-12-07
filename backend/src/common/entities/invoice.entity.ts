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
import { Subscription } from './subscription.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

@Entity('invoices')
@Index('IDX_INVOICE_ORG', ['organizationId'])
@Index('IDX_INVOICE_STATUS', ['status'])
@Index('IDX_INVOICE_DUE_DATE', ['dueDate'])
export class Invoice extends BaseEntity {
  @ApiProperty({ description: 'Invoice number (unique)' })
  @Column({ unique: true })
  invoiceNumber: string;

  @ApiProperty({ description: 'Invoice status', enum: InvoiceStatus })
  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING,
  })
  status: InvoiceStatus;

  @ApiProperty({ description: 'Amount in cents' })
  @Column()
  amountInCents: number;

  @ApiProperty({ description: 'Currency' })
  @Column({ default: 'XAF' })
  currency: string;

  @ApiProperty({ description: 'Invoice description' })
  @Column()
  description: string;

  @ApiProperty({ description: 'Billing period start' })
  @Column({ type: 'timestamp with time zone' })
  periodStart: Date;

  @ApiProperty({ description: 'Billing period end' })
  @Column({ type: 'timestamp with time zone' })
  periodEnd: Date;

  @ApiProperty({ description: 'Due date' })
  @Column({ type: 'timestamp with time zone' })
  dueDate: Date;

  @ApiProperty({ description: 'Paid date', required: false })
  @Column({ type: 'timestamp with time zone', nullable: true })
  paidAt?: Date;

  @ApiProperty({ description: 'Payment method used', required: false })
  @Column({ nullable: true })
  paymentMethod?: string;

  @ApiProperty({ description: 'Payment reference/transaction ID', required: false })
  @Column({ nullable: true })
  paymentReference?: string;

  @ApiProperty({ description: 'Line items' })
  @Column({ type: 'jsonb', default: [] })
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];

  @ApiProperty({ description: 'Tax amount in cents' })
  @Column({ default: 0 })
  taxAmountInCents: number;

  @ApiProperty({ description: 'Discount amount in cents' })
  @Column({ default: 0 })
  discountAmountInCents: number;

  @ApiProperty({ description: 'Total amount in cents (after tax and discount)' })
  @Column()
  totalAmountInCents: number;

  @ApiProperty({ description: 'Reminder sent count' })
  @Column({ default: 0 })
  remindersSent: number;

  @ApiProperty({ description: 'Last reminder sent date', required: false })
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastReminderSentAt?: Date;

  @ApiProperty({ description: 'Invoice metadata' })
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Relationships
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ name: 'organizationId' })
  organizationId: string;

  @ManyToOne(() => Subscription, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'subscriptionId' })
  subscription?: Subscription;

  @Column({ name: 'subscriptionId', nullable: true })
  subscriptionId?: string;

  // Virtual properties
  @ApiProperty({ description: 'Is invoice overdue' })
  get isOverdue(): boolean {
    return (
      this.status === InvoiceStatus.PENDING &&
      this.dueDate < new Date()
    );
  }

  @ApiProperty({ description: 'Days until due' })
  get daysUntilDue(): number {
    const now = new Date();
    const diffTime = this.dueDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  @ApiProperty({ description: 'Formatted amount' })
  get formattedAmount(): string {
    const amount = this.totalAmountInCents / 100;
    return `${amount.toLocaleString()} ${this.currency}`;
  }
}
