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
import { Organization } from './organization.entity';

export enum WebhookEvent {
  MESSAGE_SENT = 'message.sent',
  MESSAGE_DELIVERED = 'message.delivered',
  MESSAGE_READ = 'message.read',
  MESSAGE_FAILED = 'message.failed',
  CAMPAIGN_STARTED = 'campaign.started',
  CAMPAIGN_COMPLETED = 'campaign.completed',
  CAMPAIGN_FAILED = 'campaign.failed',
  CONTACT_VERIFIED = 'contact.verified',
  CONTACT_UNSUBSCRIBED = 'contact.unsubscribed',
}

@Entity('webhook_configs')
@Index(['organizationId', 'url'], { unique: true })
export class WebhookConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column()
  name: string;

  @Column()
  url: string;

  // Secret for signing webhook payloads
  @Column()
  secret: string;

  // Events to subscribe to
  @Column('simple-array')
  events: WebhookEvent[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Custom headers to send with webhook
  @Column('jsonb', { nullable: true })
  headers?: Record<string, string>;

  // Retry configuration
  @Column({ name: 'max_retries', default: 3 })
  maxRetries: number;

  @Column({ name: 'retry_delay', default: 5000 })
  retryDelay: number; // milliseconds

  // Health tracking
  @Column({ name: 'last_triggered_at', nullable: true })
  lastTriggeredAt?: Date;

  @Column({ name: 'last_success_at', nullable: true })
  lastSuccessAt?: Date;

  @Column({ name: 'last_failure_at', nullable: true })
  lastFailureAt?: Date;

  @Column({ name: 'last_error', nullable: true })
  lastError?: string;

  @Column({ name: 'consecutive_failures', default: 0 })
  consecutiveFailures: number;

  @Column({ name: 'total_triggered', default: 0 })
  totalTriggered: number;

  @Column({ name: 'total_success', default: 0 })
  totalSuccess: number;

  @Column({ name: 'total_failures', default: 0 })
  totalFailures: number;

  // Auto-disable after too many failures
  @Column({ name: 'auto_disabled', default: false })
  autoDisabled: boolean;

  @Column({ name: 'auto_disable_threshold', default: 10 })
  autoDisableThreshold: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
