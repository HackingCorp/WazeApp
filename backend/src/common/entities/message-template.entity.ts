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

export enum TemplateType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
}

export enum TemplateCategory {
  WELCOME = 'welcome',
  PROMOTION = 'promotion',
  REMINDER = 'reminder',
  NOTIFICATION = 'notification',
  FOLLOW_UP = 'follow_up',
  THANK_YOU = 'thank_you',
  CUSTOM = 'custom',
}

@Entity('message_templates')
@Index(['organizationId', 'name'], { unique: true })
export class MessageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TemplateType,
    default: TemplateType.TEXT,
  })
  type: TemplateType;

  @Column({
    type: 'enum',
    enum: TemplateCategory,
    default: TemplateCategory.CUSTOM,
  })
  category: TemplateCategory;

  @Column('text')
  content: string;

  @Column({ name: 'media_url', nullable: true })
  mediaUrl?: string;

  @Column({ nullable: true })
  caption?: string;

  @Column({ nullable: true })
  filename?: string;

  // For location type
  @Column('decimal', { precision: 10, scale: 8, nullable: true })
  latitude?: number;

  @Column('decimal', { precision: 11, scale: 8, nullable: true })
  longitude?: number;

  @Column({ name: 'location_name', nullable: true })
  locationName?: string;

  // For contact type
  @Column('jsonb', { name: 'contact_info', nullable: true })
  contactInfo?: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
  };

  // Variables that can be used in the template
  @Column('simple-array', { nullable: true })
  variables?: string[];

  // Is this a system-provided template
  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  // Is the template active
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Usage statistics
  @Column({ name: 'usage_count', default: 0 })
  usageCount: number;

  @Column({ name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
