import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseUUIDPipe,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContactService } from './contact.service';
import { TemplateService } from './template.service';
import { CampaignService } from './campaign.service';
import { WebhookService } from './webhook.service';
import { ApiKeyService } from './api-key.service';
import {
  CreateContactDto,
  ImportContactsDto,
  ContactFilterDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  CreateApiKeyDto,
  CreateWebhookDto,
} from './dto/broadcast.dto';
import {
  TemplateType,
  TemplateCategory,
  CampaignStatus,
  BroadcastMessageStatus,
} from '../../common/entities';

interface AuthUser {
  userId: string;
  organizationId?: string;
}

@ApiTags('Broadcast')
@Controller('broadcast')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BroadcastController {
  constructor(
    private contactService: ContactService,
    private templateService: TemplateService,
    private campaignService: CampaignService,
    private webhookService: WebhookService,
    private apiKeyService: ApiKeyService,
  ) {}

  private ensureOrganization(user: AuthUser): string {
    if (!user.organizationId) {
      throw new BadRequestException('Organization is required. Please create or join an organization first.');
    }
    return user.organizationId;
  }

  // ==========================================
  // CONTACTS
  // ==========================================

  @Post('contacts')
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Contact created' })
  async createContact(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateContactDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const contact = await this.contactService.createContact(
      organizationId,
      dto,
    );
    return { success: true, data: contact };
  }

  @Post('contacts/import')
  @ApiOperation({ summary: 'Import contacts from file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        validateWhatsApp: { type: 'boolean' },
        skipDuplicates: { type: 'boolean' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importContacts(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportContactsDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.contactService.importContacts(
      organizationId,
      file.buffer,
      file.originalname,
      dto,
    );

    return { success: true, data: result };
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Get contacts with filtering' })
  @ApiQuery({ name: 'tags', required: false, type: [String] })
  @ApiQuery({ name: 'isValidWhatsApp', required: false, type: Boolean })
  @ApiQuery({ name: 'isSubscribed', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getContacts(
    @CurrentUser() user: AuthUser,
    @Query() filter: ContactFilterDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const result = await this.contactService.getContacts(
      organizationId,
      filter,
    );
    return { success: true, ...result };
  }

  @Get('contacts/stats')
  @ApiOperation({ summary: 'Get contact statistics' })
  async getContactStats(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    const stats = await this.contactService.getContactStats(organizationId);
    const limit = await this.contactService.getContactLimit(organizationId);
    const tags = await this.contactService.getAllTags(organizationId);

    return {
      success: true,
      data: {
        total: stats.total,
        limit,
        available: limit - stats.total,
        validated: stats.validated,
        subscribed: stats.subscribed,
        tags,
      },
    };
  }

  @Get('contacts/:id')
  @ApiOperation({ summary: 'Get contact by ID' })
  async getContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const contact = await this.contactService.getContact(organizationId, id);
    return { success: true, data: contact };
  }

  @Put('contacts/:id')
  @ApiOperation({ summary: 'Update contact' })
  async updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateContactDto>,
  ) {
    const organizationId = this.ensureOrganization(user);
    const contact = await this.contactService.updateContact(organizationId, id, dto);
    return { success: true, data: contact };
  }

  @Delete('contacts/:id')
  @ApiOperation({ summary: 'Delete contact' })
  async deleteContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    await this.contactService.deleteContact(organizationId, id);
    return { success: true };
  }

  @Post('contacts/bulk-delete')
  @ApiOperation({ summary: 'Delete multiple contacts' })
  async bulkDeleteContacts(
    @CurrentUser() user: AuthUser,
    @Body('contactIds') contactIds: string[],
  ) {
    const organizationId = this.ensureOrganization(user);
    const deleted = await this.contactService.bulkDeleteContacts(organizationId, contactIds);
    return { success: true, deleted };
  }

  @Post('contacts/add-tags')
  @ApiOperation({ summary: 'Add tags to contacts' })
  async addTagsToContacts(
    @CurrentUser() user: AuthUser,
    @Body() body: { contactIds: string[]; tags: string[] },
  ) {
    const organizationId = this.ensureOrganization(user);
    const updated = await this.contactService.addTags(organizationId, body.contactIds, body.tags);
    return { success: true, updated };
  }

  @Post('contacts/bulk-validate')
  @ApiOperation({ summary: 'Bulk validate all unverified contacts' })
  async bulkValidateContacts(
    @CurrentUser() user: AuthUser,
    @Body('sessionId') sessionId: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }
    const result = await this.contactService.bulkValidateContacts(organizationId, sessionId, user.userId);
    return { success: true, data: result };
  }

  @Post('contacts/:id/validate')
  @ApiOperation({ summary: 'Validate contact WhatsApp number' })
  async validateContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('sessionId') sessionId: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const contact = await this.contactService.getContact(organizationId, id);
    await this.contactService.validateWhatsAppNumbers(organizationId, sessionId, [contact.phoneNumber]);
    return { success: true, message: 'Validation started' };
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  @Post('templates/with-media')
  @ApiOperation({ summary: 'Create a message template with media file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('mediaFile', {
      storage: diskStorage({
        destination: './uploads/templates',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/quicktime',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Invalid file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async createTemplateWithMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    const organizationId = this.ensureOrganization(user);

    const dto: CreateTemplateDto = {
      name: body.name,
      description: body.description,
      type: body.type,
      category: body.category,
      content: body.content,
      caption: body.caption,
      mediaUrl: file ? `/uploads/templates/${file.filename}` : undefined,
    };

    const template = await this.templateService.createTemplate(organizationId, dto);
    return { success: true, data: template };
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create a message template' })
  async createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const template = await this.templateService.createTemplate(organizationId, dto);
    return { success: true, data: template };
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get all templates' })
  @ApiQuery({ name: 'category', required: false, enum: TemplateCategory })
  @ApiQuery({ name: 'type', required: false, enum: TemplateType })
  async getTemplates(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: TemplateCategory,
    @Query('type') type?: TemplateType,
  ) {
    const organizationId = this.ensureOrganization(user);
    const templates = await this.templateService.getTemplates(organizationId, category, type);
    return { success: true, data: templates };
  }

  @Get('templates/system')
  @ApiOperation({ summary: 'Get system templates only' })
  async getSystemTemplates() {
    const templates = await this.templateService.getSystemTemplates();
    return { success: true, data: templates };
  }

  @Get('templates/stats')
  @ApiOperation({ summary: 'Get template statistics' })
  async getTemplateStats(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    const count = await this.templateService.getTemplateCount(organizationId);
    const limit = await this.templateService.getTemplateLimit(organizationId);

    return {
      success: true,
      data: {
        custom: count,
        limit,
        available: limit - count,
      },
    };
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template by ID' })
  async getTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const template = await this.templateService.getTemplate(organizationId, id);
    return { success: true, data: template };
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update template' })
  async updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const template = await this.templateService.updateTemplate(organizationId, id, dto);
    return { success: true, data: template };
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete template' })
  async deleteTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    await this.templateService.deleteTemplate(organizationId, id);
    return { success: true };
  }

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  @Post('campaigns/with-media')
  @ApiOperation({ summary: 'Create a broadcast campaign with media files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('mediaFiles', 10, {
      storage: diskStorage({
        destination: './uploads/broadcast',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/quicktime',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Invalid file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async createCampaignWithMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
  ) {
    const organizationId = this.ensureOrganization(user);

    // Parse JSON fields from FormData
    const dto: CreateCampaignDto = {
      name: body.name,
      description: body.description,
      sessionId: body.sessionId,
      templateId: body.templateId,
      messageContent: body.messageContent ? JSON.parse(body.messageContent) : undefined,
      contactFilter: body.contactFilter ? JSON.parse(body.contactFilter) : undefined,
      contactIds: body.contactIds ? JSON.parse(body.contactIds) : undefined,
      scheduledAt: body.scheduledAt,
      recurrenceType: body.recurrenceType,
      delayBetweenMessages: body.delayBetweenMessages ? parseInt(body.delayBetweenMessages) : undefined,
    };

    // Build media URLs from uploaded files
    const mediaUrls = files?.map(file => `/uploads/broadcast/${file.filename}`) || [];

    const campaign = await this.campaignService.createCampaign(
      organizationId,
      user.userId,
      dto,
      mediaUrls,
    );
    return { success: true, data: campaign };
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a broadcast campaign' })
  async createCampaign(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCampaignDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.createCampaign(organizationId, user.userId, dto);
    return { success: true, data: campaign };
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get all campaigns' })
  @ApiQuery({ name: 'status', required: false, enum: CampaignStatus })
  async getCampaigns(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: CampaignStatus,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaigns = await this.campaignService.getCampaigns(organizationId, status);
    return { success: true, data: campaigns };
  }

  @Get('campaigns/limits')
  @ApiOperation({ summary: 'Get campaign limits' })
  async getCampaignLimits(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    return this.campaignService.getCampaignLimits(organizationId);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  async getCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.getCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Put('campaigns/:id')
  @ApiOperation({ summary: 'Update campaign' })
  async updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.updateCampaign(organizationId, id, dto);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/start')
  @ApiOperation({ summary: 'Start a campaign' })
  async startCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.startCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/pause')
  @ApiOperation({ summary: 'Pause a running campaign' })
  async pauseCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.pauseCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/resume')
  @ApiOperation({ summary: 'Resume a paused campaign' })
  async resumeCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.resumeCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/cancel')
  @ApiOperation({ summary: 'Cancel a campaign' })
  async cancelCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const campaign = await this.campaignService.cancelCampaign(organizationId, id);
    return { success: true, data: campaign };
  }

  @Delete('campaigns/:id')
  @ApiOperation({ summary: 'Delete campaign' })
  async deleteCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    await this.campaignService.deleteCampaign(organizationId, id);
    return { success: true };
  }

  @Get('campaigns/:id/stats')
  @ApiOperation({ summary: 'Get campaign statistics' })
  async getCampaignStats(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const stats = await this.campaignService.getCampaignStats(organizationId, id);
    return { success: true, data: stats };
  }

  @Get('campaigns/:id/messages')
  @ApiOperation({ summary: 'Get campaign messages' })
  @ApiQuery({ name: 'status', required: false, enum: BroadcastMessageStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCampaignMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: BroadcastMessageStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const organizationId = this.ensureOrganization(user);
    const result = await this.campaignService.getCampaignMessages(organizationId, id, status, page, limit);
    return { success: true, ...result };
  }

  // ==========================================
  // WEBHOOKS
  // ==========================================

  @Post('webhooks')
  @ApiOperation({ summary: 'Create a webhook' })
  async createWebhook(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWebhookDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const webhook = await this.webhookService.createWebhook(organizationId, dto);
    return { success: true, data: webhook };
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Get all webhooks' })
  async getWebhooks(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    const webhooks = await this.webhookService.getWebhooks(organizationId);
    return { success: true, data: webhooks };
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Get webhook by ID' })
  async getWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const webhook = await this.webhookService.getWebhook(organizationId, id);
    return { success: true, data: webhook };
  }

  @Put('webhooks/:id')
  @ApiOperation({ summary: 'Update webhook' })
  async updateWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateWebhookDto>,
  ) {
    const organizationId = this.ensureOrganization(user);
    const webhook = await this.webhookService.updateWebhook(organizationId, id, dto);
    return { success: true, data: webhook };
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Delete webhook' })
  async deleteWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    await this.webhookService.deleteWebhook(organizationId, id);
    return { success: true };
  }

  @Post('webhooks/:id/test')
  @ApiOperation({ summary: 'Test webhook endpoint' })
  async testWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const result = await this.webhookService.testWebhook(organizationId, id);
    return { success: true, data: result };
  }

  @Post('webhooks/:id/regenerate-secret')
  @ApiOperation({ summary: 'Regenerate webhook secret' })
  async regenerateWebhookSecret(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    const result = await this.webhookService.regenerateSecret(organizationId, id);
    return { success: true, data: result };
  }

  // ==========================================
  // API KEYS
  // ==========================================

  @Get('api-keys/access')
  @ApiOperation({ summary: 'Check if organization can use API keys' })
  async checkApiAccess(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    const canUse = await this.apiKeyService.canUseExternalApi(organizationId);
    // Just return the data - TransformInterceptor will wrap it in { success: true, data: ... }
    return { canUseApi: canUse };
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Create an API key (Pro/Enterprise only)' })
  async createApiKey(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    const organizationId = this.ensureOrganization(user);
    const result = await this.apiKeyService.createApiKey(organizationId, user.userId, dto);
    // Return just the data - TransformInterceptor will wrap it in { success: true, data: ... }
    return {
      ...result.apiKey,
      key: result.key, // Only shown once!
    };
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'Get all API keys' })
  async getApiKeys(@CurrentUser() user: AuthUser) {
    const organizationId = this.ensureOrganization(user);
    return this.apiKeyService.getApiKeys(organizationId);
  }

  @Get('api-keys/:id')
  @ApiOperation({ summary: 'Get API key by ID' })
  async getApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    return this.apiKeyService.getApiKey(organizationId, id);
  }

  @Put('api-keys/:id')
  @ApiOperation({ summary: 'Update API key' })
  async updateApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateApiKeyDto>,
  ) {
    const organizationId = this.ensureOrganization(user);
    return this.apiKeyService.updateApiKey(organizationId, id, dto);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Delete API key' })
  async deleteApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const organizationId = this.ensureOrganization(user);
    await this.apiKeyService.deleteApiKey(organizationId, id);
    return { deleted: true };
  }

  @Post('api-keys/:id/toggle')
  @ApiOperation({ summary: 'Enable/disable API key' })
  async toggleApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    const organizationId = this.ensureOrganization(user);
    return this.apiKeyService.toggleApiKey(organizationId, id, isActive);
  }
}
