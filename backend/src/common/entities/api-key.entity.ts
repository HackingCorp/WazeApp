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

export enum ApiKeyPermission {
  BROADCAST_READ = 'broadcast:read',
  BROADCAST_WRITE = 'broadcast:write',
  CONTACTS_READ = 'contacts:read',
  CONTACTS_WRITE = 'contacts:write',
  TEMPLATES_READ = 'templates:read',
  TEMPLATES_WRITE = 'templates:write',
  CAMPAIGNS_READ = 'campaigns:read',
  CAMPAIGNS_WRITE = 'campaigns:write',
  SEND_MESSAGE = 'send:message',
  WEBHOOKS_MANAGE = 'webhooks:manage',
}

@Entity('api_keys')
@Index(['keyHash'], { unique: true })
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  // We store only the hash of the key
  // The actual key is shown only once at creation
  @Column({ name: 'key_hash' })
  keyHash: string;

  // Key prefix for identification (e.g., "wz_live_")
  @Column({ name: 'key_prefix' })
  keyPrefix: string;

  // Permissions granted to this key
  @Column('simple-array')
  permissions: ApiKeyPermission[];

  // Is the key active
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Optional expiration
  @Column({ name: 'expires_at', nullable: true })
  expiresAt?: Date;

  // Rate limiting
  @Column({ name: 'rate_limit_per_minute', default: 60 })
  rateLimitPerMinute: number;

  @Column({ name: 'rate_limit_per_day', default: 10000 })
  rateLimitPerDay: number;

  // Usage tracking
  @Column({ name: 'last_used_at', nullable: true })
  lastUsedAt?: Date;

  @Column({ name: 'last_used_ip', nullable: true })
  lastUsedIp?: string;

  @Column({ name: 'total_requests', default: 0 })
  totalRequests: number;

  // Allowed IPs (optional whitelist)
  @Column('simple-array', { name: 'allowed_ips', nullable: true })
  allowedIps?: string[];

  // Created by user
  @Column({ name: 'created_by', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
