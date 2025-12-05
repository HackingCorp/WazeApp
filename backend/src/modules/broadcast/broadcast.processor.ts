import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

interface SendMessageJob {
  messageId: string;
  campaignId: string;
  organizationId: string;
}

@Processor('broadcast')
export class BroadcastProcessor {
  private readonly logger = new Logger(BroadcastProcessor.name);

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
  ) {}

  @Process('send-message')
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

    // Skip if campaign is no longer running
    if (campaign.status !== CampaignStatus.RUNNING) {
      message.status = BroadcastMessageStatus.CANCELLED;
      await this.messageRepository.save(message);
      return;
    }

    // Update status to sending
    message.status = BroadcastMessageStatus.SENDING;
    message.queuedAt = new Date();
    await this.messageRepository.save(message);

    try {
      // Prepare message content
      const messageContent = await this.prepareMessageContent(
        campaign,
        contact,
      );

      // Send via Baileys
      const result = await this.baileysService.sendMessage(campaign.sessionId, {
        to: contact.phoneNumber,
        message: messageContent.text || messageContent.caption || '',
        type: messageContent.type as any,
        mediaUrl: messageContent.mediaUrl,
        caption: messageContent.caption,
        filename: messageContent.filename,
      });

      // Update message status
      message.status = BroadcastMessageStatus.SENT;
      message.sentAt = new Date();
      message.whatsappMessageId = result.messageId;
      message.renderedContent = messageContent.text || messageContent.caption;
      await this.messageRepository.save(message);

      // Update campaign stats
      await this.updateCampaignStats(campaign.id);

      // Trigger webhook
      await this.webhookService.trigger(organizationId, 'message.sent', {
        messageId: message.id,
        campaignId: campaign.id,
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        whatsappMessageId: result.messageId,
      });

      this.logger.debug(`Message sent to ${contact.phoneNumber}`);
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

      // Throw to trigger retry if attempts remaining
      if (message.retryCount < message.maxRetries) {
        throw error;
      }
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
}
