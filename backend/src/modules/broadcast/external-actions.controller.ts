import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { ClientIp } from '../../common/decorators/client-ip.decorator';
import { ApiKeyPermission, WhatsAppSession } from '../../common/entities';
import { ApiKeyService } from './api-key.service';
import { BaileysService } from '../whatsapp/baileys.service';
import { WhatsAppActionsService } from '../whatsapp/whatsapp-actions.service';
import { ScheduledPostService } from '../whatsapp/scheduled-post.service';
import {
  AutomationSettingsDto,
  BlockDto,
  ChatLabelDto,
  ChatToggleDto,
  CreateChannelDto,
  CreateGroupDto,
  CreateLabelDto,
  DisappearingDto,
  EditMessageDto,
  ForwardMessageDto,
  GroupJoinRequestsDto,
  GroupParticipantsDto,
  JoinGroupDto,
  MarkReadDto,
  MessageRefDto,
  MuteDto,
  PublishContentDto,
  PublishStatusDto,
  ReactDto,
  SchedulePostDto,
  SendContactsDto,
  SendLocationDto,
  SendPollDto,
  SendVoiceDto,
  UpdateChannelDto,
  UpdateGroupDto,
  UpdateProfileDto,
} from '../whatsapp/dto/whatsapp-actions.dto';

const toContent = (dto: PublishContentDto) => ({
  text: dto.text,
  media: dto.media,
  backgroundColor: dto.backgroundColor,
  font: dto.font,
});

/**
 * Partner-facing side of the automation features, authenticated by API key.
 * The key is bound to one session, so no session id travels in the URL.
 *
 * Permissions: message-level actions need `send:message`; groups need
 * `groups:manage`; channels and statuses `channels:publish`; settings,
 * profile, labels and blocking `automation:manage`.
 */
