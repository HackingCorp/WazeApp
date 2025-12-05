import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BroadcastCampaign } from './broadcast-campaign.entity';
import { BroadcastContact } from './broadcast-contact.entity';

export enum BroadcastMessageStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('broadcast_messages')
@Index(['campaignId', 'status'])
@Index(['contactId'])
export class BroadcastMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id' })
  campaignId: string;

  @ManyToOne(() => BroadcastCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: BroadcastCampaign;

  @Column({ name: 'contact_id' })
  contactId: string;

  @ManyToOne(() => BroadcastContact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: BroadcastContact;

  @Column({ name: 'phone_number' })
  phoneNumber: string;

  @Column({
    type: 'enum',
    enum: BroadcastMessageStatus,
    default: BroadcastMessageStatus.PENDING,
  })
  @Index()
  status: BroadcastMessageStatus;

  // WhatsApp message ID returned by Baileys
  @Column({ name: 'whatsapp_message_id', nullable: true })
  whatsappMessageId?: string;

  // The actual rendered message content (with variables replaced)
  @Column('text', { name: 'rendered_content', nullable: true })
  renderedContent?: string;

  // Timestamps
  @Column({ name: 'queued_at', nullable: true })
  queuedAt?: Date;

  @Column({ name: 'sent_at', nullable: true })
  sentAt?: Date;

  @Column({ name: 'delivered_at', nullable: true })
  deliveredAt?: Date;

  @Column({ name: 'read_at', nullable: true })
  readAt?: Date;

  @Column({ name: 'failed_at', nullable: true })
  failedAt?: Date;

  // Error details
  @Column({ name: 'error_message', nullable: true })
  errorMessage?: string;

  @Column({ name: 'error_code', nullable: true })
  errorCode?: string;

  // Retry tracking
  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'next_retry_at', nullable: true })
  nextRetryAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
