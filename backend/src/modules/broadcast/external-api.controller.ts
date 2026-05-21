import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Ip,
  HttpStatus,
  HttpException,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { ApiKeyService } from './api-key.service';
import { ContactService } from './contact.service';
import { TemplateService } from './template.service';
import { CampaignService } from './campaign.service';
import { WebhookService } from './webhook.service';
import { BaileysService } from '../whatsapp/baileys.service';
import { PendingMessageQueueService } from '../whatsapp/pending-message-queue.service';
import {
  ExternalSendMessageDto,
  CreateCampaignDto,
  ContactFilterDto,
} from './dto/broadcast.dto';
import { ApiKeyPermission, WhatsAppSession } from '../../common/entities';
import { WhatsAppSessionStatus } from '../../common/enums';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@ApiTags('External API')
@Controller('external')
@Public()
export class ExternalApiController {
  private readonly DEDUP_TTL_SECONDS = 300; // 5 minutes deduplication window
  private readonly RECIPIENT_RATE_LIMIT = 100; // Max 100 messages per recipient per hour
  private readonly RECIPIENT_RATE_WINDOW = 3600; // 1 hour window
  private readonly MIN_DELAY_MS = 1000; // Minimum 1 second between messages
  private readonly redis: Redis;

  constructor(
    private apiKeyService: ApiKeyService,
    private contactService: ContactService,
    private templateService: TemplateService,
    private campaignService: CampaignService,
    private webhookService: WebhookService,
    private baileysService: BaileysService,
    private pendingMessageQueueService: PendingMessageQueueService,
    @InjectQueue('broadcast')
    private broadcastQueue: Queue,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  /**
   * Generate a SHA-256 hash for deduplication based on recipient and full message content
   */
  private generateMessageHash(to: string, message: string): string {
    const content = `${to}:${message || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if this message was recently sent (duplicate detection) using Redis
   */
  private async isDuplicateMessage(to: string, message: string): Promise<boolean> {
    const hash = this.generateMessageHash(to, message);
    const redisKey = `dedup:msg:${hash}`;
    const exists = await this.redis.exists(redisKey);
    return exists === 1;
  }

  /**
   * Mark a message as sent for deduplication using Redis SET with TTL
   */
  private async markMessageSent(to: string, message: string): Promise<void> {
    const hash = this.generateMessageHash(to, message);
    const redisKey = `dedup:msg:${hash}`;
    await this.redis.set(redisKey, '1', 'EX', this.DEDUP_TTL_SECONDS);
  }

  /**
   * Check per-recipient rate limit. Returns true if limit exceeded.
   */
  private async isRecipientRateLimited(phoneNumber: string): Promise<boolean> {
    const key = `ratelimit:recipient:${phoneNumber.replace(/[^0-9]/g, '')}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.RECIPIENT_RATE_WINDOW);
    }
    return count > this.RECIPIENT_RATE_LIMIT;
  }

  /**
   * Apply jitter to a delay value (±20%)
   */
  private applyJitter(delayMs: number): number {
    const jitter = delayMs * 0.2;
    return Math.round(delayMs + (Math.random() * 2 - 1) * jitter);
  }

  /**
   * Enforce rate limiting for the given API key. Throws 429 if limit exceeded.
   */
  private async enforceRateLimit(keyHash: string, rateLimitPerMinute: number, rateLimitPerDay: number): Promise<void> {
    const result = await this.apiKeyService.checkRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);
    if (!result.allowed) {
      throw new HttpException(
        {
          success: false,
          error: 'RATE_LIMITED',
          message: result.message,
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Verify that a session belongs to the organization and is connected
   */
  private async verifySession(sessionId: string, organizationId: string): Promise<WhatsAppSession> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('WhatsApp session not found');
    }

    if (session.organizationId !== organizationId) {
      throw new ForbiddenException('This WhatsApp session does not belong to your organization');
    }

    // Check REAL connection status from Baileys, not just database status
    // Database status might be stale (e.g., "connecting" when actually connected)
    const realStatus = this.baileysService.getSessionStatus(sessionId);

    if (realStatus !== 'connected') {
      // Also check database status for better error message
      const dbStatus = session.status;
      throw new ForbiddenException(
        `WhatsApp session is not connected. Real status: ${realStatus}, DB status: ${dbStatus}. ` +
        `Please ensure the session is connected from the dashboard.`
      );
    }

    // Update database status if it's out of sync
    if (session.status !== WhatsAppSessionStatus.CONNECTED) {
      await this.sessionRepository.update(sessionId, {
        status: WhatsAppSessionStatus.CONNECTED,
        isActive: true,
      });
    }

    return session;
  }

  // ==========================================
  // WHATSAPP SESSIONS
  // ==========================================

  @Get('sessions')
  @ApiOperation({ summary: 'Get the WhatsApp session linked to this API key' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getSessions(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { sessionId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );
    // Read-only status check — exempt from per-key rate limit
    // (global ThrottlerGuard still applies at 300/min per IP)

    // Each API key is linked to exactly one session
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      select: ['id', 'name', 'phoneNumber', 'status', 'isActive', 'lastSeenAt', 'createdAt'],
    });

    if (!session) {
      throw new NotFoundException('WhatsApp session not found');
    }

    // Return single session (wrapped in array for backward compatibility)
    return [{
      id: session.id,
      name: session.name,
      phoneNumber: session.phoneNumber,
      status: session.status,
      isConnected: session.status === WhatsAppSessionStatus.CONNECTED,
      isActive: session.isActive,
      lastSeenAt: session.lastSeenAt,
    }];
  }

  // ==========================================
  // SEND MESSAGES
  // ==========================================

  @Post('send')
  @ApiOperation({ summary: 'Send message to one or multiple recipients' })
  @ApiHeader({ name: 'X-API-Key', required: true, description: 'API Key' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Messages queued' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid API key' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient permissions' })
  async sendMessage(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: ExternalSendMessageDto,
  ) {
    // Validate API key
    const { organizationId, sessionId: apiKeySessionId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    // Use API key's session if not provided in request
    const sessionId = dto.sessionId || apiKeySessionId;

    // If sessionId was explicitly provided, verify it matches the API key's session
    if (dto.sessionId) {
      this.apiKeyService.validateSessionAccess(apiKeySessionId, dto.sessionId);
    }

    // Verify the session belongs to the organization and is connected
    await this.verifySession(sessionId, organizationId);

    // Get template if provided
    let template = null;
    if (dto.templateId) {
      template = await this.templateService.getTemplate(
        organizationId,
        dto.templateId,
      );
    }

    const results = [];
    const rawDelay = dto.delayMs || 3000;
    const delay = Math.max(rawDelay, this.MIN_DELAY_MS); // Enforce minimum delay

    for (let i = 0; i < dto.recipients.length; i++) {
      const recipient = dto.recipients[i];

      try {
        // Check per-recipient rate limit
        if (await this.isRecipientRateLimited(recipient)) {
          results.push({
            recipient,
            success: false,
            error: `Rate limit exceeded: max ${this.RECIPIENT_RATE_LIMIT} messages per recipient per hour`,
          });
          continue;
        }

        // Prepare message content
        let messageContent: any;

        if (template) {
          const rendered = this.templateService.renderTemplate(
            template,
            dto.variables || {},
          );
          messageContent = {
            to: recipient,
            message: rendered.content,
            type: template.type,
            mediaUrl: template.mediaUrl,
            caption: rendered.caption,
            filename: template.filename,
          };
        } else if (dto.message) {
          messageContent = {
            to: recipient,
            message: dto.message.text || '',
            type: dto.message.type || 'text',
            mediaUrl: dto.message.mediaUrl,
            caption: dto.message.caption,
          };
        } else {
          results.push({
            recipient,
            success: false,
            error: 'No template or message provided',
          });
          continue;
        }

        // Check for duplicate message before queuing
        if (await this.isDuplicateMessage(messageContent.to, messageContent.message)) {
          results.push({
            recipient,
            success: true,
            status: 'deduplicated',
          });
          continue;
        }

        // Generate deterministic job ID to prevent duplicate queue entries on client retry
        const jobId = `ext-${this.generateMessageHash(messageContent.to, messageContent.message)}`;

        // Add to queue with jittered delay and deterministic job ID
        const jitteredDelay = this.applyJitter(i * delay);

        await this.broadcastQueue.add(
          'send-external',
          {
            sessionId,
            organizationId,
            messageContent,
          },
          {
            jobId,
            delay: jitteredDelay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

        // Mark as queued for deduplication
        await this.markMessageSent(messageContent.to, messageContent.message);

        results.push({
          recipient,
          success: true,
          status: 'queued',
        });
      } catch (error) {
        results.push({
          recipient,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalRecipients: dto.recipients.length,
      queued: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  @Post('send/immediate')
  @ApiOperation({ summary: 'Send message immediately (single recipient). If session is disconnected, message is queued for retry.' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message sent or queued' })
  @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Message queued for delivery when session reconnects' })
  async sendImmediate(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body()
    dto: {
      sessionId?: string; // Optional - uses API key's session if not provided
      to: string;
      message: string;
      type?: string;
      mediaUrl?: string;
      caption?: string;
      queueIfDisconnected?: boolean; // Default: true - queue message if session is disconnected
    },
  ) {
    const { organizationId, sessionId: apiKeySessionId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    // Use API key's session if not provided in request
    const sessionId = dto.sessionId || apiKeySessionId;

    // If sessionId was explicitly provided, verify it matches the API key's session
    if (dto.sessionId) {
      this.apiKeyService.validateSessionAccess(apiKeySessionId, dto.sessionId);
    }

    // Check session ownership
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('WhatsApp session not found');
    }

    if (session.organizationId !== organizationId) {
      throw new ForbiddenException('This WhatsApp session does not belong to your organization');
    }

    // Per-recipient rate limit
    if (await this.isRecipientRateLimited(dto.to)) {
      throw new HttpException(
        {
          success: false,
          error: 'RECIPIENT_RATE_LIMITED',
          message: `Rate limit exceeded: max ${this.RECIPIENT_RATE_LIMIT} messages per recipient per hour`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check for duplicate message (same recipient + content within 5 minutes)
    if (await this.isDuplicateMessage(dto.to, dto.message)) {
      return {
        success: true,
        status: 'deduplicated',
        message: 'Duplicate message detected - already sent within the last 30 seconds',
        deduplicated: true,
      };
    }

    // Check real connection status
    const realStatus = this.baileysService.getSessionStatus(sessionId);
    const queueIfDisconnected = dto.queueIfDisconnected !== false; // Default true

    // If session is disconnected, queue the message for later delivery
    if (realStatus !== 'connected') {
      if (queueIfDisconnected) {
        // Queue the message for retry when session reconnects
        const queueResult = await this.pendingMessageQueueService.queueMessage({
          sessionId,
          organizationId,
          to: dto.to,
          message: dto.message,
          type: (dto.type || 'text') as 'text' | 'image' | 'video' | 'audio' | 'document',
          mediaUrl: dto.mediaUrl,
          caption: dto.caption,
          source: 'external-api',
          originalError: `Session disconnected (status: ${realStatus})`,
        });

        // Mark as queued for deduplication (prevents duplicate queue entries)
        await this.markMessageSent(dto.to, dto.message);

        // Return 202 Accepted - message queued for later delivery
        return {
          success: true,
          status: 'queued',
          message: 'Session is disconnected. Message queued for delivery when session reconnects.',
          messageId: queueResult.messageId,
          queuePosition: queueResult.position,
          sessionStatus: realStatus,
        };
      } else {
        // User explicitly doesn't want queueing
        throw new ServiceUnavailableException({
          success: false,
          error: 'WHATSAPP_SESSION_DISCONNECTED',
          message: `WhatsApp session is not connected (status: ${realStatus}). Message not sent.`,
          sessionStatus: realStatus,
          recoverable: true,
        });
      }
    }

    // Session is connected - try to send immediately
    try {
      const result = await this.baileysService.sendMessage(sessionId, {
        to: dto.to,
        message: dto.message,
        type: (dto.type || 'text') as 'text' | 'image' | 'video' | 'audio' | 'document',
        mediaUrl: dto.mediaUrl,
        caption: dto.caption,
      });

      // Mark as sent for deduplication
      await this.markMessageSent(dto.to, dto.message);

      // Trigger webhook
      await this.webhookService.trigger(organizationId, 'message.sent', {
        recipient: dto.to,
        messageId: result.messageId,
        status: result.status,
      });

      return {
        ...result,
        status: 'sent',
      };
    } catch (error) {
      const errorCode = (error as Error & { code?: string })?.code;
      const errorMessage = error?.message || 'Failed to send message';

      // Check if error is due to connection issue - queue the message
      if (
        queueIfDisconnected && (
          errorMessage.includes('Connection Closed') ||
          errorMessage.includes('not connected') ||
          errorMessage.includes('not open') ||
          errorCode === 'SESSION_DISCONNECTED'
        )
      ) {
        // Queue the message for retry
        const queueResult = await this.pendingMessageQueueService.queueMessage({
          sessionId,
          organizationId,
          to: dto.to,
          message: dto.message,
          type: (dto.type || 'text') as 'text' | 'image' | 'video' | 'audio' | 'document',
          mediaUrl: dto.mediaUrl,
          caption: dto.caption,
          source: 'external-api',
          originalError: errorMessage,
        });

        // Mark as queued for deduplication
        await this.markMessageSent(dto.to, dto.message);

        return {
          success: true,
          status: 'queued',
          message: 'Connection lost during send. Message queued for delivery when session reconnects.',
          messageId: queueResult.messageId,
          queuePosition: queueResult.position,
          originalError: errorMessage,
        };
      }

      // Handle other specific errors
      switch (errorCode) {
        case 'PREKEY_ERROR':
          throw new ServiceUnavailableException({
            success: false,
            error: 'WHATSAPP_ENCRYPTION_ERROR',
            message: errorMessage,
            action: 'Please reconnect the WhatsApp session from the dashboard',
            recoverable: true,
          });

        case 'RATE_LIMITED':
          throw new HttpException({
            success: false,
            error: 'RATE_LIMITED',
            message: errorMessage,
            action: 'Wait a few minutes before retrying',
            recoverable: true,
          }, HttpStatus.TOO_MANY_REQUESTS);

        case 'INVALID_PHONE':
          throw new BadRequestException({
            success: false,
            error: 'INVALID_PHONE_NUMBER',
            message: errorMessage,
            recoverable: false,
          });

        default:
          throw new HttpException({
            success: false,
            error: 'SEND_MESSAGE_FAILED',
            message: errorMessage,
          }, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  @Get('queue/stats')
  @ApiOperation({ summary: 'Get pending message queue statistics' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getQueueStats(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { sessionId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );
    // Read-only stats check — exempt from per-key rate limit

    const stats = await this.pendingMessageQueueService.getQueueStats();
    const sessionPending = stats.bySession[sessionId] || 0;

    return {
      session: {
        sessionId,
        pending: sessionPending,
      },
    };
  }

  // ==========================================
  // VALIDATE PHONE NUMBERS
  // ==========================================

  @Post('validate-numbers')
  @ApiOperation({ summary: 'Validate if phone numbers are registered on WhatsApp' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiResponse({ status: HttpStatus.OK, description: 'Validation results' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid API key' })
  async validateNumbers(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: { sessionId?: string; phoneNumbers: string[] },
  ) {
    const { organizationId, sessionId: apiKeySessionId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    // Use API key's session if not provided in request
    const sessionId = dto.sessionId || apiKeySessionId;

    // If sessionId was explicitly provided, verify it matches the API key's session
    if (dto.sessionId) {
      this.apiKeyService.validateSessionAccess(apiKeySessionId, dto.sessionId);
    }

    // Verify the session belongs to the organization and is connected
    await this.verifySession(sessionId, organizationId);

    // Limit to 100 numbers per request to avoid abuse
    if (dto.phoneNumbers.length > 100) {
      return {
        success: false,
        error: 'Maximum 100 phone numbers per request',
      };
    }

    const results = await this.baileysService.validatePhoneNumbers(
      sessionId,
      dto.phoneNumbers,
    );

    // Return data directly - TransformInterceptor will wrap it
    return {
      total: dto.phoneNumbers.length,
      valid: results.filter(r => r.isValid).length,
      invalid: results.filter(r => !r.isValid).length,
      results,
    };
  }

  // ==========================================
  // CONTACTS
  // ==========================================

  @Get('contacts')
  @ApiOperation({ summary: 'Get contacts' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiQuery({ name: 'tags', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getContacts(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Query() filter: ContactFilterDto,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CONTACTS_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const result = await this.contactService.getContacts(organizationId, filter);
    return result;
  }

  @Post('contacts')
  @ApiOperation({ summary: 'Create a contact' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async createContact(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: { phoneNumber: string; name: string; email?: string; company?: string; tags?: string[] },
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CONTACTS_WRITE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const contact = await this.contactService.createContact(organizationId, dto);
    return contact;
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  @Get('templates')
  @ApiOperation({ summary: 'Get message templates' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getTemplates(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.TEMPLATES_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const templates = await this.templateService.getTemplates(organizationId);
    return templates;
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getTemplate(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.TEMPLATES_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const template = await this.templateService.getTemplate(organizationId, id);
    return template;
  }

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  @Get('campaigns')
  @ApiOperation({ summary: 'Get campaigns' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getCampaigns(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaigns = await this.campaignService.getCampaigns(organizationId);
    return campaigns;
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaign = await this.campaignService.getCampaign(organizationId, id);
    return campaign;
  }

  @Get('campaigns/:id/stats')
  @ApiOperation({ summary: 'Get campaign statistics' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getCampaignStats(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const stats = await this.campaignService.getCampaignStats(organizationId, id);
    return stats;
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Create and optionally start a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async createCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: CreateCampaignDto & { startImmediately?: boolean },
  ) {
    const { organizationId, keyId, keyName, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaign = await this.campaignService.createCampaign(
      organizationId,
      `api-key:${keyId}:${keyName}`, // userId for audit traceability
      dto,
    );

    if (dto.startImmediately) {
      await this.campaignService.startCampaign(organizationId, campaign.id);
    }

    return campaign;
  }

  @Post('campaigns/:id/start')
  @ApiOperation({ summary: 'Start a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async startCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaign = await this.campaignService.startCampaign(organizationId, id);
    return campaign;
  }

  @Post('campaigns/:id/pause')
  @ApiOperation({ summary: 'Pause a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async pauseCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaign = await this.campaignService.pauseCampaign(organizationId, id);
    return campaign;
  }

  @Post('campaigns/:id/cancel')
  @ApiOperation({ summary: 'Cancel a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async cancelCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const campaign = await this.campaignService.cancelCampaign(organizationId, id);
    return campaign;
  }

  // ==========================================
  // WEBHOOKS MANAGEMENT
  // ==========================================

  @Get('webhooks')
  @ApiOperation({ summary: 'Get configured webhooks' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getWebhooks(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { organizationId, keyHash, rateLimitPerMinute, rateLimitPerDay } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.WEBHOOKS_MANAGE,
      clientIp,
    );
    await this.enforceRateLimit(keyHash, rateLimitPerMinute, rateLimitPerDay);

    const webhooks = await this.webhookService.getWebhooks(organizationId);
    return webhooks;
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  @Get('health')
  @ApiOperation({ summary: 'Check API health and validate key' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async healthCheck(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { organizationId, sessionId, permissions } =
      await this.apiKeyService.validateApiKey(apiKey, undefined, clientIp);
    // Read-only health check — exempt from per-key rate limit

    return {
      status: 'healthy',
      organizationId,
      sessionId,
      permissions,
    };
  }
}
