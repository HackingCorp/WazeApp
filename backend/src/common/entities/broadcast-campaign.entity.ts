import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Organization } from './organization.entity';
import { MessageTemplate } from './message-template.entity';
import { WhatsAppSession } from './whatsapp-session.entity';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum RecurrenceType {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('broadcast_campaigns')
export class BroadcastCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => WhatsAppSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: WhatsAppSession;

  @Column({ name: 'template_id', nullable: true })
  templateId?: string;

  @ManyToOne(() => MessageTemplate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_id' })
  template?: MessageTemplate;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  @Index()
  status: CampaignStatus;

  // Custom message content (if not using template)
  @Column('jsonb', { name: 'message_content', nullable: true })
  messageContent?: {
    type: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    filename?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
  };

  // Contact filtering
  @Column('jsonb', { name: 'contact_filter', nullable: true })
  contactFilter?: {
    tags?: string[];
    includeUnverified?: boolean;
    customConditions?: Record<string, any>;
  };

  // Specific contact IDs (if selecting manually)
  @Column('simple-array', { name: 'contact_ids', nullable: true })
  contactIds?: string[];

  // Media URLs (for campaigns with uploaded media files)
  @Column('simple-array', { name: 'media_urls', nullable: true })
  mediaUrls?: string[];

  // Scheduling
  @Column({ name: 'scheduled_at', nullable: true })
  scheduledAt?: Date;

  @Column({ name: 'started_at', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt?: Date;

  // Recurrence settings
  @Column({
    type: 'enum',
    enum: RecurrenceType,
    default: RecurrenceType.NONE,
    name: 'recurrence_type',
  })
  recurrenceType: RecurrenceType;

  @Column({ name: 'recurrence_day', nullable: true })
  recurrenceDay?: number; // Day of week (0-6) or day of month (1-31)

  @Column({ name: 'recurrence_time', nullable: true })
  recurrenceTime?: string; // HH:MM format

  @Column({ name: 'recurrence_end_date', nullable: true })
  recurrenceEndDate?: Date;

  @Column({ name: 'next_run_at', nullable: true })
  nextRunAt?: Date;

  // Statistics
  @Column('jsonb', { default: {} })
  stats: {
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };

  // Rate limiting
  @Column({ name: 'delay_between_messages', default: 3000 })
  delayBetweenMessages: number; // milliseconds

  @Column({ name: 'messages_per_batch', default: 50 })
  messagesPerBatch: number;

  @Column({ name: 'batch_delay', default: 60000 })
  batchDelay: number; // milliseconds between batches

  // Error tracking
  @Column({ name: 'last_error', nullable: true })
  lastError?: string;

  @Column({ name: 'error_count', default: 0 })
  errorCount: number;

  // Created by (for audit)
  @Column({ name: 'created_by', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
