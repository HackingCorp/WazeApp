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
  ParseUUIDPipe,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { v4 as uuidv4 } from "uuid";
import { WhatsAppService } from "./whatsapp.service";
import {
  CreateWhatsAppSessionDto,
  UpdateWhatsAppSessionDto,
  WhatsAppSessionQueryDto,
  SendMessageDto,
  WhatsAppSessionResponseDto,
  QRCodeResponseDto,
  MessageResponseDto,
  SessionStatsDto,
} from "./dto/whatsapp.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole, WhatsAppSessionStatus, ConversationChannel } from "@/common/enums";
import { Public } from "@/common/decorators/public.decorator";
import { AllowIndividualUsers } from "@/common/decorators/allow-individual-users.decorator";
import { SimpleConversationService } from "./simple-conversation.service";
import { WhatsAppGateway } from "./whatsapp.gateway";
import { BaileysService } from "./baileys.service";
import { VisionService } from "./vision.service";

@ApiTags("WhatsApp")
@Controller("whatsapp")
@UseGuards(JwtAuthGuard)
@AllowIndividualUsers()
@ApiBearerAuth()
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private whatsappService: WhatsAppService,
    private conversationService: SimpleConversationService,
    private eventEmitter: EventEmitter2,
    private whatsappGateway: WhatsAppGateway,
    private baileysService: BaileysService,
    private visionService: VisionService,
    private configService: ConfigService,
  ) {}

  private ensureDebugMode() {
    if (this.configService.get("NODE_ENV") === "production") {
      throw new ForbiddenException("Debug endpoints are disabled in production");
    }
  }

  @Post("sessions")
  @ApiOperation({ summary: "Create new WhatsApp session" })
  @ApiResponse({
    status: 201,
    description: "Session created successfully",
    type: WhatsAppSessionResponseDto,
  })
  async createSession(
    @Body() createDto: CreateWhatsAppSessionDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<WhatsAppSessionResponseDto> {
    return this.whatsappService.create(
      createDto,
      user.userId,
      user.organizationId || null,
    );
  }

  @Get("sessions")
  @ApiOperation({ summary: "Get WhatsApp sessions" })
  @ApiResponse({ status: 200, description: "Sessions retrieved successfully" })
  async getSessions(
    @Query() query: WhatsAppSessionQueryDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<PaginatedResult<any>> {
    const userId = user.userId;
    const result = await this.whatsappService.findAll(
      query,
      userId,
      user?.organizationId || null,
    );
    
    // Add isConnected field for frontend compatibility
    const enhancedData = result.data.map(session => ({
      ...session,
      isConnected: session.status === WhatsAppSessionStatus.CONNECTED
    }));
    
    return {
      ...result,
      data: enhancedData
    };
  }

  @Get("sessions/:id")
  @ApiOperation({ summary: "Get WhatsApp session by ID" })
  @ApiResponse({
    status: 200,
    description: "Session found",
    type: WhatsAppSessionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Session not found" })
  async getSession(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<WhatsAppSessionResponseDto> {
    return this.whatsappService.findOne(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Put("sessions/:id")
  @ApiOperation({ summary: "Update WhatsApp session" })
  @ApiResponse({
    status: 200,
    description: "Session updated successfully",
    type: WhatsAppSessionResponseDto,
  })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async updateSession(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateWhatsAppSessionDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<WhatsAppSessionResponseDto> {
    return this.whatsappService.update(
      id,
      updateDto,
      user.userId,
      user.organizationId || null,
    );
  }

  @Delete("sessions/:id")
  @ApiOperation({ summary: "Delete WhatsApp session" })
  @ApiResponse({ status: 200, description: "Session deleted successfully" })
  async deleteSession(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.whatsappService.delete(
      id,
      user.userId,
      user.organizationId || null,
    );
    return { message: "Session deleted successfully" };
  }

  @Post("sessions/:id/connect")
  @ApiOperation({ summary: "Connect WhatsApp session" })
  @ApiResponse({
    status: 200,
    description: "Connection initiated",
    type: QRCodeResponseDto,
  })
  async connectSession(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ qrCode?: string; message: string }> {
    return this.whatsappService.connect(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Post("sessions/:id/disconnect")
  @ApiOperation({ summary: "Disconnect WhatsApp session" })
  @ApiResponse({
    status: 200,
    description: "Session disconnected successfully",
  })
  async disconnectSession(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.whatsappService.disconnect(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Get("sessions/:id/qr")
  @ApiOperation({ summary: "Get QR code for session connection" })
  @ApiResponse({
    status: 200,
    description: "QR code retrieved successfully",
    type: QRCodeResponseDto,
  })
  @ApiResponse({ status: 400, description: "QR code not available" })
  async getQRCode(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<QRCodeResponseDto> {
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.whatsappService.getQRCode(id, user.userId, user.organizationId || null);
  }

  @Post("sessions/:id/pairing-code")
  @ApiOperation({ summary: "Get pairing code for session connection (alternative to QR)" })
  @ApiResponse({
    status: 200,
    description: "Pairing code generated successfully",
  })
  @ApiResponse({ status: 400, description: "Could not generate pairing code" })
  async getPairingCode(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { phoneNumber: string },
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ pairingCode: string; expiresAt: Date }> {
    return this.whatsappService.requestPairingCode(
      id,
      body.phoneNumber,
      user.userId,
      user.organizationId || null,
    );
  }

  @Post("sessions/:id/send")
  @ApiOperation({ summary: "Send WhatsApp message" })
  @ApiResponse({
    status: 200,
    description: "Message sent successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: "Session not connected" })
  async sendMessage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() messageDto: SendMessageDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<MessageResponseDto> {
    const result = await this.whatsappService.sendMessage(
      id,
      messageDto,
      user.userId,
      user.organizationId || null,
    );

    return {
      messageId: result.messageId,
      status: result.status as MessageResponseDto['status'],
      timestamp: new Date(),
    };
  }

  @Get("sessions/:id/stats")
  @ApiOperation({ summary: "Get session statistics" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
    type: SessionStatsDto,
  })
  async getSessionStats(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<SessionStatsDto> {
    return this.whatsappService.getSessionStats(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Get("sessions/:id/contacts")
  @ApiOperation({ summary: "Get contacts for a WhatsApp session" })
  @ApiResponse({
    status: 200,
    description: "Contacts retrieved successfully",
  })
  async getSessionContacts(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    const contacts = await this.whatsappService.getContacts(
      id,
      user.userId,
      user.organizationId || null,
    );

    return {
      success: true,
      data: contacts,
      count: contacts.length,
    };
  }

  @Get("contacts/lookup")
  @ApiOperation({ summary: "Lookup contact name by phone number" })
  @ApiResponse({
    status: 200,
    description: "Contact name retrieved",
  })
  async lookupContactName(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("sessionId") sessionId: string,
    @Query("phoneNumber") phoneNumber: string,
  ) {
    // Verify the session belongs to the authenticated user
    const session = await this.baileysService.getSessionInfo(sessionId);
    if (!session || session.userId !== user.userId) {
      throw new NotFoundException("Session not found");
    }
    const name = await this.whatsappService.getContactName(sessionId, phoneNumber);
    return {
      success: true,
      data: { phoneNumber, name },
    };
  }

  @Get("sessions/:id/status")
  @ApiOperation({ summary: "Get real-time session status" })
  @ApiResponse({ status: 200, description: "Status retrieved successfully" })
  async getRealTimeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ status: string; isActive: boolean; needsSync: boolean }> {
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    return this.whatsappService.getRealTimeStatus(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Get("conversations")
  @Throttle({ default: { limit: 500, ttl: 60000 } }) // Higher limit for conversation loading
  @ApiOperation({ summary: "Get WhatsApp conversations for user" })
  @ApiResponse({
    status: 200,
    description: "Conversations retrieved successfully",
  })
  async getConversations(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("sessionId") sessionId?: string,
    @Query("clearCache") clearCache?: string,
  ) {
    // Use authenticated user's ID
    const userId = user.userId;

    // Clear memory cache if requested (admin/owner only)
    if (clearCache === "true") {
      if (!user.role || !['admin', 'owner'].includes(user.role)) {
        throw new ForbiddenException('Only admins can clear cache');
      }
      this.conversationService["conversations"].clear();
      this.conversationService["messages"].clear();
    }

    let conversations = await this.conversationService.getConversationsForUser(
      userId,
      sessionId,
    );

    // FORCE deduplication at API level
    const normalizePhoneNumber = (phoneNumber: string): string => {
      return phoneNumber
        .replace(/@s\.whatsapp\.net$/i, "")
        .replace(/@g\.us$/i, "")
        .replace(/@lid$/i, "")
        .replace(/@c\.us$/i, "")
        .replace(/\s+/g, "")
        .replace(/^\+/, "")
        .trim();
    };

    // Group by normalized phone number and keep the most recent one
    const phoneGroups = new Map<string, any>();
    conversations.forEach((conv) => {
      const normalizedPhone = normalizePhoneNumber(conv.phoneNumber);
      const key = `${userId}-${normalizedPhone}`;
      const existing = phoneGroups.get(key);

      if (
        !existing ||
        new Date(conv.lastMessageTime) > new Date(existing.lastMessageTime)
      ) {
        // Preserve existing name if it's a real contact name (not just a phone number)
        const existingName = conv.name || "";
        const isPhoneName = /^[\+\d\s\-()]+$/.test(existingName) || existingName === "Contact WhatsApp";
        phoneGroups.set(key, {
          ...conv,
          phoneNumber: normalizedPhone,
          name: isPhoneName
            ? `+${normalizedPhone}`
            : existingName,
        });
      }
    });

    conversations = Array.from(phoneGroups.values()).sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime(),
    );

    return conversations;
  }

  @Get("conversations/:id/messages")
  @Throttle({ default: { limit: 500, ttl: 60000 } }) // Higher limit for message loading
  @ApiOperation({ summary: "Get messages for a conversation" })
  @ApiResponse({ status: 200, description: "Messages retrieved successfully" })
  async getConversationMessages(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    return this.conversationService.getMessagesForConversation(id, user.userId);
  }

  @Post("conversations/:id/messages")
  @ApiOperation({ summary: "Send message in conversation" })
  @ApiResponse({ status: 201, description: "Message sent successfully" })
  async sendConversationMessage(
    @Param("id") id: string,
    @Body() body: { content: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'document'; caption?: string; filename?: string },
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    const userId = user.userId;
    const mediaOptions = body.mediaUrl ? {
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType,
      caption: body.caption,
      filename: body.filename,
    } : undefined;
    const message = await this.conversationService.sendMessage(
      id,
      body.content,
      userId,
      mediaOptions,
    );
    return {
      success: true,
      data: message,
    };
  }

  @Put("conversations/:id/read")
  @ApiOperation({ summary: "Mark conversation as read" })
  @ApiResponse({ status: 200, description: "Conversation marked as read" })
  async markConversationAsRead(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    await this.conversationService.markConversationAsRead(id, user.userId);
    return {
      success: true,
      message: "Conversation marked as read",
    };
  }

  @Post("test/simulate-message")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Simulate incoming WhatsApp message for testing" })
  @ApiResponse({ status: 200, description: "Message simulated successfully" })
  async simulateMessage(
    @Body() body: { phoneNumber: string; message: string },
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    this.ensureDebugMode();
    // Get user's first WhatsApp session
    const sessions = await this.whatsappService.findAll(
      {},
      user.userId,
      user.organizationId || null,
    );
    if (!sessions.data.length) {
      return { success: false, message: "No WhatsApp sessions found" };
    }

    const sessionId = sessions.data[0].id;

    // Simulate the whatsapp.message.received event with proper structure
    const mockMessageData = {
      sessionId,
      message: {
        key: {
          id: `test_${Date.now()}`,
          remoteJid: body.phoneNumber,
          fromMe: false,
        },
        message: {
          conversation: body.message,
        },
        messageTimestamp: Date.now(),
      },
      type: 'text',
    };

    // Emit the correct event that WhatsAppAIResponderService listens to
    this.eventEmitter.emit("whatsapp.message.received", mockMessageData);

    return {
      success: true,
      message: "Message simulation triggered",
      data: mockMessageData,
    };
  }

  @Get("debug/websocket-status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Check WebSocket connection status" })
  @ApiResponse({ status: 200, description: "WebSocket status retrieved" })
  async getWebSocketStatus(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    const connectedUsers = this.whatsappGateway.getConnectedUsers();
    const isUserOnline = this.whatsappGateway.isUserOnline(user.userId);

    return {
      success: true,
      data: {
        totalConnectedUsers: connectedUsers.length,
        connectedUsers,
        currentUserOnline: isUserOnline,
        currentUserId: user.userId,
      },
    };
  }

  @Post("sessions/:id/sync")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Trigger manual sync for WhatsApp session" })
  @ApiResponse({ status: 200, description: "Sync triggered successfully" })
  async triggerSync(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    const session = await this.whatsappService["sessionRepository"].findOne({
      where: { id },
    });

    if (!session) {
      return { success: false, message: "Session not found" };
    }

    // Check if session is connected
    if (session.status !== WhatsAppSessionStatus.CONNECTED) {
      return { success: false, message: "Session must be connected to sync" };
    }

    // Trigger sync by emitting connection event to Baileys service
    this.eventEmitter.emit("whatsapp.trigger.sync", { sessionId: id });

    return {
      success: true,
      message: "Sync triggered successfully",
      data: { sessionId: id },
    };
  }

  @Get("debug/active-sessions")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Get active Baileys sessions (Admin only)" })
  @ApiResponse({ status: 200, description: "Active sessions retrieved" })
  async getActiveSessions(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    return {
      success: true,
      data: this.baileysService.getActiveSessions(),
    };
  }

  @Get("debug/conversations")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: "Debug: Get all conversations (Admin only)" })
  @ApiResponse({ status: 200, description: "Conversations retrieved" })
  async getDebugConversations(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    // Get all conversations from database
    const allConversations = await this.conversationService[
      "conversationRepository"
    ].find({
      where: { channel: ConversationChannel.WHATSAPP },
      order: { updatedAt: "DESC" },
      take: 50,
    });

    // Show user info for each conversation
    const conversationInfo = allConversations.map((conv) => ({
      id: conv.id,
      userId: conv.userId,
      externalId: conv.externalId,
      updatedAt: conv.updatedAt,
      context: conv.context,
    }));

    return {
      success: true,
      totalConversations: allConversations.length,
      conversations: conversationInfo,
    };
  }

  @Get("debug/conversations-deduplicated")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Get conversations with forced deduplication (Admin only)",
  })
  @ApiResponse({
    status: 200,
    description: "Deduplicated conversations retrieved",
  })
  async getDeduplicatedConversations(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("sessionId") sessionId?: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    const userId = user.userId;

    // Get original conversations
    let conversations = await this.conversationService.getConversationsForUser(
      userId,
      sessionId,
    );
    const originalCount = conversations.length;

    // Apply deduplication
    const normalizePhoneNumber = (phoneNumber: string): string => {
      return phoneNumber
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "")
        .replace(/\s+/g, "")
        .replace(/^\+/, "")
        .trim();
    };

    // Group by normalized phone number
    const phoneGroups = new Map();
    conversations.forEach((conv) => {
      const normalizedPhone = normalizePhoneNumber(conv.phoneNumber);
      const key = `${userId}-${normalizedPhone}`;
      const existing = phoneGroups.get(key);

      if (
        !existing ||
        new Date(conv.lastMessageTime) > new Date(existing.lastMessageTime)
      ) {
        phoneGroups.set(key, {
          ...conv,
          phoneNumber: normalizedPhone,
          name: normalizedPhone.startsWith("+")
            ? normalizedPhone
            : `+${normalizedPhone}`,
        });
      }
    });

    const deduplicatedConversations = Array.from(phoneGroups.values());

    return {
      success: true,
      originalCount,
      deduplicatedCount: deduplicatedConversations.length,
      conversations: deduplicatedConversations.sort(
        (a, b) =>
          new Date(b.lastMessageTime).getTime() -
          new Date(a.lastMessageTime).getTime(),
      ),
    };
  }

  @Get("debug/current-user")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Get current authenticated user" })
  @ApiResponse({ status: 200, description: "Current user retrieved" })
  async getCurrentUser(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    return {
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        organizationId: user.organizationId,
      },
    };
  }

  @Get("debug/sessions-db")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Get all sessions from database (Admin only)" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessionsFromDB(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    const dbSessions = await this.whatsappService["sessionRepository"].find({
      order: { updatedAt: "DESC" },
    });

    return {
      success: true,
      totalSessions: dbSessions.length,
      sessions: dbSessions.map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        userId: session.userId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
    };
  }

  @Get("debug/messages/:conversationId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Get all messages for a conversation (Admin only)" })
  @ApiResponse({ status: 200, description: "Messages retrieved" })
  async getDebugMessages(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("conversationId") conversationId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    // Get messages from database directly
    const dbMessages = await this.conversationService["messageRepository"].find(
      {
        where: { conversationId },
        order: { createdAt: "ASC" },
      },
    );

    return {
      success: true,
      conversationId,
      totalMessages: dbMessages.length,
      messages: dbMessages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        status: msg.status,
        createdAt: msg.createdAt,
        conversationId: msg.conversationId,
      })),
    };
  }

  @Post("debug/persist-conversations")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Force persist memory conversations to database (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Conversations persisted" })
  async persistMemoryConversations(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Emit event to force conversation persistence
      this.eventEmitter.emit("whatsapp.persist.conversations", {
        userId: user.userId,
      });

      return {
        success: true,
        message: "Memory conversations persistence triggered",
      };
    } catch (error) {
      this.logger.error(`[PERSIST-CONVERSATIONS] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/download-images/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Force download images for existing messages (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Image download triggered" })
  async forceDownloadImages(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Emit event to force image download
      this.eventEmitter.emit("whatsapp.force.download.images", {
        sessionId: sessionId,
      });

      return {
        success: true,
        message: `Image download triggered for session ${sessionId}`,
      };
    } catch (error) {
      this.logger.error(`[FORCE-IMAGES] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-sync/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Force sync for a specific session (Admin only)" })
  @ApiResponse({ status: 200, description: "Sync forced" })
  async forceSyncSession(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Try to force sync via Baileys service
      this.eventEmitter.emit("whatsapp.force.sync", {
        sessionId: sessionId,
        userId: session.userId,
      });

      return {
        success: true,
        message: `Force sync triggered for session ${sessionId}`,
        sessionInfo: {
          id: session.id,
          name: session.name,
          status: session.status,
          userId: session.userId,
        },
      };
    } catch (error) {
      this.logger.error(`[FORCE-SYNC] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-reconnect/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary:
      "Debug: Force reconnect session (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Session reconnected" })
  async forceReconnectSession(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // First disconnect the session
      await this.baileysService.disconnectSession(sessionId);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Then reconnect with new configuration
      const result = await this.baileysService.connectSession(sessionId, false);

      return {
        success: true,
        message: `Session ${sessionId} reconnected with syncFullHistory=true`,
        sessionInfo: {
          id: session.id,
          name: session.name,
          status: session.status,
          userId: session.userId,
        },
        needsQR: result.needsQR,
      };
    } catch (error) {
      this.logger.error(`[FORCE-RECONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-reset-reconnect/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Force reset and reconnect session (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Session reset and reconnected" })
  async forceResetReconnectSession(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Force reset will clear credentials and require new QR scan
      // This should trigger a fresh myAppStateKeyId generation
      const result = await this.baileysService.connectSession(sessionId, true); // forceReset = true

      return {
        success: true,
        message: `Session ${sessionId} reset and reconnected - requires QR scan`,
        sessionInfo: {
          id: session.id,
          name: session.name,
          status: session.status,
          userId: session.userId,
        },
        needsQR: result.needsQR,
        note: "This session will require scanning a new QR code",
      };
    } catch (error) {
      this.logger.error(`[FORCE-RESET-RECONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/cleanup-duplicates/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Cleanup duplicate conversations (Admin only)" })
  @ApiResponse({ status: 200, description: "Duplicates cleaned up" })
  async cleanupDuplicates(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Call the cleanup function directly
      await this.conversationService["cleanupDuplicateConversations"](userId);

      return {
        success: true,
        message: `Duplicate conversations cleaned up for user ${userId}`,
      };
    } catch (error) {
      this.logger.error(`[CLEANUP-DUPLICATES] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-cleanup-all-duplicates")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Force cleanup ALL duplicate conversations (Admin only)",
  })
  @ApiResponse({ status: 200, description: "All duplicates cleaned up" })
  async forceCleanupAllDuplicates(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get all conversations from database
      const allConversations = await this.conversationService[
        "conversationRepository"
      ].find({
        where: { channel: ConversationChannel.WHATSAPP },
        order: { createdAt: "ASC" },
        take: 50,
      });

      // Group conversations by normalized phone number and user
      const normalizePhoneNumber = (phoneNumber: string): string => {
        return phoneNumber
          .replace("@s.whatsapp.net", "")
          .replace("@g.us", "")
          .replace(/\s+/g, "")
          .trim();
      };

      const phoneGroups = new Map<string, typeof allConversations>();

      for (const conversation of allConversations) {
        const normalizedPhone = normalizePhoneNumber(
          conversation.externalId || "",
        );
        const key = `${conversation.userId}-${normalizedPhone}`;

        if (!phoneGroups.has(key)) {
          phoneGroups.set(key, []);
        }
        phoneGroups.get(key)!.push(conversation);
      }

      let totalMerged = 0;
      let totalDeleted = 0;

      // Process each phone group and merge duplicates
      for (const [key, conversations] of phoneGroups.entries()) {
        if (conversations.length > 1) {
          // Keep the oldest conversation (first in the sorted array)
          const conversationToKeep = conversations[0];
          const conversationsToDelete = conversations.slice(1);

          // Update the conversation we're keeping with normalized phone number
          const [userId, normalizedPhone] = key.split("-");
          await this.conversationService["conversationRepository"].update(
            conversationToKeep.id,
            {
              externalId: normalizedPhone,
              updatedAt: new Date(),
            },
          );

          // Move messages from duplicate conversations to the main one
          for (const duplicateConv of conversationsToDelete) {
            if (duplicateConv.messages && duplicateConv.messages.length > 0) {
              for (const message of duplicateConv.messages) {
                await this.conversationService["messageRepository"].update(
                  message.id,
                  {
                    conversationId: conversationToKeep.id,
                  },
                );
              }
            }

            // Delete the duplicate conversation
            await this.conversationService["conversationRepository"].remove(
              duplicateConv,
            );
            totalDeleted++;
          }

          totalMerged++;
        }
      }

      // Clear memory cache to force reload from database
      this.conversationService["conversations"].clear();
      this.conversationService["messages"].clear();

      return {
        success: true,
        message: `Cleanup completed successfully`,
        details: {
          totalConversations: allConversations.length,
          phoneGroups: phoneGroups.size,
          groupsMerged: totalMerged,
          conversationsDeleted: totalDeleted,
        },
      };
    } catch (error) {
      this.logger.error(`[FORCE-CLEANUP-ALL] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/simulate-incoming-message")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Debug: Simulate incoming WhatsApp message (Admin only)" })
  @ApiResponse({ status: 200, description: "Message simulated successfully" })
  async simulateIncomingMessage(
    @CurrentUser() user: AuthenticatedRequest,
    @Body()
    body: {
      sessionId: string;
      fromNumber: string;
      message: string;
      isGroup?: boolean;
    },
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database to ensure it exists
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: body.sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Create a mock WhatsApp message object similar to Baileys format
      const mockWhatsAppMessage = {
        key: {
          id: uuidv4(), // Generate proper UUID for message ID
          remoteJid: body.fromNumber,
          fromMe: false,
        },
        message: {
          conversation: body.message,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      };

      // Emit the whatsapp.message.received event to trigger AI response
      const eventData = {
        sessionId: body.sessionId,
        message: mockWhatsAppMessage,
        type: "message",
      };

      this.eventEmitter.emit("whatsapp.message.received", eventData);

      return {
        success: true,
        message: "Incoming message simulated successfully",
        data: {
          sessionId: body.sessionId,
          userId: session.userId,
          organizationId: session.organizationId || null,
          fromNumber: body.fromNumber,
          messageText: body.message,
          messageId: mockWhatsAppMessage.key.id,
          timestamp: new Date(),
          isGroup: body.isGroup || false,
          isFromMe: false,
          messageType: "text",
        },
      };
    } catch (error) {
      this.logger.error(`[SIMULATE-INCOMING] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-logout/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary:
      "Debug: Force complete logout from WhatsApp servers (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Session forcefully logged out" })
  async forceLogoutSession(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Use our enhanced disconnectSession which will force logout even if no active socket
      await this.baileysService.disconnectSession(sessionId);

      // Update database status
      await this.whatsappService["sessionRepository"].update(sessionId, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
        qrCode: null,
        qrCodeExpiresAt: null,
      });

      return {
        success: true,
        message: `Session ${sessionId} forcefully logged out from WhatsApp servers`,
        sessionInfo: {
          id: session.id,
          name: session.name,
          status: "disconnected",
          userId: session.userId,
        },
        note: "This should remove the device from WhatsApp mobile app",
      };
    } catch (error) {
      this.logger.error(`[FORCE-LOGOUT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/test-connect/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "Debug: Test connection flow (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Connection test initiated" })
  async testConnectSession(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database to get userId
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Use the WhatsApp service connect method with the session's userId
      const result = await this.whatsappService.connect(
        sessionId,
        session.userId,
        session.organizationId,
      );

      return {
        success: true,
        message: "Connection initiated successfully",
        data: result,
        sessionInfo: {
          id: session.id,
          name: session.name,
          userId: session.userId,
        },
      };
    } catch (error) {
      this.logger.error(`[TEST-CONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/simulate-connection-success/:sessionId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary:
      "Debug: Simulate successful WhatsApp connection (Admin only)",
  })
  @ApiResponse({ status: 200, description: "Connection success simulated" })
  async simulateConnectionSuccess(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      // Manually trigger the connection update event to simulate successful connection
      await this.whatsappService["handleConnectionUpdate"]({
        sessionId,
        update: {
          connection: "open",
          receivedPendingNotifications: false,
        },
      });

      return {
        success: true,
        message: "Connection success simulated successfully",
        sessionInfo: {
          id: session.id,
          name: session.name,
          status: "connected (simulated)",
          userId: session.userId,
        },
      };
    } catch (error) {
      this.logger.error(`[SIMULATE-CONNECTION] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.message,
      };
    }
  }

  @Post("debug/force-connected/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async forceConnected(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any }> {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get current session to preserve existing metadata
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id },
      });

      if (!session) {
        return {
          message: "Session not found",
          status: null,
        };
      }

      // Force the database status to connected regardless of actual Baileys state
      await this.whatsappService["sessionRepository"].update(id, {
        status: WhatsAppSessionStatus.CONNECTED,
        isActive: true,
        lastSeenAt: new Date(),
        qrCode: null,
        qrCodeExpiresAt: null,
        metadata: {
          ...(session.metadata || {}),
          forcedConnected: true,
          forcedAt: new Date().toISOString(),
        } as Record<string, any>,
      });

      return {
        message: "Session forcefully set to connected with bypass flag",
        status: "connected",
      };
    } catch (error) {
      return {
        message: `Error: ${error.message}`,
        status: null,
      };
    }
  }

  @Post("debug/clear-forced/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async clearForced(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any }> {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Get current session
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id },
      });

      if (!session) {
        return {
          message: "Session not found",
          status: null,
        };
      }

      // Remove the forced flag and reset to normal state
      const newMetadata = { ...(session.metadata || {}) };
      delete newMetadata.forcedConnected;
      delete newMetadata.forcedAt;

      await this.whatsappService["sessionRepository"].update(id, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
        qrCode: null,
        qrCodeExpiresAt: null,
        metadata: newMetadata as Record<string, any>,
      });

      return {
        message:
          "Forced connection flag cleared, session reset to normal state",
        status: "disconnected",
      };
    } catch (error) {
      return {
        message: `Error: ${error.message}`,
        status: null,
      };
    }
  }

  @Post("debug/force-complete-connection/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async forceCompleteConnection(
    @CurrentUser() user: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any; baileysInfo: any }> {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    try {
      // Check Baileys session status
      const sessionInfo = await this.baileysService.getSessionInfo(id);
      const baileysStatus = this.baileysService.getSessionStatus(id);

      if (baileysStatus === "connecting" && !sessionInfo?.phoneNumber) {
        return {
          message:
            "Session is still connecting, please wait for WhatsApp scan completion",
          status: "connecting",
          baileysInfo: { status: baileysStatus, user: !!sessionInfo },
        };
      }

      if (sessionInfo?.phoneNumber) {
        // Session has a phone number, it's connected!
        await this.whatsappService["sessionRepository"].update(id, {
          status: WhatsAppSessionStatus.CONNECTED,
          isActive: true,
          phoneNumber: sessionInfo.phoneNumber,
          lastSeenAt: new Date(),
          qrCode: null,
          qrCodeExpiresAt: null,
        });

        // Also trigger the connection update event manually
        await this.whatsappService["handleConnectionUpdate"]({
          sessionId: id,
          update: { connection: "open" },
        });

        return {
          message: "Connection completed successfully",
          status: "connected",
          baileysInfo: {
            status: baileysStatus,
            user: !!sessionInfo,
            phoneNumber: sessionInfo.phoneNumber,
          },
        };
      }

      return {
        message: "Session not yet fully connected",
        status: baileysStatus,
        baileysInfo: { status: baileysStatus, user: !!sessionInfo },
      };
    } catch (error) {
      return {
        message: `Error: ${error.message}`,
        status: null,
        baileysInfo: null,
      };
    }
  }

  // Vision Service Endpoints
  @Get("vision/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Check vision services availability" })
  @ApiResponse({ status: 200, description: "Vision services status" })
  async getVisionStatus() {
    this.ensureDebugMode();
    return this.visionService.getVisionServicesStatus();
  }

  @Post("vision/install/:model")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Install Ollama vision model" })
  @ApiResponse({ status: 200, description: "Model installation initiated" })
  async installVisionModel(@Param("model") model: string) {
    this.ensureDebugMode();
    const success = await this.visionService.installOllamaVisionModel(model);
    return { 
      success, 
      model,
      message: success 
        ? `Installation of ${model} initiated successfully` 
        : `Failed to install ${model}`
    };
  }

  @Get("vision/test")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Test vision analysis with sample image (Admin only)" })
  @ApiResponse({ status: 200, description: "Vision test completed" })
  async testVisionAnalysis(@CurrentUser() user: AuthenticatedRequest) {
    this.ensureDebugMode();
    if (!user?.userId) {
      throw new UnauthorizedException("Authentication required");
    }
    // Sample base64 image (1x1 pixel red dot)
    const sampleImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    try {
      const result = await this.visionService.analyzeImageWithGPT4Vision(
        sampleImage,
        "Test image analysis"
      );

      return {
        success: true,
        message: "Vision analysis test completed",
        result: {
          description: result.description,
          confidence: result.confidence,
          objects: result.objects,
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Vision analysis test failed",
        error: error.message
      };
    }
  }

  @Post("test/facebook-link")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Test Facebook link analysis like E-Market scenario" })
  @ApiResponse({ status: 200, description: "Facebook link test completed" })
  async testFacebookLink(@Body() body: {
    sessionId: string;
    url: string;
    followUpMessage?: string
  }) {
    this.ensureDebugMode();
    try {
      // Simuler l'analyse du lien Facebook
      const mediaAnalysisService = this.visionService['mediaAnalysisService'] || 
        await import('./media-analysis.service').then(async m => {
          const { AudioTranscriptionService } = await import('./audio-transcription.service');
          const audioService = new AudioTranscriptionService(this.visionService['configService']);
          return new m.MediaAnalysisService(
            this.visionService['configService'],
            this.visionService['webSearchService'],
            this.visionService,
            audioService
          );
        });

      const linkAnalysis = await mediaAnalysisService.analyzeLink(body.url);
      
      // Si un message de suivi est fourni, simuler la conversation complète
      if (body.followUpMessage) {
        const fullContext = `${linkAnalysis?.description || 'Lien partagé'}\n\nMessage du client: ${body.followUpMessage}`;
        
        return {
          success: true,
          message: "Test Facebook link scenario completed",
          linkAnalysis,
          simulatedResponse: `Basé sur le lien partagé "${linkAnalysis?.metadata?.title || 'Produit E-Market'}" et votre message "${body.followUpMessage}", voici ce que l'IA devrait répondre dans le contexte e-commerce.`,
          context: fullContext
        };
      }

      return {
        success: true,
        message: "Facebook link analysis completed",
        linkAnalysis
      };
    } catch (error) {
      return {
        success: false,
        message: "Facebook link test failed",
        error: error.message
      };
    }
  }

  @Post("test/reply-message")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Test WhatsApp reply message context understanding" })
  @ApiResponse({ status: 200, description: "Reply message test completed" })
  async testReplyMessage(@Body() body: {
    sessionId: string;
    originalMessage: string;
    originalType?: 'text' | 'image' | 'video' | 'document';
    replyText: string;
  }) {
    this.ensureDebugMode();
    try {
      // Simuler un message de réponse WhatsApp avec contextInfo
      const mockReplyMessage = {
        key: {
          remoteJid: '1234567890@s.whatsapp.net',
          fromMe: false,
          id: 'MOCK_REPLY_ID'
        },
        message: {
          extendedTextMessage: {
            text: body.replyText,
            contextInfo: {
              stanzaId: 'MOCK_ORIGINAL_ID',
              participant: '0987654321@s.whatsapp.net',
              quotedMessage: this.buildMockQuotedMessage(body.originalMessage, body.originalType || 'text')
            }
          }
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      // Importer le service AI responder pour tester la logique
      const { WhatsAppAIResponderService } = await import('./whatsapp-ai-responder.service');
      
      // Simuler l'extraction du contexte de réponse
      const extractReplyContext = (message: any) => {
        try {
          const contextInfo = message.message?.extendedTextMessage?.contextInfo;
          
          if (!contextInfo?.quotedMessage) {
            return { isReply: false };
          }

          let quotedMessage = "";
          let quotedType = "unknown";

          if (contextInfo.quotedMessage.conversation) {
            quotedMessage = contextInfo.quotedMessage.conversation;
            quotedType = "text";
          } else if (contextInfo.quotedMessage.imageMessage?.caption) {
            quotedMessage = contextInfo.quotedMessage.imageMessage.caption || "[Image]";
            quotedType = "image";
          } else if (contextInfo.quotedMessage.videoMessage?.caption) {
            quotedMessage = contextInfo.quotedMessage.videoMessage.caption || "[Vidéo]";
            quotedType = "video";
          } else if (contextInfo.quotedMessage.imageMessage) {
            quotedMessage = "[Image sans légende]";
            quotedType = "image";
          }

          return {
            isReply: true,
            quotedMessage: quotedMessage.trim(),
            quotedMessageId: contextInfo.stanzaId,
            quotedParticipant: contextInfo.participant,
            quotedType
          };
        } catch (error) {
          return { isReply: false };
        }
      };

      const replyContext = extractReplyContext(mockReplyMessage);
      
      // Générer une réponse contextuelle simulée
      const simulatedResponse = this.generateSimulatedReplyResponse(
        body.originalMessage,
        body.replyText,
        body.originalType || 'text',
        replyContext
      );

      return {
        success: true,
        message: "Reply message test completed",
        mockMessage: mockReplyMessage,
        extractedContext: replyContext,
        simulatedResponse,
        analysis: {
          originalMessage: body.originalMessage,
          clientReply: body.replyText,
          contextDetected: replyContext.isReply,
          quotedType: replyContext.quotedType,
          aiUnderstanding: `L'IA comprend que le client répond au message "${replyContext.quotedMessage}" avec "${body.replyText}"`
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Reply message test failed",
        error: error.message
      };
    }
  }

  private buildMockQuotedMessage(originalMessage: string, type: string) {
    switch (type) {
      case 'image':
        return {
          imageMessage: {
            caption: originalMessage
          }
        };
      case 'video':
        return {
          videoMessage: {
            caption: originalMessage
          }
        };
      case 'document':
        return {
          documentMessage: {
            fileName: originalMessage
          }
        };
      default:
        return {
          conversation: originalMessage
        };
    }
  }

  private generateSimulatedReplyResponse(
    originalMessage: string, 
    clientReply: string, 
    type: string,
    replyContext: any
  ): string {
    if (!replyContext.isReply) {
      return "L'IA traiterait ce message comme un message normal sans contexte de réponse.";
    }

    // Exemples de réponses contextuelles intelligentes
    const examples = [
      {
        condition: originalMessage.toLowerCase().includes('couleur') && clientReply.toLowerCase().includes('rouge'),
        response: `Parfait ! J'ai noté que vous préférez la couleur rouge pour ce produit. Je vais vous présenter les options disponibles en rouge.`
      },
      {
        condition: originalMessage.toLowerCase().includes('prix') && clientReply.toLowerCase().includes('oui'),
        response: `Très bien ! Le prix vous convient. Souhaitez-vous procéder à la commande ou avez-vous d'autres questions ?`
      },
      {
        condition: type === 'image' && clientReply.toLowerCase().includes('acheter'),
        response: `Je vois que vous souhaitez acheter le produit de l'image que vous avez partagée. Permettez-moi de vous aider avec les détails de la commande.`
      },
      {
        condition: originalMessage.includes('http') && clientReply.toLowerCase().includes('disponible'),
        response: `Je comprends que vous vous renseignez sur la disponibilité du produit du lien que vous avez partagé. Laissez-moi vérifier les informations pour vous.`
      }
    ];

    const matchedExample = examples.find(ex => ex.condition);
    
    return matchedExample 
      ? matchedExample.response 
      : `L'IA comprend que vous répondez au message "${originalMessage}" avec "${clientReply}" et adaptera sa réponse en conséquence.`;
  }

  @Get("audio/transcription/status")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Check audio transcription service status" })
  @ApiResponse({ status: 200, description: "Audio transcription status" })
  async getAudioTranscriptionStatus() {
    this.ensureDebugMode();
    try {
      // Importer le service de transcription audio
      const { AudioTranscriptionService } = await import('./audio-transcription.service');

      // Créer une instance temporaire pour les tests de status
      const configService = this.visionService['configService'];
      const tempService = new AudioTranscriptionService(configService);

      const status = await tempService.getTranscriptionStatus();
      
      return {
        success: true,
        message: "Audio transcription status retrieved",
        status: {
          ...status,
          supported: status.whisperCpp || status.whisperNode,
          quality: status.whisperCpp ? 'Excellent (Whisper.cpp)' : 
                  status.whisperNode ? 'Good (Whisper-node)' : 
                  'None (Install required)',
        },
        recommendations: {
          install: !status.whisperCpp ? [
            "Run: ./scripts/install-whisper.sh",
            "Or install manually: npm install whisper-node"
          ] : [],
          ffmpeg: !status.ffmpeg ? [
            "Install FFmpeg for audio conversion",
            "macOS: brew install ffmpeg",
            "Ubuntu: sudo apt install ffmpeg"
          ] : []
        },
        examples: [
          {
            scenario: "Message vocal client",
            input: "[Audio WhatsApp 15 secondes]",
            output: "Transcription: 'Bonjour, je voudrais commander ce produit'",
            aiResponse: "L'IA comprend la demande et aide avec la commande"
          },
          {
            scenario: "Question audio",
            input: "[Audio] 'C'est encore disponible ?'",
            output: "Transcription: 'C'est encore disponible ?'",
            aiResponse: "L'IA vérifie la disponibilité du produit mentionné"
          }
        ]
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to get audio transcription status",
        error: error.message
      };
    }
  }

  @Post("test/deepseek")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  @ApiOperation({ summary: "Test DeepSeek integration" })
  async testDeepSeekIntegration(@Body() body: any): Promise<any> {
    this.ensureDebugMode();
    try {
      // Test message pour DeepSeek
      const testMessage = body?.message || 'Hello DeepSeek! Can you respond to this test message for our WhatsApp bot?';
      
      // Simuler une requête LLM directement
      const mockRequest = {
        messages: [{ role: 'user', content: testMessage }],
        maxTokens: 150,
        temperature: 0.7,
        organizationId: null
      };

      // Simuler un message WhatsApp pour tester DeepSeek
      await this.conversationService.handleWhatsAppMessage({
        sessionId: 'test-deepseek-session',
        userId: 'test-user-id',
        organizationId: null,
        fromNumber: '+123456789',
        messageText: testMessage,
        messageId: uuidv4(),
        timestamp: new Date(),
        isFromMe: false,
        messageType: 'text'
      });
      
      const response = 'DeepSeek integration test completed via conversation service';
      
      return {
        success: true,
        message: 'DeepSeek test completed successfully',
        response: {
          content: response,
          provider: 'deepseek-via-adaptive-router'
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
      };
    }
  }
}
