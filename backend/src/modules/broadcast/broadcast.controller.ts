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
  ParseUUIDPipe,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  organizationId: string;
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
    const contact = await this.contactService.createContact(
      user.organizationId,
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
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.contactService.importContacts(
      user.organizationId,
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
    const result = await this.contactService.getContacts(
      user.organizationId,
      filter,
    );
    return { success: true, ...result };
  }

  @Get('contacts/stats')
  @ApiOperation({ summary: 'Get contact statistics' })
  async getContactStats(@CurrentUser() user: AuthUser) {
    const count = await this.contactService.getContactCount(user.organizationId);
    const limit = await this.contactService.getContactLimit(user.organizationId);
    const tags = await this.contactService.getAllTags(user.organizationId);

    return {
      success: true,
      data: {
        total: count,
        limit,
        available: limit - count,
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
    const contact = await this.contactService.getContact(
      user.organizationId,
      id,
    );
    return { success: true, data: contact };
  }

  @Put('contacts/:id')
  @ApiOperation({ summary: 'Update contact' })
  async updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateContactDto>,
  ) {
    const contact = await this.contactService.updateContact(
      user.organizationId,
      id,
      dto,
    );
    return { success: true, data: contact };
  }

  @Delete('contacts/:id')
  @ApiOperation({ summary: 'Delete contact' })
  async deleteContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactService.deleteContact(user.organizationId, id);
    return { success: true };
  }

  @Post('contacts/bulk-delete')
  @ApiOperation({ summary: 'Delete multiple contacts' })
  async bulkDeleteContacts(
    @CurrentUser() user: AuthUser,
    @Body('contactIds') contactIds: string[],
  ) {
    const deleted = await this.contactService.bulkDeleteContacts(
      user.organizationId,
      contactIds,
    );
    return { success: true, deleted };
  }

  @Post('contacts/add-tags')
  @ApiOperation({ summary: 'Add tags to contacts' })
  async addTagsToContacts(
    @CurrentUser() user: AuthUser,
    @Body() body: { contactIds: string[]; tags: string[] },
  ) {
    const updated = await this.contactService.addTags(
      user.organizationId,
      body.contactIds,
      body.tags,
    );
    return { success: true, updated };
  }

  @Post('contacts/:id/validate')
  @ApiOperation({ summary: 'Validate contact WhatsApp number' })
  async validateContact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('sessionId') sessionId: string,
  ) {
    const contact = await this.contactService.getContact(
      user.organizationId,
      id,
    );

    await this.contactService.validateWhatsAppNumbers(
      user.organizationId,
      sessionId,
      [contact.phoneNumber],
    );

    return { success: true, message: 'Validation started' };
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  @Post('templates')
  @ApiOperation({ summary: 'Create a message template' })
  async createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    const template = await this.templateService.createTemplate(
      user.organizationId,
      dto,
    );
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
    const templates = await this.templateService.getTemplates(
      user.organizationId,
      category,
      type,
    );
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
    const count = await this.templateService.getTemplateCount(user.organizationId);
    const limit = await this.templateService.getTemplateLimit(user.organizationId);

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
    const template = await this.templateService.getTemplate(
      user.organizationId,
      id,
    );
    return { success: true, data: template };
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update template' })
  async updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const template = await this.templateService.updateTemplate(
      user.organizationId,
      id,
      dto,
    );
    return { success: true, data: template };
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete template' })
  async deleteTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.templateService.deleteTemplate(user.organizationId, id);
    return { success: true };
  }

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a broadcast campaign' })
  async createCampaign(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCampaignDto,
  ) {
    const campaign = await this.campaignService.createCampaign(
      user.organizationId,
      user.userId,
      dto,
    );
    return { success: true, data: campaign };
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get all campaigns' })
  @ApiQuery({ name: 'status', required: false, enum: CampaignStatus })
  async getCampaigns(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: CampaignStatus,
  ) {
    const campaigns = await this.campaignService.getCampaigns(
      user.organizationId,
      status,
    );
    return { success: true, data: campaigns };
  }

  @Get('campaigns/limits')
  @ApiOperation({ summary: 'Get campaign limits' })
  async getCampaignLimits(@CurrentUser() user: AuthUser) {
    const limits = await this.campaignService.getCampaignLimits(
      user.organizationId,
    );
    return { success: true, data: limits };
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  async getCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const campaign = await this.campaignService.getCampaign(
      user.organizationId,
      id,
    );
    return { success: true, data: campaign };
  }

  @Put('campaigns/:id')
  @ApiOperation({ summary: 'Update campaign' })
  async updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const campaign = await this.campaignService.updateCampaign(
      user.organizationId,
      id,
      dto,
    );
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/start')
  @ApiOperation({ summary: 'Start a campaign' })
  async startCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const campaign = await this.campaignService.startCampaign(
      user.organizationId,
      id,
    );
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/pause')
  @ApiOperation({ summary: 'Pause a running campaign' })
  async pauseCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const campaign = await this.campaignService.pauseCampaign(
      user.organizationId,
      id,
    );
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/resume')
  @ApiOperation({ summary: 'Resume a paused campaign' })
  async resumeCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const campaign = await this.campaignService.resumeCampaign(
      user.organizationId,
      id,
    );
    return { success: true, data: campaign };
  }

  @Post('campaigns/:id/cancel')
  @ApiOperation({ summary: 'Cancel a campaign' })
  async cancelCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const campaign = await this.campaignService.cancelCampaign(
      user.organizationId,
      id,
    );
    return { success: true, data: campaign };
  }

  @Delete('campaigns/:id')
  @ApiOperation({ summary: 'Delete campaign' })
  async deleteCampaign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.campaignService.deleteCampaign(user.organizationId, id);
    return { success: true };
  }

  @Get('campaigns/:id/stats')
  @ApiOperation({ summary: 'Get campaign statistics' })
  async getCampaignStats(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const stats = await this.campaignService.getCampaignStats(
      user.organizationId,
      id,
    );
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
    const result = await this.campaignService.getCampaignMessages(
      user.organizationId,
      id,
      status,
      page,
      limit,
    );
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
    const webhook = await this.webhookService.createWebhook(
      user.organizationId,
      dto,
    );
    return { success: true, data: webhook };
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Get all webhooks' })
  async getWebhooks(@CurrentUser() user: AuthUser) {
    const webhooks = await this.webhookService.getWebhooks(user.organizationId);
    return { success: true, data: webhooks };
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Get webhook by ID' })
  async getWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const webhook = await this.webhookService.getWebhook(
      user.organizationId,
      id,
    );
    return { success: true, data: webhook };
  }

  @Put('webhooks/:id')
  @ApiOperation({ summary: 'Update webhook' })
  async updateWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateWebhookDto>,
  ) {
    const webhook = await this.webhookService.updateWebhook(
      user.organizationId,
      id,
      dto,
    );
    return { success: true, data: webhook };
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Delete webhook' })
  async deleteWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.webhookService.deleteWebhook(user.organizationId, id);
    return { success: true };
  }

  @Post('webhooks/:id/test')
  @ApiOperation({ summary: 'Test webhook endpoint' })
  async testWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.webhookService.testWebhook(
      user.organizationId,
      id,
    );
    return { success: true, data: result };
  }

  @Post('webhooks/:id/regenerate-secret')
  @ApiOperation({ summary: 'Regenerate webhook secret' })
  async regenerateWebhookSecret(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.webhookService.regenerateSecret(
      user.organizationId,
      id,
    );
    return { success: true, data: result };
  }

  // ==========================================
  // API KEYS
  // ==========================================

  @Post('api-keys')
  @ApiOperation({ summary: 'Create an API key (Enterprise only)' })
  async createApiKey(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    const result = await this.apiKeyService.createApiKey(
      user.organizationId,
      user.userId,
      dto,
    );
    return {
      success: true,
      data: {
        ...result.apiKey,
        key: result.key, // Only shown once!
      },
      warning: 'Save this API key now. It will not be shown again.',
    };
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'Get all API keys' })
  async getApiKeys(@CurrentUser() user: AuthUser) {
    const apiKeys = await this.apiKeyService.getApiKeys(user.organizationId);
    return { success: true, data: apiKeys };
  }

  @Get('api-keys/:id')
  @ApiOperation({ summary: 'Get API key by ID' })
  async getApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const apiKey = await this.apiKeyService.getApiKey(user.organizationId, id);
    return { success: true, data: apiKey };
  }

  @Put('api-keys/:id')
  @ApiOperation({ summary: 'Update API key' })
  async updateApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateApiKeyDto>,
  ) {
    const apiKey = await this.apiKeyService.updateApiKey(
      user.organizationId,
      id,
      dto,
    );
    return { success: true, data: apiKey };
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Delete API key' })
  async deleteApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.apiKeyService.deleteApiKey(user.organizationId, id);
    return { success: true };
  }

  @Post('api-keys/:id/toggle')
  @ApiOperation({ summary: 'Enable/disable API key' })
  async toggleApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    const apiKey = await this.apiKeyService.toggleApiKey(
      user.organizationId,
      id,
      isActive,
    );
    return { success: true, data: apiKey };
  }
}
