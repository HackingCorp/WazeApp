import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { WhatsAppService } from "./whatsapp.service";
import { WhatsAppActionsService } from "./whatsapp-actions.service";
import { ScheduledPostService } from "./scheduled-post.service";
import {
  AutomationSettingsDto,
  BlockDto,
  ChatActionDto,
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
} from "./dto/whatsapp-actions.dto";

const toContent = (dto: PublishContentDto) => ({
  text: dto.text,
  media: dto.media,
  backgroundColor: dto.backgroundColor,
  font: dto.font,
});

/**
 * Dashboard side of the automation features. Every route checks that the
 * session belongs to the caller before touching the socket.
 */
@ApiTags("WhatsApp Actions")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("whatsapp/sessions/:id")
export class WhatsAppActionsController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly actions: WhatsAppActionsService,
    private readonly posts: ScheduledPostService,
  ) {}

  private async own(user: any, sessionId: string) {
    return this.whatsappService.findOne(sessionId, user.userId, user.organizationId || null);
  }

  // ---- automation settings --------------------------------------------------

  @Get("automation")
  @ApiOperation({ summary: "Automation settings of the session" })
  async getAutomation(@CurrentUser() user: any, @Param("id") id: string) {
    await this.own(user, id);
    return this.actions.getAutomation(id);
  }

  @Put("automation")
  @ApiOperation({ summary: "Update automation settings (partial)" })
  async updateAutomation(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: AutomationSettingsDto) {
    await this.own(user, id);
    return this.actions.updateAutomation(id, dto);
  }

  // ---- messages -------------------------------------------------------------

  @Post("messages/poll")
  @ApiOperation({ summary: "Send a poll" })
  async poll(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: SendPollDto) {
    await this.own(user, id);
    return this.actions.sendPoll(id, dto);
  }

  @Get("polls")
  @ApiOperation({ summary: "Polls sent by this session, with votes" })
  async polls(@CurrentUser() user: any, @Param("id") id: string, @Query("chat") chat?: string) {
    await this.own(user, id);
    return this.actions.listPolls(id, chat);
  }

  @Get("polls/:pollId")
  async pollDetail(@CurrentUser() user: any, @Param("id") id: string, @Param("pollId") pollId: string) {
    await this.own(user, id);
    return this.actions.getPoll(id, pollId);
  }

  @Post("messages/location")
  @ApiOperation({ summary: "Send a location" })
  async location(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: SendLocationDto) {
    await this.own(user, id);
    return this.actions.sendLocation(id, dto);
  }

  @Post("messages/contacts")
  @ApiOperation({ summary: "Send contact cards" })
  async contacts(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: SendContactsDto) {
    await this.own(user, id);
    return this.actions.sendContacts(id, dto);
  }

  @Post("messages/voice")
  @ApiOperation({ summary: "Send a voice note (from text via TTS, or from an audio URL)" })
  async voice(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: SendVoiceDto) {
    await this.own(user, id);
    return this.actions.sendVoice(id, dto);
  }

  @Post("messages/react")
  @ApiOperation({ summary: "React to a message (empty emoji removes the reaction)" })
  async react(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ReactDto) {
    await this.own(user, id);
    return this.actions.react(id, dto);
  }

  @Post("messages/edit")
  @ApiOperation({ summary: "Edit one of our messages (within WhatsApp's 15-minute window)" })
  async edit(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: EditMessageDto) {
    await this.own(user, id);
    return this.actions.editMessage(id, dto);
  }

  @Post("messages/delete")
  @ApiOperation({ summary: "Delete a message for everyone" })
  async remove(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: MessageRefDto) {
    await this.own(user, id);
    return this.actions.deleteMessage(id, dto);
  }

  @Post("messages/forward")
  @ApiOperation({ summary: "Forward a stored message to other chats" })
  async forward(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ForwardMessageDto) {
    await this.own(user, id);
    return this.actions.forwardMessage(id, dto);
  }

  @Post("messages/read")
  @ApiOperation({ summary: "Send read receipts" })
  async read(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: MarkReadDto) {
    await this.own(user, id);
    return this.actions.markRead(id, dto);
  }

  @Post("chats/disappearing")
  @ApiOperation({ summary: "Set the disappearing-messages timer of a chat" })
  async disappearing(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: DisappearingDto) {
    await this.own(user, id);
    return this.actions.setDisappearing(id, dto);
  }

  // ---- chats ----------------------------------------------------------------

  @Post("chats/archive")
  async archive(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ChatToggleDto) {
    await this.own(user, id);
    return this.actions.archiveChat(id, dto.chat, dto.value !== false);
  }

  @Post("chats/pin")
  async pin(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ChatToggleDto) {
    await this.own(user, id);
    return this.actions.pinChat(id, dto.chat, dto.value !== false);
  }

  @Post("chats/unread")
  async unread(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ChatToggleDto) {
    await this.own(user, id);
    return this.actions.markChatUnread(id, dto.chat, dto.value !== false);
  }

  @Post("chats/mute")
  async mute(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: MuteDto) {
    await this.own(user, id);
    return this.actions.muteChat(id, dto.chat, dto.hours);
  }

  @Get("labels")
  async labels(@CurrentUser() user: any, @Param("id") id: string) {
    await this.own(user, id);
    return this.actions.listLabels(id);
  }

  @Post("labels")
  async createLabel(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: CreateLabelDto) {
    await this.own(user, id);
    return this.actions.createLabel(id, dto);
  }

  @Post("chats/labels")
  @ApiOperation({ summary: "Apply a label to a chat" })
  async addLabel(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ChatLabelDto) {
    await this.own(user, id);
    return this.actions.setChatLabel(id, dto.chat, dto.labelId, true);
  }

  @Delete("chats/labels")
  @ApiOperation({ summary: "Remove a label from a chat" })
  async removeLabel(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: ChatLabelDto) {
    await this.own(user, id);
    return this.actions.setChatLabel(id, dto.chat, dto.labelId, false);
  }

  @Post("contacts/block")
  async block(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: BlockDto) {
    await this.own(user, id);
    return this.actions.setBlock(id, dto.contact, dto.block !== false);
  }

  @Get("contacts/blocklist")
  async blocklist(@CurrentUser() user: any, @Param("id") id: string) {
    await this.own(user, id);
    return this.actions.blocklist(id);
  }

  // ---- profile & presence ---------------------------------------------------

  @Get("profile")
  async profile(@CurrentUser() user: any, @Param("id") id: string) {
    await this.own(user, id);
    return this.actions.getProfile(id);
  }

  @Put("profile")
  async updateProfile(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: UpdateProfileDto) {
    await this.own(user, id);
    return this.actions.updateProfile(id, dto);
  }

  @Get("presence")
  @ApiOperation({ summary: "Last known presence of a contact (requires presenceTracking)" })
  async presence(@CurrentUser() user: any, @Param("id") id: string, @Query("contact") contact: string) {
    await this.own(user, id);
    return this.actions.getPresence(id, contact);
  }

  // ---- groups ---------------------------------------------------------------

  @Get("groups")
  async groups(@CurrentUser() user: any, @Param("id") id: string) {
    await this.own(user, id);
    return this.actions.listGroups(id);
  }

  @Post("groups")
  async createGroup(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: CreateGroupDto) {
    await this.own(user, id);
    return this.actions.createGroup(id, dto);
  }

  @Post("groups/join")
  async joinGroup(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: JoinGroupDto) {
    await this.own(user, id);
    return this.actions.joinGroup(id, dto.invite);
  }

  @Get("groups/:groupId")
  async group(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string) {
    await this.own(user, id);
    return this.actions.getGroup(id, groupId);
  }

  @Put("groups/:groupId")
  async updateGroup(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string, @Body() dto: UpdateGroupDto) {
    await this.own(user, id);
    return this.actions.updateGroup(id, groupId, dto);
  }

  @Post("groups/:groupId/participants")
  async participants(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string, @Body() dto: GroupParticipantsDto) {
    await this.own(user, id);
    return this.actions.updateGroupParticipants(id, groupId, dto);
  }

  @Get("groups/:groupId/invite")
  async invite(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string, @Query("revoke") revoke?: string) {
    await this.own(user, id);
    return this.actions.getGroupInvite(id, groupId, revoke === "true");
  }

  @Get("groups/:groupId/requests")
  async joinRequests(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string) {
    await this.own(user, id);
    return this.actions.listJoinRequests(id, groupId);
  }

  @Post("groups/:groupId/requests")
  async handleRequests(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string, @Body() dto: GroupJoinRequestsDto) {
    await this.own(user, id);
    return this.actions.handleJoinRequests(id, groupId, dto);
  }

  @Post("groups/:groupId/messages")
  async groupMessage(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string, @Body() dto: PublishContentDto) {
    await this.own(user, id);
    return this.actions.sendToGroup(id, groupId, toContent(dto));
  }

  @Delete("groups/:groupId")
  @ApiOperation({ summary: "Leave the group" })
  async leaveGroup(@CurrentUser() user: any, @Param("id") id: string, @Param("groupId") groupId: string) {
    await this.own(user, id);
    return this.actions.leaveGroup(id, groupId);
  }

  // ---- channels -------------------------------------------------------------

  @Post("channels")
  async createChannel(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: CreateChannelDto) {
    await this.own(user, id);
    return this.actions.createChannel(id, dto);
  }

  @Get("channels/:channelId")
  @ApiOperation({ summary: "Channel metadata, by JID or invite link" })
  async channel(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string) {
    await this.own(user, id);
    return this.actions.getChannel(id, channelId);
  }

  @Put("channels/:channelId")
  async updateChannel(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string, @Body() dto: UpdateChannelDto) {
    await this.own(user, id);
    return this.actions.updateChannel(id, channelId, dto);
  }

  @Post("channels/:channelId/publish")
  async publish(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string, @Body() dto: PublishContentDto) {
    await this.own(user, id);
    return this.actions.publishToChannel(id, channelId, toContent(dto));
  }

  @Get("channels/:channelId/messages")
  async channelMessages(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string, @Query("count") count?: string) {
    await this.own(user, id);
    return this.actions.channelMessages(id, channelId, Number(count) || 20);
  }

  @Post("channels/:channelId/follow")
  async follow(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string, @Body() body: { follow?: boolean }) {
    await this.own(user, id);
    return this.actions.followChannel(id, channelId, body?.follow !== false);
  }

  @Delete("channels/:channelId")
  async deleteChannel(@CurrentUser() user: any, @Param("id") id: string, @Param("channelId") channelId: string) {
    await this.own(user, id);
    return this.actions.deleteChannel(id, channelId);
  }

  // ---- statuses -------------------------------------------------------------

  @Post("status")
  @ApiOperation({ summary: "Publish a status (story) to an audience" })
  async status(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: PublishStatusDto) {
    const session = await this.own(user, id);
    return this.actions.publishStatus(id, session.organizationId || null, toContent(dto), dto.audience);
  }

  @Get("status/audience-size")
  async audienceSize(@CurrentUser() user: any, @Param("id") id: string, @Query("type") type: string, @Query("tags") tags?: string) {
    const session = await this.own(user, id);
    const jids = await this.actions.resolveStatusAudience(id, session.organizationId || null, {
      type: (type as any) || "optin",
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    });
    return { type: type || "optin", viewers: jids.length };
  }

  // ---- scheduled posts ------------------------------------------------------

  @Get("scheduled-posts")
  async scheduled(@CurrentUser() user: any, @Param("id") id: string, @Query("status") status?: string) {
    await this.own(user, id);
    return this.posts.list(id, status);
  }

  @Post("scheduled-posts")
  async schedule(@CurrentUser() user: any, @Param("id") id: string, @Body() dto: SchedulePostDto) {
    const session = await this.own(user, id);
    return this.posts.schedule(id, session.organizationId || null, user.userId, {
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

  @Post("scheduled-posts/:postId/run")
  @ApiOperation({ summary: "Publish a scheduled post right now" })
  async runNow(@CurrentUser() user: any, @Param("id") id: string, @Param("postId") postId: string) {
    await this.own(user, id);
    await this.posts.get(id, postId);
    return this.posts.run(postId);
  }

  @Delete("scheduled-posts/:postId")
  async cancelPost(@CurrentUser() user: any, @Param("id") id: string, @Param("postId") postId: string) {
    await this.own(user, id);
    return this.posts.cancel(id, postId);
  }
}
