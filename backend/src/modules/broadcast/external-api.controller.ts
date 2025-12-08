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
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { ApiKeyService } from './api-key.service';
import { ContactService } from './contact.service';
import { TemplateService } from './template.service';
import { CampaignService } from './campaign.service';
import { WebhookService } from './webhook.service';
import { BaileysService } from '../whatsapp/baileys.service';
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
  constructor(
    private apiKeyService: ApiKeyService,
    private contactService: ContactService,
    private templateService: TemplateService,
    private campaignService: CampaignService,
    private webhookService: WebhookService,
    private baileysService: BaileysService,
    @InjectQueue('broadcast')
    private broadcastQueue: Queue,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
  ) {}

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

    if (session.status !== WhatsAppSessionStatus.CONNECTED) {
      throw new ForbiddenException(`WhatsApp session is not connected. Current status: ${session.status}`);
    }

    return session;
  }

  // ==========================================
  // WHATSAPP SESSIONS
  // ==========================================

  @Get('sessions')
  @ApiOperation({ summary: 'Get available WhatsApp sessions' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getSessions(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );

    const sessions = await this.sessionRepository.find({
      where: { organizationId },
      select: ['id', 'name', 'phoneNumber', 'status', 'isActive', 'lastSeenAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      data: sessions.map(s => ({
        id: s.id,
        name: s.name,
        phoneNumber: s.phoneNumber,
        status: s.status,
        isConnected: s.status === WhatsAppSessionStatus.CONNECTED,
        isActive: s.isActive,
        lastSeenAt: s.lastSeenAt,
      })),
    };
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
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );

    // Verify the session belongs to the organization and is connected
    await this.verifySession(dto.sessionId, organizationId);

    // Get template if provided
    let template = null;
    if (dto.templateId) {
      template = await this.templateService.getTemplate(
        organizationId,
        dto.templateId,
      );
    }

    const results = [];
    const delay = dto.delayMs || 3000;

    for (let i = 0; i < dto.recipients.length; i++) {
      const recipient = dto.recipients[i];

      try {
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

        // Add to queue with delay
        await this.broadcastQueue.add(
          'send-external',
          {
            sessionId: dto.sessionId,
            organizationId,
            messageContent,
          },
          {
            delay: i * delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );

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
      success: true,
      totalRecipients: dto.recipients.length,
      queued: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  @Post('send/immediate')
  @ApiOperation({ summary: 'Send message immediately (single recipient)' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async sendImmediate(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body()
    dto: {
      sessionId: string;
      to: string;
      message: string;
      type?: string;
      mediaUrl?: string;
      caption?: string;
    },
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.SEND_MESSAGE,
      clientIp,
    );

    // Verify the session belongs to the organization and is connected
    await this.verifySession(dto.sessionId, organizationId);

    const result = await this.baileysService.sendMessage(dto.sessionId, {
      to: dto.to,
      message: dto.message,
      type: (dto.type as any) || 'text',
      mediaUrl: dto.mediaUrl,
      caption: dto.caption,
    });

    // Trigger webhook
    await this.webhookService.trigger(organizationId, 'message.sent', {
      recipient: dto.to,
      messageId: result.messageId,
      status: result.status,
    });

    return {
      success: true,
      data: result,
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
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CONTACTS_READ,
      clientIp,
    );

    const result = await this.contactService.getContacts(organizationId, filter);
    return { success: true, ...result };
  }

  @Post('contacts')
  @ApiOperation({ summary: 'Create a contact' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async createContact(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: { phoneNumber: string; name: string; email?: string; company?: string; tags?: string[] },
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CONTACTS_WRITE,
      clientIp,
    );

    const contact = await this.contactService.createContact(organizationId, dto);
    return { success: true, data: contact };
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
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.TEMPLATES_READ,
      clientIp,
    );

    const templates = await this.templateService.getTemplates(organizationId);
    return { success: true, data: templates };
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getTemplate(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.TEMPLATES_READ,
      clientIp,
    );

    const template = await this.templateService.getTemplate(organizationId, id);
    return { success: true, data: template };
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
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );

    const campaigns = await this.campaignService.getCampaigns(organizationId);
    return { success: true, data: campaigns };
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );

    const campaign = await this.campaignService.getCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Get('campaigns/:id/stats')
  @ApiOperation({ summary: 'Get campaign statistics' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async getCampaignStats(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_READ,
      clientIp,
    );

    const stats = await this.campaignService.getCampaignStats(organizationId, id);
    return { success: true, data: stats };
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Create and optionally start a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async createCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Body() dto: CreateCampaignDto & { startImmediately?: boolean },
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );

    const campaign = await this.campaignService.createCampaign(
      organizationId,
      'api', // userId
      dto,
    );

    if (dto.startImmediately) {
      await this.campaignService.startCampaign(organizationId, campaign.id);
    }

    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/start')
  @ApiOperation({ summary: 'Start a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async startCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );

    const campaign = await this.campaignService.startCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/pause')
  @ApiOperation({ summary: 'Pause a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async pauseCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );

    const campaign = await this.campaignService.pauseCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/cancel')
  @ApiOperation({ summary: 'Cancel a campaign' })
  @ApiHeader({ name: 'X-API-Key', required: true })
  async cancelCampaign(
    @Headers('x-api-key') apiKey: string,
    @Ip() clientIp: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.CAMPAIGNS_WRITE,
      clientIp,
    );

    const campaign = await this.campaignService.cancelCampaign(organizationId, id);
    return { success: true, data: campaign };
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
    const { organizationId } = await this.apiKeyService.validateApiKey(
      apiKey,
      ApiKeyPermission.WEBHOOKS_MANAGE,
      clientIp,
    );

    const webhooks = await this.webhookService.getWebhooks(organizationId);
    return { success: true, data: webhooks };
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
    const { organizationId, permissions } =
      await this.apiKeyService.validateApiKey(apiKey, undefined, clientIp);

    return {
      success: true,
      status: 'healthy',
      organizationId,
      permissions,
      timestamp: new Date().toISOString(),
    };
  }
}