@ApiTags('External API — Actions')
@ApiHeader({ name: 'x-api-key', description: 'API key', required: true })
@Controller('external')
@Public()
export class ExternalActionsController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly baileysService: BaileysService,
    private readonly actions: WhatsAppActionsService,
    private readonly posts: ScheduledPostService,
    @InjectRepository(WhatsAppSession)
    private readonly sessionRepository: Repository<WhatsAppSession>,
  ) {}

  /** Validate the key, enforce its rate limit and return the bound session. */
  private async auth(apiKey: string, ip: string, permission: ApiKeyPermission) {
    const key = await this.apiKeyService.validateApiKey(apiKey, permission, ip);
    const rate = await this.apiKeyService.checkRateLimit(key.keyHash, key.rateLimitPerMinute, key.rateLimitPerDay);
    if (!rate.allowed) {
      throw new HttpException(
        { success: false, error: 'RATE_LIMITED', message: rate.message, retryAfter: rate.retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!key.sessionId) {
      throw new ForbiddenException('This API key is not bound to a WhatsApp session');
    }
    const session = await this.sessionRepository.findOne({ where: { id: key.sessionId } });
    if (!session) throw new NotFoundException('WhatsApp session not found');
    if (session.organizationId !== key.organizationId) {
      throw new ForbiddenException('This WhatsApp session does not belong to your organization');
    }
    return { session, organizationId: key.organizationId, keyId: key.keyId };
  }

  private requireConnected(sessionId: string) {
    if (this.baileysService.getSessionStatus(sessionId) !== 'connected') {
      throw new ForbiddenException('WhatsApp session is not connected');
    }
  }

  // ---- automation -----------------------------------------------------------

  @Get('automation')
  @ApiOperation({ summary: 'Automation settings of the session bound to the key' })
  async getAutomation(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    return this.actions.getAutomation(session.id);
  }

  @Put('automation')
  @ApiOperation({ summary: 'Update automation settings (partial)' })
  async updateAutomation(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: AutomationSettingsDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    return this.actions.updateAutomation(session.id, dto);
  }

  // ---- messages -------------------------------------------------------------

  @Post('messages/poll')
  @ApiOperation({ summary: 'Send a poll' })
  async poll(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: SendPollDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.sendPoll(session.id, dto);
  }

  @Get('polls')
  async polls(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Query('chat') chat?: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    return this.actions.listPolls(session.id, chat);
  }

  @Get('polls/:pollId')
  async pollDetail(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('pollId') pollId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    return this.actions.getPoll(session.id, pollId);
  }

  @Post('messages/location')
  async location(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: SendLocationDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.sendLocation(session.id, dto);
  }

  @Post('messages/contacts')
  async contacts(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: SendContactsDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.sendContacts(session.id, dto);
  }

  @Post('messages/voice')
  @ApiOperation({ summary: 'Send a voice note (TTS from text, or an audio URL)' })
  async voice(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: SendVoiceDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.sendVoice(session.id, dto);
  }

  @Post('messages/react')
  async react(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ReactDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.react(session.id, dto);
  }

  @Post('messages/edit')
  async edit(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: EditMessageDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.editMessage(session.id, dto);
  }

  @Post('messages/delete')
  async remove(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: MessageRefDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.deleteMessage(session.id, dto);
  }

  @Post('messages/forward')
  async forward(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ForwardMessageDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.forwardMessage(session.id, dto);
  }

  @Post('messages/read')
  async read(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: MarkReadDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.markRead(session.id, dto);
  }

  @Post('chats/disappearing')
  async disappearing(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: DisappearingDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.setDisappearing(session.id, dto);
  }

  // ---- chats ----------------------------------------------------------------

  @Post('chats/archive')
  async archive(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ChatToggleDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.archiveChat(session.id, dto.chat, dto.value !== false);
  }

  @Post('chats/pin')
  async pin(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ChatToggleDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.pinChat(session.id, dto.chat, dto.value !== false);
  }

  @Post('chats/unread')
  async unread(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ChatToggleDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.markChatUnread(session.id, dto.chat, dto.value !== false);
  }

  @Post('chats/mute')
  async mute(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: MuteDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.muteChat(session.id, dto.chat, dto.hours);
  }

  @Get('labels')
  async labels(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    return this.actions.listLabels(session.id);
  }

  @Post('labels')
  async createLabel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: CreateLabelDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.createLabel(session.id, dto);
  }

  @Post('chats/labels')
  async addLabel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ChatLabelDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.setChatLabel(session.id, dto.chat, dto.labelId, true);
  }

  @Delete('chats/labels')
  async removeLabel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: ChatLabelDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.setChatLabel(session.id, dto.chat, dto.labelId, false);
  }

  @Post('contacts/block')
  async block(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: BlockDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.setBlock(session.id, dto.contact, dto.block !== false);
  }

  @Get('contacts/blocklist')
  async blocklist(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.blocklist(session.id);
  }

  // ---- profile & presence ---------------------------------------------------

  @Get('profile')
  async profile(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.getProfile(session.id);
  }

  @Put('profile')
  async updateProfile(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: UpdateProfileDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    this.requireConnected(session.id);
    return this.actions.updateProfile(session.id, dto);
  }

  @Get('presence')
  @ApiOperation({ summary: 'Last known presence of a contact (needs presenceTracking enabled)' })
  async presence(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Query('contact') contact: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.AUTOMATION_MANAGE);
    return this.actions.getPresence(session.id, contact);
  }

  // ---- groups ---------------------------------------------------------------

  @Get('groups')
  async groups(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.listGroups(session.id);
  }

  @Post('groups')
  async createGroup(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: CreateGroupDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.createGroup(session.id, dto);
  }

  @Post('groups/join')
  async joinGroup(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: JoinGroupDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.joinGroup(session.id, dto.invite);
  }

  @Get('groups/:groupId')
  async group(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.getGroup(session.id, groupId);
  }

  @Put('groups/:groupId')
  async updateGroup(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.updateGroup(session.id, groupId, dto);
  }

  @Post('groups/:groupId/participants')
  async participants(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string, @Body() dto: GroupParticipantsDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.updateGroupParticipants(session.id, groupId, dto);
  }

  @Get('groups/:groupId/invite')
  async invite(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string, @Query('revoke') revoke?: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.getGroupInvite(session.id, groupId, revoke === 'true');
  }

  @Get('groups/:groupId/requests')
  async joinRequests(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.listJoinRequests(session.id, groupId);
  }

  @Post('groups/:groupId/requests')
  async handleRequests(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string, @Body() dto: GroupJoinRequestsDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.handleJoinRequests(session.id, groupId, dto);
  }

  @Post('groups/:groupId/messages')
  async groupMessage(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string, @Body() dto: PublishContentDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.SEND_MESSAGE);
    this.requireConnected(session.id);
    return this.actions.sendToGroup(session.id, groupId, toContent(dto));
  }

  @Delete('groups/:groupId')
  async leaveGroup(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('groupId') groupId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.GROUPS_MANAGE);
    this.requireConnected(session.id);
    return this.actions.leaveGroup(session.id, groupId);
  }

  // ---- channels -------------------------------------------------------------

  @Post('channels')
  async createChannel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: CreateChannelDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.createChannel(session.id, dto);
  }

  @Get('channels/:channelId')
  async channel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('channelId') channelId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.getChannel(session.id, channelId);
  }

  @Put('channels/:channelId')
  async updateChannel(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('channelId') channelId: string, @Body() dto: UpdateChannelDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.updateChannel(session.id, channelId, dto);
  }

  @Post('channels/:channelId/publish')
  @ApiOperation({ summary: 'Publish text or media on a channel' })
  async publish(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('channelId') channelId: string, @Body() dto: PublishContentDto) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.publishToChannel(session.id, channelId, toContent(dto));
  }

  @Get('channels/:channelId/messages')
  async channelMessages(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('channelId') channelId: string, @Query('count') count?: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.channelMessages(session.id, channelId, Number(count) || 20);
  }

  // ---- statuses -------------------------------------------------------------

  @Post('status')
  @ApiOperation({ summary: 'Publish a status (story) to an audience' })
  async status(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: PublishStatusDto) {
    const { session, organizationId } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    this.requireConnected(session.id);
    return this.actions.publishStatus(session.id, organizationId, toContent(dto), dto.audience);
  }

  // ---- scheduled posts ------------------------------------------------------

  @Get('scheduled-posts')
  async scheduled(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Query('status') status?: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    return this.posts.list(session.id, status);
  }

  @Post('scheduled-posts')
  @ApiOperation({ summary: 'Schedule a channel / status / group / chat post (optionally recurring with cron)' })
  async schedule(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Body() dto: SchedulePostDto) {
    const { session, organizationId, keyId } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    return this.posts.schedule(session.id, organizationId, `apikey:${keyId}`, {
      kind: dto.kind,
      target: dto.target,
      content: {
        text: dto.text,
        mediaUrl: dto.media?.url,
        mediaType: dto.media?.type,
        caption: dto.media?.caption,
        fileName: dto.media?.fileName,
        backgroundColor: dto.backgroundColor,
        font: dto.font,
      },
      audience: dto.audience,
      scheduledAt: dto.scheduledAt,
      cron: dto.cron,
    });
  }

  @Delete('scheduled-posts/:postId')
  async cancelPost(@Headers('x-api-key') apiKey: string, @ClientIp() ip: string, @Param('postId') postId: string) {
    const { session } = await this.auth(apiKey, ip, ApiKeyPermission.CHANNELS_PUBLISH);
    return this.posts.cancel(session.id, postId);
  }
}
