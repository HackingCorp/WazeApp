import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { join } from 'path';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import {
  BroadcastMessage,
  BroadcastCampaign,
  BroadcastContact,
  MessageTemplate,
  BroadcastMessageStatus,
  CampaignStatus,
} from '../../common/entities';
import { BaileysService } from '../whatsapp/baileys.service';
import { TemplateService } from './template.service';
import { WebhookService } from './webhook.service';
import { CampaignService } from './campaign.service';

interface SendMessageJob {
  messageId: string;
  campaignId: string;
  organizationId: string;
}

interface ExternalSendJob {
  sessionId: string;
  organizationId: string;
  messageContent: {
    to: string;
    message: string;
    type: string;
    mediaUrl?: string;
    caption?: string;
    filename?: string;
  };
}

@Processor('broadcast')
export class BroadcastProcessor {
  private readonly logger = new Logger(BroadcastProcessor.name);
  private readonly apiUrl: string;
  private readonly redis: Redis;
  private readonly DEDUP_TTL_SECONDS = 300; // 5 minutes

  // Cache for daily quota checks to avoid querying on every message
  private quotaCache: Map<string, { sentToday: number; limit: number; checkedAt: number }> = new Map();
  private readonly QUOTA_CACHE_TTL_MS = 30_000; // 30 seconds
  private messageCounter: Map<string, number> = new Map();

  constructor(
    @InjectRepository(BroadcastMessage)
    private messageRepository: Repository<BroadcastMessage>,
    @InjectRepository(BroadcastCampaign)
    private campaignRepository: Repository<BroadcastCampaign>,
    @InjectRepository(BroadcastContact)
    private contactRepository: Repository<BroadcastContact>,
    @InjectRepository(MessageTemplate)
    private templateRepository: Repository<MessageTemplate>,
    private baileysService: BaileysService,
    private templateService: TemplateService,
    private webhookService: WebhookService,
    private configService: ConfigService,
    private campaignService: CampaignService,
    private eventEmitter: EventEmitter2,
  ) {
    this.apiUrl = this.configService.get('API_URL') || 'http://localhost:3100';
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  private async isSendDuplicate(to: string, message: string): Promise<boolean> {
    const hash = crypto.createHash('sha256').update(`${to}:${message || ''}`).digest('hex');
    const exists = await this.redis.exists(`dedup:send:${hash}`);
    return exists === 1;
  }

  private async markSendDone(to: string, message: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(`${to}:${message || ''}`).digest('hex');
    await this.redis.set(`dedup:send:${hash}`, '1', 'EX', this.DEDUP_TTL_SECONDS);
  }

  @Process({ name: 'send-message', concurrency: 5 })
  async handleSendMessage(job: Job<SendMessageJob>): Promise<void> {
    const { messageId, campaignId, organizationId } = job.data;

    // Get message
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['contact', 'campaign', 'campaign.template'],
    });

    if (!message) {
      this.logger.warn(`Message ${messageId} not found`);
      return;
    }

    // Skip if already processed or cancelled
    if (
      message.status !== BroadcastMessageStatus.PENDING &&
      message.status !== BroadcastMessageStatus.QUEUED
    ) {
      return;
    }

    const campaign = message.campaign;
    const contact = message.contact;

    if (!campaign || !contact) {
      this.logger.error(
        `Message ${messageId} has missing relations — campaign: ${!!campaign}, contact: ${!!contact}`,
      );
      message.status = BroadcastMessageStatus.FAILED;
      message.failedAt = new Date();
      message.errorMessage = 'Missing campaign or contact relation';
      message.errorCode = 'MISSING_RELATION';
      await this.messageRepository.save(message);
      return;
    }

    // Skip if campaign is no longer running
    if (campaign.status !== CampaignStatus.RUNNING) {
      message.status = BroadcastMessageStatus.CANCELLED;
      await this.messageRepository.save(message);
      return;
    }

    // Check daily message quota (every 10th message or when cache is stale)
    const quotaExceeded = await this.isDailyQuotaExceeded(organizationId);
    if (quotaExceeded) {
      message.status = BroadcastMessageStatus.FAILED;
      message.failedAt = new Date();
      message.errorMessage = 'Daily message quota exceeded';
      message.errorCode = 'QUOTA_EXCEEDED';
      await this.messageRepository.save(message);
      await this.updateCampaignStats(campaign.id);
      return;
    }

