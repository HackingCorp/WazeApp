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

@Entity('broadcast_contacts')
@Index(['organizationId', 'phoneNumber'], { unique: true })
export class BroadcastContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'phone_number' })
  @Index()
  phoneNumber: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  company?: string;

  @Column('simple-array', { nullable: true })
  tags?: string[];

  @Column('jsonb', { nullable: true, name: 'custom_fields' })
  customFields?: Record<string, any>;

  @Column({ name: 'is_valid_whatsapp', nullable: true })
  isValidWhatsApp?: boolean;

  @Column({ name: 'whatsapp_verified_at', nullable: true })
  whatsappVerifiedAt?: Date;

  @Column({ name: 'is_subscribed', default: true })
  isSubscribed: boolean;

  @Column({ name: 'unsubscribed_at', nullable: true })
  unsubscribedAt?: Date;

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
