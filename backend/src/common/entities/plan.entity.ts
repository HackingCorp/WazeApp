import {
  Entity,
  Column,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

@Entity('plans')
@Index('IDX_PLAN_CODE', ['code'], { unique: true })
export class Plan extends BaseEntity {
  @ApiProperty({ description: 'Plan code (free, standard, pro, enterprise)' })
  @Column({ unique: true })
  code: string;

  @ApiProperty({ description: 'Plan display name' })
  @Column()
  name: string;

  @ApiProperty({ description: 'Plan description' })
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty({ description: 'Monthly price in XAF (cents)' })
  @Column({ default: 0 })
  priceMonthlyXAF: number;

  @ApiProperty({ description: 'Annual price in XAF (cents) - usually with discount' })
  @Column({ default: 0 })
  priceAnnualXAF: number;

  @ApiProperty({ description: 'Monthly price in USD (cents)' })
  @Column({ default: 0 })
  priceMonthlyUSD: number;

  @ApiProperty({ description: 'Annual price in USD (cents)' })
  @Column({ default: 0 })
  priceAnnualUSD: number;

  // Quotas
  @ApiProperty({ description: 'Max AI agents' })
  @Column({ default: 1 })
  maxAgents: number;

  @ApiProperty({ description: 'Max knowledge bases' })
  @Column({ default: 1 })
  maxKnowledgeBases: number;

  @ApiProperty({ description: 'Max documents per knowledge base' })
  @Column({ default: 10 })
  maxDocumentsPerKb: number;

  @ApiProperty({ description: 'Max storage in bytes' })
  @Column({ type: 'bigint', default: 104857600 }) // 100MB
  maxStorageBytes: number;

  @ApiProperty({ description: 'Max knowledge base characters' })
  @Column({ default: 100000 })
  maxKnowledgeCharacters: number;

  @ApiProperty({ description: 'Max WhatsApp messages per month' })
  @Column({ default: 100 })
  maxWhatsAppMessages: number;

  @ApiProperty({ description: 'Max API requests per month' })
  @Column({ default: 1000 })
  maxApiRequests: number;

  @ApiProperty({ description: 'Max LLM tokens per month' })
  @Column({ default: 50000 })
  maxLlmTokens: number;

  @ApiProperty({ description: 'Max vector searches per month' })
  @Column({ default: 100 })
  maxVectorSearches: number;

  @ApiProperty({ description: 'Max conversations per month' })
  @Column({ default: 50 })
  maxConversations: number;

  @ApiProperty({ description: 'Max file upload size in bytes' })
  @Column({ default: 5242880 }) // 5MB
  maxFileUploadBytes: number;

  @ApiProperty({ description: 'Max broadcast contacts' })
  @Column({ default: 50 })
  maxBroadcastContacts: number;

  @ApiProperty({ description: 'Max message templates' })
  @Column({ default: 3 })
  maxMessageTemplates: number;

  @ApiProperty({ description: 'Max campaigns per month' })
  @Column({ default: 5 })
  maxCampaignsPerMonth: number;

  @ApiProperty({ description: 'Max messages per campaign' })
  @Column({ default: 50 })
  maxMessagesPerCampaign: number;

  // Features
  @ApiProperty({ description: 'Has SSO feature' })
  @Column({ default: false })
  featureSso: boolean;

  @ApiProperty({ description: 'Has webhooks feature' })
  @Column({ default: false })
  featureWebhooks: boolean;

  @ApiProperty({ description: 'Has analytics feature' })
  @Column({ default: false })
  featureAnalytics: boolean;

  @ApiProperty({ description: 'Has API access feature' })
  @Column({ default: false })
  featureApiAccess: boolean;

  @ApiProperty({ description: 'Has white label feature' })
  @Column({ default: false })
  featureWhiteLabel: boolean;

  @ApiProperty({ description: 'Has advanced LLMs feature' })
  @Column({ default: false })
  featureAdvancedLlms: boolean;

  @ApiProperty({ description: 'Has image analysis feature' })
  @Column({ default: false })
  featureImageAnalysis: boolean;

  @ApiProperty({ description: 'Has custom branding feature' })
  @Column({ default: false })
  featureCustomBranding: boolean;

  @ApiProperty({ description: 'Has function calling feature' })
  @Column({ default: false })
  featureFunctionCalling: boolean;

  @ApiProperty({ description: 'Has priority support feature' })
  @Column({ default: false })
  featurePrioritySupport: boolean;

  @ApiProperty({ description: 'Has custom embeddings feature' })
  @Column({ default: false })
  featureCustomEmbeddings: boolean;

  @ApiProperty({ description: 'Has premium vector search feature' })
  @Column({ default: false })
  featurePremiumVectorSearch: boolean;

  @ApiProperty({ description: 'Has scheduled campaigns feature' })
  @Column({ default: false })
  featureScheduledCampaigns: boolean;

  @ApiProperty({ description: 'Plan is active and available for purchase' })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Display order' })
  @Column({ default: 0 })
  displayOrder: number;
}