    // Update status to sending
    message.status = BroadcastMessageStatus.SENDING;
    message.queuedAt = new Date();
    await this.messageRepository.save(message);

    try {
      // LID-only contacts (WhatsApp never revealed their phone number) are
      // stored as lid_<digits>: address them directly by their LID JID —
      // there is no phone number to normalise.
      const lidMatch = contact.phoneNumber.match(/^lid_?(\d+)$/);
      let phoneNumber: string;
      if (lidMatch) {
        phoneNumber = `${lidMatch[1]}@lid`;
      } else {
        // Format phone number with country code
        phoneNumber = contact.phoneNumber.replace(/[\s\-\+\(\)]/g, '');

        // Add country code if missing - use configurable default (defaults to '237' for Cameroon)
        const defaultCountryCode = this.configService.get('DEFAULT_COUNTRY_CODE') || '237';
        if (phoneNumber.startsWith('0')) {
          phoneNumber = defaultCountryCode + phoneNumber.substring(1);
        } else if (phoneNumber.length < 10) {
          phoneNumber = defaultCountryCode + phoneNumber;
        }
      }

      // Check if campaign has custom media files uploaded
      const hasCustomMedia = campaign.mediaUrls && campaign.mediaUrls.length > 0;
      let lastMessageId = '';

      // Prepare content once to avoid double calls (and double template usage increment)
      const preparedContent = await this.prepareMessageContent(campaign, contact);

      if (hasCustomMedia) {
        // Send each uploaded media as a separate message
        for (let i = 0; i < campaign.mediaUrls.length; i++) {
          let mediaUrl = campaign.mediaUrls[i];
          const isLastMedia = i === campaign.mediaUrls.length - 1;

          // Convert relative path to full URL if needed
          if (mediaUrl.startsWith('/uploads/')) {
            mediaUrl = `${this.apiUrl}${mediaUrl}`;
          }

          // Determine media type from URL extension
          const extension = mediaUrl.split('.').pop()?.toLowerCase() || '';
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension);
          const isVideo = ['mp4', 'mov', 'avi'].includes(extension);
          const isDocument = ['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(extension);

          const mediaType = isImage ? 'image' : isVideo ? 'video' : isDocument ? 'document' : 'image';

          // Only add caption to the last media (or first if only one)
          const caption = isLastMedia ? (preparedContent.caption || preparedContent.text || '') : '';

          this.logger.debug(`Sending media ${i + 1}/${campaign.mediaUrls.length}: ${mediaUrl} (type: ${mediaType})`);

          const result = await this.baileysService.sendMessage(campaign.sessionId, {
            to: phoneNumber,
            message: caption,
            type: mediaType,
            mediaUrl: mediaUrl,
            caption: caption,
          });

          lastMessageId = result?.messageId || '';

          // Small delay between multiple media messages
          if (i < campaign.mediaUrls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        this.logger.debug(`Sent ${campaign.mediaUrls.length} media files to ${phoneNumber}`);
      } else {
        // Standard single message flow
        const result = await this.baileysService.sendMessage(campaign.sessionId, {
          to: phoneNumber,
          message: preparedContent.text || preparedContent.caption || '',
          type: preparedContent.type,
          mediaUrl: preparedContent.mediaUrl,
          caption: preparedContent.caption,
          filename: preparedContent.filename,
        });

        lastMessageId = result?.messageId || '';
        this.logger.debug(`Message sent to ${phoneNumber} (original: ${contact.phoneNumber})`);
      }

      // Update message status - reuse preparedContent instead of calling prepareMessageContent() again
      message.status = BroadcastMessageStatus.SENT;
      message.sentAt = new Date();
      message.whatsappMessageId = lastMessageId;
      message.renderedContent = hasCustomMedia
        ? `[${campaign.mediaUrls.length} media files]`
        : preparedContent.text || '';
      await this.messageRepository.save(message);

      // Update campaign stats
      await this.updateCampaignStats(campaign.id);

      // Trigger webhook
      await this.webhookService.trigger(organizationId, 'message.sent', {
        messageId: message.id,
        campaignId: campaign.id,
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        whatsappMessageId: lastMessageId,
        mediaCount: hasCustomMedia ? campaign.mediaUrls.length : 1,
      });

      // Emit Socket.io event for real-time UI updates
      this.eventEmitter.emit('broadcast.message.sent', {
        organizationId,
        campaignId: campaign.id,
        messageId: message.id,
        status: BroadcastMessageStatus.SENT,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send message to ${contact.phoneNumber}:`,
        error,
      );

      message.status = BroadcastMessageStatus.FAILED;
      message.failedAt = new Date();
      message.errorMessage = error.message;
      message.errorCode = error.code || 'UNKNOWN';
      message.retryCount++;
      await this.messageRepository.save(message);

      // Update campaign stats
      await this.updateCampaignStats(campaign.id);

      // Trigger webhook
      await this.webhookService.trigger(organizationId, 'message.failed', {
        messageId: message.id,
        campaignId: campaign.id,
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        error: error.message,
      });

      // Emit Socket.io event for real-time UI updates
      this.eventEmitter.emit('broadcast.message.failed', {
        organizationId,
        campaignId: campaign.id,
        messageId: message.id,
        error: error.message,
      });

      // Throw to trigger retry if attempts remaining
      if (message.retryCount < message.maxRetries) {
        throw error;
      }
    }
  }

  @Process({ name: 'send-external', concurrency: 3 })
  async handleSendExternal(job: Job<ExternalSendJob>): Promise<void> {
    const { sessionId, organizationId, messageContent } = job.data;

    this.logger.log(`📤 Processing external message to ${messageContent.to} (job ${job.id})`);

    try {
      // Last-mile dedup check: prevent duplicate sends on Bull retry
      if (await this.isSendDuplicate(messageContent.to, messageContent.message)) {
        this.logger.warn(`⚠️ Duplicate external message to ${messageContent.to} detected in processor — skipping`);
        return;
      }

      const result = await this.baileysService.sendMessage(sessionId, {
        to: messageContent.to,
        message: messageContent.message,
        type: messageContent.type,
        mediaUrl: messageContent.mediaUrl,
        caption: messageContent.caption,
        filename: messageContent.filename,
      });

      // Mark as sent to prevent duplicate on retry
      await this.markSendDone(messageContent.to, messageContent.message);

      this.logger.log(`✅ External message sent to ${messageContent.to} (messageId: ${result?.messageId})`);

      // Trigger webhook
      await this.webhookService.trigger(organizationId, 'message.sent', {
        recipient: messageContent.to,
        messageId: result?.messageId || '',
        status: result?.status || 'sent',
        source: 'external-api',
      });
    } catch (error) {
      this.logger.error(`❌ Failed to send external message to ${messageContent.to}:`, error);

      // Re-throw to trigger Bull retry mechanism
      throw error;
    }
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<SendMessageJob>): Promise<void> {
    const { campaignId, organizationId } = job.data;

    // Check if campaign is complete
    const pendingCount = await this.messageRepository.count({
      where: {
        campaignId,
        status: BroadcastMessageStatus.PENDING,
      },
    });

    const sendingCount = await this.messageRepository.count({
      where: {
        campaignId,
        status: BroadcastMessageStatus.SENDING,
      },
    });

    const queuedCount = await this.messageRepository.count({
      where: {
        campaignId,
        status: BroadcastMessageStatus.QUEUED,
      },
    });

    if (pendingCount === 0 && sendingCount === 0 && queuedCount === 0) {
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (campaign && campaign.status === CampaignStatus.RUNNING) {
        campaign.status = CampaignStatus.COMPLETED;
        campaign.completedAt = new Date();
        await this.campaignRepository.save(campaign);

        // Trigger webhook
        await this.webhookService.trigger(organizationId, 'campaign.completed', {
          campaignId,
          name: campaign.name,
          stats: campaign.stats,
        });

        // Emit Socket.io event for real-time UI updates
        this.eventEmitter.emit('broadcast.campaign.completed', {
          organizationId,
          campaignId,
          stats: campaign.stats,
        });

        this.logger.log(`Campaign ${campaign.name} completed`);
      }
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<SendMessageJob>, error: Error): Promise<void> {
    this.logger.error(
      `Job ${job.id} failed for message ${job.data.messageId}:`,
      error,
    );
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Check if the daily message quota is exceeded for an organization.
   * Uses a cache to avoid expensive DB queries on every message.
   * The cache is refreshed every 30 seconds or every 10th message.
   */
  private async isDailyQuotaExceeded(organizationId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.quotaCache.get(organizationId);
    const counter = (this.messageCounter.get(organizationId) || 0) + 1;
    this.messageCounter.set(organizationId, counter);

    // Check cache: refresh every 30s or every 10th message
    const needsRefresh = !cached
      || (now - cached.checkedAt) > this.QUOTA_CACHE_TTL_MS
      || counter % 10 === 0;

    if (needsRefresh) {
      try {
        const dailyStats = await this.campaignService.getDailyStats(organizationId);
        this.quotaCache.set(organizationId, {
          sentToday: dailyStats.messagesSentToday,
          limit: dailyStats.messagesLimit,
          checkedAt: now,
        });

        // -1 means unlimited
        if (dailyStats.messagesLimit === -1) return false;
        return dailyStats.messagesSentToday >= dailyStats.messagesLimit;
      } catch (error) {
        this.logger.error(`Failed to check daily quota for org ${organizationId}:`, error);
        // On error, allow sending to avoid blocking legitimate messages
        return false;
      }
    }

    // Use cached values (-1 means unlimited)
    if (cached.limit === -1) return false;
    return cached.sentToday >= cached.limit;
  }

  private async prepareMessageContent(
    campaign: BroadcastCampaign,
    contact: BroadcastContact,
  ): Promise<{
    type: string;
    text?: string;
    mediaUrl?: string;
    caption?: string;
    filename?: string;
    latitude?: number;
    longitude?: number;
  }> {
    // Build variables map from contact
    const variables: Record<string, string> = {
      nom: contact.name,
      name: contact.name,
      prenom: contact.name.split(' ')[0] || contact.name,
      firstname: contact.name.split(' ')[0] || contact.name,
      telephone: contact.phoneNumber,
      phone: contact.phoneNumber,
      email: contact.email || '',
      entreprise: contact.company || '',
      company: contact.company || '',
      date: new Date().toLocaleDateString('fr-FR'),
      heure: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      ...(contact.customFields || {}),
    };

    if (campaign.template) {
      const rendered = this.templateService.renderTemplate(
        campaign.template,
        variables,
      );

      // Increment template usage
      await this.templateService.incrementUsage(campaign.template.id);

      return {
        type: campaign.template.type,
        text: campaign.template.type === 'text' ? rendered.content : undefined,
        mediaUrl: campaign.template.mediaUrl,
        caption: rendered.caption || rendered.content,
        filename: campaign.template.filename,
        latitude: campaign.template.latitude,
        longitude: campaign.template.longitude,
      };
    }

    // Use custom message content
    if (campaign.messageContent) {
      let text = campaign.messageContent.text || '';
      let caption = campaign.messageContent.caption || '';

      // Replace variables
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{${key}\\}`, 'gi');
        text = text.replace(regex, value);
        caption = caption.replace(regex, value);
      }

      return {
        type: campaign.messageContent.type || 'text',
        text,
        mediaUrl: campaign.messageContent.mediaUrl,
        caption,
        filename: campaign.messageContent.filename,
        latitude: campaign.messageContent.latitude,
        longitude: campaign.messageContent.longitude,
      };
    }

    throw new Error('No message content or template specified');
  }

  private async updateCampaignStats(campaignId: string): Promise<void> {
    const stats = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('message.campaignId = :campaignId', { campaignId })
      .groupBy('message.status')
      .getRawMany();

    const result = {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };

    for (const stat of stats) {
      result.total += parseInt(stat.count);
      switch (stat.status) {
        case BroadcastMessageStatus.PENDING:
        case BroadcastMessageStatus.QUEUED:
        case BroadcastMessageStatus.SENDING:
        case BroadcastMessageStatus.PAUSED:
          result.pending += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.SENT:
          result.sent += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.DELIVERED:
          result.delivered += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.READ:
          result.read += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.FAILED:
        case BroadcastMessageStatus.CANCELLED:
          result.failed += parseInt(stat.count);
          break;
      }
    }

    await this.campaignRepository.update(campaignId, { stats: result });
  }

  // Delivery receipt tracking is handled by BroadcastDeliveryService
  // which listens to 'whatsapp.message.update' events and updates
  // BroadcastMessage statuses from SENT to DELIVERED/READ.
}
