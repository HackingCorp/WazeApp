import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual, Not } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BroadcastCampaign,
  BroadcastMessage,
  BroadcastContact,
  MessageTemplate,
  Subscription,
  CampaignStatus,
  BroadcastMessageStatus,
  RecurrenceType,
} from '../../common/entities';
import { SubscriptionStatus } from '../../common/enums';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaileysService } from '../whatsapp/baileys.service';
import { TemplateService } from './template.service';
import { CreateCampaignDto, UpdateCampaignDto, CampaignStatsDto } from './dto/broadcast.dto';
import { WebhookService } from './webhook.service';
import { PlanService } from '../subscriptions/plan.service';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(BroadcastCampaign)
    private campaignRepository: Repository<BroadcastCampaign>,
    @InjectRepository(BroadcastMessage)
    private messageRepository: Repository<BroadcastMessage>,
    @InjectRepository(BroadcastContact)
    private contactRepository: Repository<BroadcastContact>,
    @InjectRepository(MessageTemplate)
    private templateRepository: Repository<MessageTemplate>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectQueue('broadcast')
    private broadcastQueue: Queue,
    private baileysService: BaileysService,
    private templateService: TemplateService,
    private webhookService: WebhookService,
    private eventEmitter: EventEmitter2,
    private planService: PlanService,
  ) {}

  /**
   * Get campaign limits based on subscription plan (from database via PlanService)
   */
  async getCampaignLimits(organizationId: string): Promise<{
    campaignsPerMonth: number;
    messagesPerCampaign: number;
  }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    const plan = (subscription?.plan || 'free').toLowerCase();
    const planData = this.planService.getPlanByCode(plan);

    if (!planData) {
      return { campaignsPerMonth: 5, messagesPerCampaign: 50 };
    }

    return {
      campaignsPerMonth: planData.maxCampaignsPerMonth,
      messagesPerCampaign: planData.maxMessagesPerCampaign,
    };
  }

  /**
   * Check if organization can create a campaign
   */
  async canCreateCampaign(organizationId: string): Promise<boolean> {
    const limits = await this.getCampaignLimits(organizationId);

    // -1 means unlimited
    if (limits.campaignsPerMonth === -1) {
      return true;
    }

    // Count campaigns this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const campaignsThisMonth = await this.campaignRepository.count({
      where: {
        organizationId,
        createdAt: MoreThanOrEqual(startOfMonth),
      },
    });

    this.logger.debug(`Campaign limit check: ${campaignsThisMonth}/${limits.campaignsPerMonth} campaigns this month`);

    return campaignsThisMonth < limits.campaignsPerMonth;
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    organizationId: string,
    userId: string,
    dto: CreateCampaignDto,
    mediaUrls?: string[],
  ): Promise<BroadcastCampaign> {
    // Check limits
    const canCreate = await this.canCreateCampaign(organizationId);
    if (!canCreate) {
      throw new BadRequestException(
        'Campaign limit reached for this month. Upgrade your plan.',
      );
    }

    // Validate template if provided
    if (dto.templateId) {
      const template = await this.templateService.getTemplate(
        organizationId,
        dto.templateId,
      );
      if (!template) {
        throw new BadRequestException('Template not found');
      }
    }

    // Get contact count
    let totalContacts = 0;
    if (dto.contactIds && dto.contactIds.length > 0) {
      totalContacts = dto.contactIds.length;
    } else {
      const contactQuery = this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.organizationId = :organizationId', { organizationId })
        .andWhere('contact.isSubscribed = true');

      if (dto.contactFilter?.tags && dto.contactFilter.tags.length > 0) {
        contactQuery.andWhere('contact.tags && :tags', {
          tags: dto.contactFilter.tags,
        });
      }

      if (!dto.contactFilter?.includeUnverified) {
        contactQuery.andWhere('contact.isValidWhatsApp = true');
      }

      totalContacts = await contactQuery.getCount();
    }

    if (totalContacts === 0) {
      throw new BadRequestException('No contacts match the selected criteria');
    }

    const campaign = this.campaignRepository.create({
      organizationId,
      sessionId: dto.sessionId,
      templateId: dto.templateId,
      name: dto.name,
      description: dto.description,
      messageContent: dto.messageContent,
      contactFilter: dto.contactFilter,
      contactIds: dto.contactIds,
      mediaUrls: mediaUrls && mediaUrls.length > 0 ? mediaUrls : undefined,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      recurrenceType: dto.recurrenceType || RecurrenceType.NONE,
      recurrenceDay: dto.recurrenceDay,
      recurrenceTime: dto.recurrenceTime,
      recurrenceEndDate: dto.recurrenceEndDate
        ? new Date(dto.recurrenceEndDate)
        : null,
      delayBetweenMessages: dto.delayBetweenMessages || 3000,
      createdBy: userId,
      status: dto.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      stats: {
        total: totalContacts,
        pending: totalContacts,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      },
    });

    const saved = await this.campaignRepository.save(campaign);

    // Calculate next run for recurring campaigns
    if (dto.recurrenceType && dto.recurrenceType !== RecurrenceType.NONE) {
      saved.nextRunAt = this.calculateNextRun(saved);
      await this.campaignRepository.save(saved);
    }

    return saved;
  }

  /**
   * Get all campaigns for organization
   */
  async getCampaigns(
    organizationId: string,
    status?: CampaignStatus,
  ): Promise<BroadcastCampaign[]> {
    const query = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.template', 'template')
      .where('campaign.organizationId = :organizationId', { organizationId });

    if (status) {
      query.andWhere('campaign.status = :status', { status });
    }

    return query.orderBy('campaign.createdAt', 'DESC').getMany();
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, organizationId },
      relations: ['template'],
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  /**
   * Update campaign
   */
  async updateCampaign(
    organizationId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Cannot update a campaign that has started');
    }

    // Only allow updating specific fields
    const allowedFields = ['name', 'description', 'scheduledAt', 'delayBetweenMessages'];
    for (const field of allowedFields) {
      if (dto[field] !== undefined) {
        campaign[field] = dto[field];
      }
    }
    return this.campaignRepository.save(campaign);
  }

  /**
   * Start a campaign
   */
  async startCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    // Idempotency guard: if campaign is already RUNNING and has messages, return early
    if (campaign.status === CampaignStatus.RUNNING) {
      const existingMessageCount = await this.messageRepository.count({
        where: { campaignId: campaign.id },
      });
      if (existingMessageCount > 0) {
        this.logger.warn(
          `Campaign ${campaign.name} is already running with ${existingMessageCount} messages, skipping duplicate start`,
        );
        return campaign;
      }
    }

    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be started');
    }

    // Check if messages already exist for this campaign (double-start protection)
    const existingMessages = await this.messageRepository.count({
      where: { campaignId: campaign.id },
    });
    if (existingMessages > 0) {
      this.logger.warn(
        `Campaign ${campaign.name} already has ${existingMessages} messages, skipping duplicate creation`,
      );
      throw new BadRequestException('Campaign messages already exist. Cannot start again.');
    }

    // Get contacts
    const contacts = await this.getContactsForCampaign(campaign);

    if (contacts.length === 0) {
      throw new BadRequestException('No contacts to send to');
    }

    // Check maxMessagesPerCampaign limit
    const limits = await this.getCampaignLimits(organizationId);
    if (limits.messagesPerCampaign !== -1 && contacts.length > limits.messagesPerCampaign) {
      throw new BadRequestException(
        `Campaign exceeds the message limit (${contacts.length} contacts, max ${limits.messagesPerCampaign}). Upgrade your plan or reduce the number of recipients.`,
      );
    }

    // Create message records
    const messages = contacts.map((contact) =>
      this.messageRepository.create({
        campaignId: campaign.id,
        contactId: contact.id,
        phoneNumber: contact.phoneNumber,
        status: BroadcastMessageStatus.PENDING,
      }),
    );

    await this.messageRepository.save(messages);

    // Update campaign status
    campaign.status = CampaignStatus.RUNNING;
    campaign.startedAt = new Date();
    campaign.stats = {
      ...campaign.stats,
      total: contacts.length,
      pending: contacts.length,
    };

    await this.campaignRepository.save(campaign);

    // Add messages to queue
    for (const message of messages) {
      await this.broadcastQueue.add(
        'send-message',
        {
          messageId: message.id,
          campaignId: campaign.id,
          organizationId,
        },
        {
          delay: messages.indexOf(message) * campaign.delayBetweenMessages,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }

    // Notify via webhook
    await this.webhookService.trigger(organizationId, 'campaign.started', {
      campaignId: campaign.id,
      name: campaign.name,
      totalMessages: contacts.length,
    });

    // Emit Socket.io event for real-time UI updates
    this.eventEmitter.emit('broadcast.campaign.started', {
      organizationId,
      campaignId: campaign.id,
    });

    this.logger.log(
      `Campaign ${campaign.name} started with ${contacts.length} messages`,
    );

    return campaign;
  }

  /**
   * Pause a running campaign
   */
  async pauseCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new BadRequestException('Campaign is not running');
    }

    campaign.status = CampaignStatus.PAUSED;
    await this.campaignRepository.save(campaign);

    // Pause pending messages in queue
    await this.messageRepository.update(
      {
        campaignId,
        status: In([
          BroadcastMessageStatus.PENDING,
          BroadcastMessageStatus.QUEUED,
        ]),
      },
      { status: BroadcastMessageStatus.PAUSED },
    );

    return campaign;
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException('Campaign is not paused');
    }

    // Get paused messages (only re-queue messages that were paused, not truly cancelled)
    const unsentMessages = await this.messageRepository.find({
      where: {
        campaignId,
        status: BroadcastMessageStatus.PAUSED,
      },
    });

    // Re-queue messages
    for (const message of unsentMessages) {
      message.status = BroadcastMessageStatus.PENDING;
      await this.messageRepository.save(message);

      await this.broadcastQueue.add(
        'send-message',
        {
          messageId: message.id,
          campaignId: campaign.id,
          organizationId,
        },
        {
          delay: unsentMessages.indexOf(message) * campaign.delayBetweenMessages,
          attempts: 3,
        },
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    await this.campaignRepository.save(campaign);

    return campaign;
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<BroadcastCampaign> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException('Campaign is already completed');
    }

    campaign.status = CampaignStatus.CANCELLED;
    await this.campaignRepository.save(campaign);

    // Cancel all pending and paused messages
    await this.messageRepository.update(
      {
        campaignId,
        status: In([
          BroadcastMessageStatus.PENDING,
          BroadcastMessageStatus.QUEUED,
          BroadcastMessageStatus.PAUSED,
        ]),
      },
      { status: BroadcastMessageStatus.CANCELLED },
    );

    return campaign;
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<void> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('Cannot delete a running campaign');
    }

    await this.messageRepository.delete({ campaignId });
    await this.campaignRepository.remove(campaign);
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(
    organizationId: string,
    campaignId: string,
  ): Promise<CampaignStatsDto> {
    const campaign = await this.getCampaign(organizationId, campaignId);

    // Get fresh stats from messages
    const stats = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('message.campaignId = :campaignId', { campaignId })
      .groupBy('message.status')
      .getRawMany();

    const result: CampaignStatsDto = {
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

    // Update campaign stats
    campaign.stats = result;
    await this.campaignRepository.save(campaign);

    return result;
  }

  /**
   * Get campaign messages
   */
  async getCampaignMessages(
    organizationId: string,
    campaignId: string,
    status?: BroadcastMessageStatus,
    page = 1,
    limit = 50,
  ): Promise<{ data: BroadcastMessage[]; total: number }> {
    await this.getCampaign(organizationId, campaignId); // Verify access

    const query = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.contact', 'contact')
      .where('message.campaignId = :campaignId', { campaignId });

    if (status) {
      query.andWhere('message.status = :status', { status });
    }

    const [data, total] = await query
      .orderBy('message.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Process scheduled campaigns
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledCampaigns(): Promise<void> {
    const now = new Date();

    // Find campaigns that should start
    const scheduledCampaigns = await this.campaignRepository.find({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    for (const campaign of scheduledCampaigns) {
      try {
        await this.startCampaign(campaign.organizationId, campaign.id);
        this.logger.log(`Started scheduled campaign: ${campaign.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to start scheduled campaign ${campaign.name}:`,
          error,
        );
        campaign.status = CampaignStatus.FAILED;
        campaign.lastError = error.message;
        await this.campaignRepository.save(campaign);
      }
    }

    // Process recurring campaigns
    const recurringCampaigns = await this.campaignRepository.find({
      where: {
        status: CampaignStatus.COMPLETED,
        recurrenceType: Not(RecurrenceType.NONE),
        nextRunAt: LessThanOrEqual(now),
      },
    });

    for (const campaign of recurringCampaigns) {
      if (campaign.recurrenceEndDate && campaign.recurrenceEndDate < now) {
        continue; // Recurrence ended
      }

      try {
        // Create a new campaign instance with recurrence cleared to prevent cascade
        const newCampaign = this.campaignRepository.create({
          ...campaign,
          id: undefined,
          status: CampaignStatus.DRAFT,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
          recurrenceType: RecurrenceType.NONE,
          recurrenceDay: null,
          recurrenceTime: null,
          recurrenceEndDate: null,
          nextRunAt: null,
          stats: {
            total: 0,
            pending: 0,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
          },
        });

        await this.campaignRepository.save(newCampaign);
        await this.startCampaign(newCampaign.organizationId, newCampaign.id);

        // Update next run
        campaign.nextRunAt = this.calculateNextRun(campaign);
        await this.campaignRepository.save(campaign);

        this.logger.log(`Started recurring campaign: ${campaign.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to start recurring campaign ${campaign.name}:`,
          error,
        );
      }
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private async getContactsForCampaign(
    campaign: BroadcastCampaign,
  ): Promise<BroadcastContact[]> {
    if (campaign.contactIds && campaign.contactIds.length > 0) {
      return this.contactRepository.find({
        where: {
          id: In(campaign.contactIds),
          organizationId: campaign.organizationId,
          isSubscribed: true,
        },
      });
    }

    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.organizationId = :organizationId', {
        organizationId: campaign.organizationId,
      })
      .andWhere('contact.isSubscribed = true');

    if (campaign.contactFilter?.tags && campaign.contactFilter.tags.length > 0) {
      query.andWhere('contact.tags && :tags', {
        tags: campaign.contactFilter.tags,
      });
    }

    if (!campaign.contactFilter?.includeUnverified) {
      query.andWhere('contact.isValidWhatsApp = true');
    }

    return query.getMany();
  }

  private calculateNextRun(campaign: BroadcastCampaign): Date {
    const now = new Date();
    let nextRun = new Date();

    switch (campaign.recurrenceType) {
      case RecurrenceType.DAILY:
        nextRun.setDate(nextRun.getDate() + 1);
        break;

      case RecurrenceType.WEEKLY:
        const targetDay = campaign.recurrenceDay || 1; // Default Monday
        const daysUntilTarget = (targetDay - now.getDay() + 7) % 7 || 7;
        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        break;

      case RecurrenceType.MONTHLY:
        const targetDate = campaign.recurrenceDay || 1;
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(Math.min(targetDate, this.getDaysInMonth(nextRun)));
        break;

      default:
        return null;
    }

    if (campaign.recurrenceTime) {
      const [hours, minutes] = campaign.recurrenceTime.split(':').map(Number);
      nextRun.setHours(hours, minutes, 0, 0);
    }

    return nextRun;
  }

  private getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  /**
   * Get daily statistics for broadcast messages
   * Returns count of messages sent today
   */
  async getDailyStats(organizationId: string): Promise<{
    messagesSentToday: number;
    messagesLimit: number;
    campaignsThisMonth: number;
    campaignsLimit: number;
  }> {
    const limits = await this.getCampaignLimits(organizationId);

    // Start of today (UTC)
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    // Count messages sent today across all campaigns
    const messagesSentToday = await this.messageRepository
      .createQueryBuilder('message')
      .innerJoin('message.campaign', 'campaign')
      .where('campaign.organizationId = :organizationId', { organizationId })
      .andWhere('message.status IN (:...statuses)', {
        statuses: [
          BroadcastMessageStatus.SENT,
          BroadcastMessageStatus.DELIVERED,
          BroadcastMessageStatus.READ,
        ],
      })
      .andWhere('message.sentAt >= :startOfToday', { startOfToday })
      .getCount();

    // Count campaigns this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const campaignsThisMonth = await this.campaignRepository.count({
      where: {
        organizationId,
        createdAt: MoreThanOrEqual(startOfMonth),
      },
    });

    return {
      messagesSentToday,
      messagesLimit: limits.messagesPerCampaign,
      campaignsThisMonth,
      campaignsLimit: limits.campaignsPerMonth,
    };
  }
}
