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
} from "@nestjs/common";
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
import { Public } from "@/common/decorators/public.decorator";
import { SimpleConversationService } from "./simple-conversation.service";
import { WhatsAppGateway } from "./whatsapp.gateway";
import { BaileysService } from "./baileys.service";
import { VisionService } from "./vision.service";

@ApiTags("WhatsApp")
@Controller("whatsapp")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsAppController {
  constructor(
    private whatsappService: WhatsAppService,
    private conversationService: SimpleConversationService,
    private eventEmitter: EventEmitter2,
    private whatsappGateway: WhatsAppGateway,
    private baileysService: BaileysService,
    private visionService: VisionService,
  ) {}

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
      isConnected: session.status === 'connected'
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
    @CurrentUser() user?: AuthenticatedRequest,
  ): Promise<QRCodeResponseDto> {
    // Use fallback userId if not authenticated (for public access during QR scanning)
    const userId = user?.userId || "5c4f3566-80c1-4ab5-a5ce-2310279e2169";
    const organizationId = user?.organizationId || null;
    return this.whatsappService.getQRCode(id, userId, organizationId);
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
      status: result.status as any,
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

  @Get("sessions/:id/status")
  @Public()
  @ApiOperation({ summary: "Get real-time session status" })
  @ApiResponse({ status: 200, description: "Status retrieved successfully" })
  async getRealTimeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedRequest,
  ): Promise<{ status: string; isActive: boolean; needsSync: boolean }> {
    const userId = user?.userId || "5c4f3566-80c1-4ab5-a5ce-2310279e2169";
    return this.whatsappService.getRealTimeStatus(
      id,
      userId,
      user?.organizationId || null,
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

    // Clear memory cache if requested
    if (clearCache === "true") {
      this.conversationService["conversations"].clear();
      this.conversationService["messages"].clear();
      console.log("[CLEAR-CACHE] Memory cache cleared");
    }

    let conversations = await this.conversationService.getConversationsForUser(
      userId,
      sessionId,
    );
    console.log(`[API-DEDUPE] Original count: ${conversations.length}`);

    // FORCE deduplication at API level
    const normalizePhoneNumber = (phoneNumber: string): string => {
      return phoneNumber
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "")
        .replace(/\s+/g, "")
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
        phoneGroups.set(key, {
          ...conv,
          phoneNumber: normalizedPhone,
          name: normalizedPhone.startsWith("+")
            ? normalizedPhone
            : `+${normalizedPhone}`,
        });
      }
    });

    conversations = Array.from(phoneGroups.values()).sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime(),
    );

    console.log(
      `[API-DEDUPE] After deduplication: ${conversations.length} unique conversations`,
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
    const userId = user.userId;
    console.log(
      `[DEBUG] Getting messages for conversation: ${id}, user: ${userId}`,
    );
    const messages =
      await this.conversationService.getMessagesForConversation(id);
    console.log(
      `[DEBUG] Found ${messages.length} messages for user ${userId}:`,
      messages,
    );

    return messages;
  }

  @Post("conversations/:id/messages")
  @ApiOperation({ summary: "Send message in conversation" })
  @ApiResponse({ status: 201, description: "Message sent successfully" })
  async sendConversationMessage(
    @Param("id") id: string,
    @Body() body: { content: string },
    @CurrentUser() user: AuthenticatedRequest,
  ) {
    console.log(`[SEND-MESSAGE] Received request to send message:`);
    console.log(`[SEND-MESSAGE] Conversation ID: ${id}`);
    console.log(`[SEND-MESSAGE] Content: ${body.content}`);
    console.log(`[SEND-MESSAGE] User: ${JSON.stringify(user)}`);

    const userId = user.userId;
    console.log(`[SEND-MESSAGE] Using userId: ${userId}`);

    try {
      const message = await this.conversationService.sendMessage(
        id,
        body.content,
        userId,
      );
      console.log(`[SEND-MESSAGE] Message sent successfully:`, message);
      return {
        success: true,
        data: message,
      };
    } catch (error) {
      console.error(`[SEND-MESSAGE] Error sending message:`, error);
      throw error;
    }
  }

  @Put("conversations/:id/read")
  @Public()
  @ApiOperation({ summary: "Mark conversation as read" })
  @ApiResponse({ status: 200, description: "Conversation marked as read" })
  async markConversationAsRead(
    @Param("id") id: string,
    @CurrentUser() user?: AuthenticatedRequest,
  ) {
    const userId = user?.userId || "42431320-f9e3-4992-afd1-3f594e635cc4";
    await this.conversationService.markConversationAsRead(id, userId);
    return {
      success: true,
      message: "Conversation marked as read",
    };
  }

  @Post("test/simulate-message")
  @ApiOperation({ summary: "Simulate incoming WhatsApp message for testing" })
  @ApiResponse({ status: 200, description: "Message simulated successfully" })
  async simulateMessage(
    @Body() body: { phoneNumber: string; message: string },
    @CurrentUser() user: AuthenticatedRequest,
  ) {
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

    console.log("🧪 SIMULATING WhatsApp message:", mockMessageData);

    // Emit the correct event that WhatsAppAIResponderService listens to
    this.eventEmitter.emit("whatsapp.message.received", mockMessageData);

    return {
      success: true,
      message: "Message simulation triggered",
      data: mockMessageData,
    };
  }

  @Get("debug/websocket-status")
  @ApiOperation({ summary: "Check WebSocket connection status" })
  @ApiResponse({ status: 200, description: "WebSocket status retrieved" })
  async getWebSocketStatus(@CurrentUser() user: AuthenticatedRequest) {
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
  @Public()
  @ApiOperation({ summary: "Trigger manual sync for WhatsApp session" })
  @ApiResponse({ status: 200, description: "Sync triggered successfully" })
  async triggerSync(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedRequest,
  ) {
    // For public sync endpoint, find the session directly without user authorization check
    const session = await this.whatsappService["sessionRepository"].findOne({
      where: { id },
    });

    if (!session) {
      return { success: false, message: "Session not found" };
    }

    // Check if session is connected
    if (session.status !== "connected") {
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
  @Public()
  @ApiOperation({ summary: "Debug: Get active Baileys sessions" })
  @ApiResponse({ status: 200, description: "Active sessions retrieved" })
  async getActiveSessions() {
    return {
      success: true,
      data: this.baileysService.getActiveSessions(),
    };
  }

  @Get("debug/conversations")
  @Public()
  @Throttle({ default: { limit: 1000, ttl: 60000 } }) // Very high limit for debug endpoints
  @ApiOperation({ summary: "Debug: Get all conversations without auth" })
  @ApiResponse({ status: 200, description: "Conversations retrieved" })
  async getDebugConversations() {
    // Get all conversations from database
    const allConversations = await this.conversationService[
      "conversationRepository"
    ].find({
      where: { channel: "whatsapp" as any },
      relations: ["messages"],
      order: { updatedAt: "DESC" },
    });

    console.log(
      `[DEBUG-PUBLIC] Found ${allConversations.length} total WhatsApp conversations in DB`,
    );

    // Show user info for each conversation
    const conversationInfo = allConversations.map((conv) => ({
      id: conv.id,
      userId: conv.userId,
      externalId: conv.externalId,
      messageCount: conv.messages?.length || 0,
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
  @Public()
  @ApiOperation({
    summary: "Debug: Get conversations with forced deduplication",
  })
  @ApiResponse({
    status: 200,
    description: "Deduplicated conversations retrieved",
  })
  async getDeduplicatedConversations(@Query("sessionId") sessionId?: string) {
    const userId = "5c4f3566-80c1-4ab5-a5ce-2310279e2169";

    // Get original conversations
    let conversations = await this.conversationService.getConversationsForUser(
      userId,
      sessionId,
    );
    const originalCount = conversations.length;

    console.log(`[DEDUPE-TEST] Original count: ${originalCount}`);

    // Apply deduplication
    const normalizePhoneNumber = (phoneNumber: string): string => {
      return phoneNumber
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "")
        .replace(/\s+/g, "")
        .trim();
    };

    // Group by normalized phone number
    const phoneGroups = new Map();
    conversations.forEach((conv) => {
      const normalizedPhone = normalizePhoneNumber(conv.phoneNumber);
      const key = `${userId}-${normalizedPhone}`;
      const existing = phoneGroups.get(key);

      console.log(
        `[DEDUPE-TEST] Processing ${conv.phoneNumber} -> normalized: ${normalizedPhone}, key: ${key}`,
      );

      if (
        !existing ||
        new Date(conv.lastMessageTime) > new Date(existing.lastMessageTime)
      ) {
        console.log(
          `[DEDUPE-TEST] Keeping conversation ${conv.id} for phone ${normalizedPhone}`,
        );
        phoneGroups.set(key, {
          ...conv,
          phoneNumber: normalizedPhone,
          name: normalizedPhone.startsWith("+")
            ? normalizedPhone
            : `+${normalizedPhone}`,
        });
      } else {
        console.log(
          `[DEDUPE-TEST] Skipping duplicate conversation ${conv.id} for phone ${normalizedPhone}`,
        );
      }
    });

    const deduplicatedConversations = Array.from(phoneGroups.values());
    console.log(
      `[DEDUPE-TEST] After deduplication: ${deduplicatedConversations.length}`,
    );

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
  @ApiOperation({ summary: "Debug: Get current authenticated user" })
  @ApiResponse({ status: 200, description: "Current user retrieved" })
  async getCurrentUser(@CurrentUser() user: AuthenticatedRequest) {
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
  @Public()
  @ApiOperation({ summary: "Debug: Get all sessions from database" })
  @ApiResponse({ status: 200, description: "Sessions retrieved" })
  async getSessionsFromDB() {
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
  @Public()
  @ApiOperation({ summary: "Debug: Get all messages for a conversation" })
  @ApiResponse({ status: 200, description: "Messages retrieved" })
  async getDebugMessages(@Param("conversationId") conversationId: string) {
    // Get messages from database directly
    const dbMessages = await this.conversationService["messageRepository"].find(
      {
        where: { conversationId },
        order: { createdAt: "ASC" },
      },
    );

    console.log(
      `[DEBUG-MESSAGES] Found ${dbMessages.length} messages in DB for conversation ${conversationId}`,
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
  @Public()
  @ApiOperation({
    summary: "Debug: Force persist memory conversations to database",
  })
  @ApiResponse({ status: 200, description: "Conversations persisted" })
  async persistMemoryConversations() {
    try {
      console.log(
        `[PERSIST-CONVERSATIONS] Forcing persistence of memory conversations`,
      );

      // Emit event to force conversation persistence
      this.eventEmitter.emit("whatsapp.persist.conversations", {
        userId: "42431320-f9e3-4992-afd1-3f594e635cc4",
      });

      return {
        success: true,
        message: "Memory conversations persistence triggered",
      };
    } catch (error) {
      console.error(`[PERSIST-CONVERSATIONS] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/download-images/:sessionId")
  @Public()
  @ApiOperation({
    summary: "Debug: Force download images for existing messages",
  })
  @ApiResponse({ status: 200, description: "Image download triggered" })
  async forceDownloadImages(@Param("sessionId") sessionId: string) {
    try {
      console.log(
        `[FORCE-IMAGES] Triggering image download for session ${sessionId}`,
      );

      // Emit event to force image download
      this.eventEmitter.emit("whatsapp.force.download.images", {
        sessionId: sessionId,
      });

      return {
        success: true,
        message: `Image download triggered for session ${sessionId}`,
      };
    } catch (error) {
      console.error(`[FORCE-IMAGES] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-sync/:sessionId")
  @Public()
  @ApiOperation({ summary: "Debug: Force sync for a specific session" })
  @ApiResponse({ status: 200, description: "Sync forced" })
  async forceSyncSession(@Param("sessionId") sessionId: string) {
    try {
      console.log(`[FORCE-SYNC] Forcing sync for session ${sessionId}`);

      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      console.log(
        `[FORCE-SYNC] Found session: ${session.name}, status: ${session.status}`,
      );

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
      console.error(`[FORCE-SYNC] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-reconnect/:sessionId")
  @Public()
  @ApiOperation({
    summary:
      "Debug: Force reconnect session with new syncFullHistory configuration",
  })
  @ApiResponse({ status: 200, description: "Session reconnected" })
  async forceReconnectSession(@Param("sessionId") sessionId: string) {
    try {
      console.log(
        `[FORCE-RECONNECT] Reconnecting session ${sessionId} with syncFullHistory=true`,
      );

      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      console.log(
        `[FORCE-RECONNECT] Found session: ${session.name}, status: ${session.status}`,
      );

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
      console.error(`[FORCE-RECONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-reset-reconnect/:sessionId")
  @Public()
  @ApiOperation({
    summary: "Debug: Force reset and reconnect session (will require QR scan)",
  })
  @ApiResponse({ status: 200, description: "Session reset and reconnected" })
  async forceResetReconnectSession(@Param("sessionId") sessionId: string) {
    try {
      console.log(
        `[FORCE-RESET-RECONNECT] Resetting session ${sessionId} with forceReset=true`,
      );

      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      console.log(
        `[FORCE-RESET-RECONNECT] Found session: ${session.name}, status: ${session.status}`,
      );

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
      console.error(`[FORCE-RESET-RECONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/cleanup-duplicates/:userId")
  @Public()
  @ApiOperation({ summary: "Debug: Cleanup duplicate conversations for user" })
  @ApiResponse({ status: 200, description: "Duplicates cleaned up" })
  async cleanupDuplicates(@Param("userId") userId: string) {
    try {
      console.log(`[CLEANUP-DUPLICATES] Starting cleanup for user ${userId}`);

      // Call the cleanup function directly
      await this.conversationService["cleanupDuplicateConversations"](userId);

      return {
        success: true,
        message: `Duplicate conversations cleaned up for user ${userId}`,
      };
    } catch (error) {
      console.error(`[CLEANUP-DUPLICATES] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-cleanup-all-duplicates")
  @Public()
  @ApiOperation({
    summary: "Debug: Force cleanup ALL duplicate conversations in database",
  })
  @ApiResponse({ status: 200, description: "All duplicates cleaned up" })
  async forceCleanupAllDuplicates() {
    try {
      console.log(`[FORCE-CLEANUP-ALL] Starting comprehensive cleanup`);

      // Get all conversations from database
      const allConversations = await this.conversationService[
        "conversationRepository"
      ].find({
        where: { channel: "whatsapp" as any },
        relations: ["messages"],
        order: { createdAt: "ASC" },
      });

      console.log(
        `[FORCE-CLEANUP-ALL] Found ${allConversations.length} total conversations`,
      );

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
          console.log(
            `[FORCE-CLEANUP-ALL] Found ${conversations.length} duplicates for key ${key}`,
          );

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
              console.log(
                `[FORCE-CLEANUP-ALL] Moved ${duplicateConv.messages.length} messages from ${duplicateConv.id} to ${conversationToKeep.id}`,
              );
            }

            // Delete the duplicate conversation
            await this.conversationService["conversationRepository"].remove(
              duplicateConv,
            );
            totalDeleted++;
            console.log(
              `[FORCE-CLEANUP-ALL] Deleted duplicate conversation ${duplicateConv.id}`,
            );
          }

          totalMerged++;
        }
      }

      // Clear memory cache to force reload from database
      this.conversationService["conversations"].clear();
      this.conversationService["messages"].clear();

      console.log(
        `[FORCE-CLEANUP-ALL] Cleanup completed: ${totalMerged} groups merged, ${totalDeleted} duplicates deleted`,
      );

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
      console.error(`[FORCE-CLEANUP-ALL] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/simulate-incoming-message")
  @Public()
  @ApiOperation({ summary: "Debug: Simulate incoming WhatsApp message" })
  @ApiResponse({ status: 200, description: "Message simulated successfully" })
  async simulateIncomingMessage(
    @Body()
    body: {
      sessionId: string;
      fromNumber: string;
      message: string;
      isGroup?: boolean;
    },
  ) {
    try {
      console.log(
        `[SIMULATE-INCOMING] Creating conversation for ${body.fromNumber}`,
      );

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

      console.log(
        `[SIMULATE-INCOMING] Emitting whatsapp.message.received:`,
        eventData,
      );

      console.log('📡 EMITTING EVENT: whatsapp.message.received');
      this.eventEmitter.emit("whatsapp.message.received", eventData);
      console.log('📡 EVENT EMITTED: whatsapp.message.received');

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
      console.error(`[SIMULATE-INCOMING] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-logout/:sessionId")
  @Public()
  @ApiOperation({
    summary:
      "Debug: Force complete logout from WhatsApp servers (will remove from mobile)",
  })
  @ApiResponse({ status: 200, description: "Session forcefully logged out" })
  async forceLogoutSession(@Param("sessionId") sessionId: string) {
    try {
      console.log(
        `[FORCE-LOGOUT] Attempting complete logout for session ${sessionId}`,
      );

      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      console.log(
        `[FORCE-LOGOUT] Found session: ${session.name}, status: ${session.status}`,
      );

      // Use our enhanced disconnectSession which will force logout even if no active socket
      await this.baileysService.disconnectSession(sessionId);

      // Update database status
      await this.whatsappService["sessionRepository"].update(sessionId, {
        status: "disconnected" as any,
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
      console.error(`[FORCE-LOGOUT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/test-connect/:sessionId")
  @Public()
  @ApiOperation({
    summary: "Debug: Test connection flow without auth (for QR modal testing)",
  })
  @ApiResponse({ status: 200, description: "Connection test initiated" })
  async testConnectSession(@Param("sessionId") sessionId: string) {
    try {
      console.log(`[TEST-CONNECT] Testing connection for session ${sessionId}`);

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
      console.error(`[TEST-CONNECT] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/simulate-connection-success/:sessionId")
  @Public()
  @ApiOperation({
    summary:
      "Debug: Simulate successful WhatsApp connection (for testing QR modal close)",
  })
  @ApiResponse({ status: 200, description: "Connection success simulated" })
  async simulateConnectionSuccess(@Param("sessionId") sessionId: string) {
    try {
      console.log(
        `[SIMULATE-CONNECTION] Simulating connection success for session ${sessionId}`,
      );

      // Get session from database
      const session = await this.whatsappService["sessionRepository"].findOne({
        where: { id: sessionId },
      });

      if (!session) {
        return { success: false, message: "Session not found in database" };
      }

      console.log(
        `[SIMULATE-CONNECTION] Found session: ${session.name}, current status: ${session.status}`,
      );

      // Manually trigger the connection update event to simulate successful connection
      await this.whatsappService["handleConnectionUpdate"]({
        sessionId,
        update: {
          connection: "open",
          receivedPendingNotifications: false,
        },
      });

      console.log(
        `[SIMULATE-CONNECTION] Triggered connection update event for session ${sessionId}`,
      );

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
      console.error(`[SIMULATE-CONNECTION] Error:`, error);
      return {
        success: false,
        message: error.message,
        error: error.stack,
      };
    }
  }

  @Post("debug/force-connected/:id")
  @Public()
  async forceConnected(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any }> {
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
        status: "connected" as any,
        isActive: true,
        lastSeenAt: new Date(),
        qrCode: null,
        qrCodeExpiresAt: null,
        metadata: {
          ...(session.metadata || {}),
          forcedConnected: true,
          forcedAt: new Date().toISOString(),
        } as any,
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
  @Public()
  async clearForced(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any }> {
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
        status: "disconnected" as any,
        isActive: false,
        qrCode: null,
        qrCodeExpiresAt: null,
        metadata: newMetadata as any,
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
  @Public()
  async forceCompleteConnection(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<{ message: string; status: any; baileysInfo: any }> {
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
          status: "connected" as any,
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
  @ApiOperation({ summary: "Check vision services availability" })
  @ApiResponse({ status: 200, description: "Vision services status" })
  async getVisionStatus() {
    return this.visionService.getVisionServicesStatus();
  }

  @Post("vision/install/:model")
  @ApiOperation({ summary: "Install Ollama vision model" })
  @ApiResponse({ status: 200, description: "Model installation initiated" })
  async installVisionModel(@Param("model") model: string) {
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
  @Public()
  @ApiOperation({ summary: "Test vision analysis with sample image" })
  @ApiResponse({ status: 200, description: "Vision test completed" })
  async testVisionAnalysis() {
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
  @Public()
  @ApiOperation({ summary: "Test Facebook link analysis like E-Market scenario" })
  @ApiResponse({ status: 200, description: "Facebook link test completed" })
  async testFacebookLink(@Body() body: { 
    sessionId: string; 
    url: string; 
    followUpMessage?: string 
  }) {
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
  @Public()
  @ApiOperation({ summary: "Test WhatsApp reply message context understanding" })
  @ApiResponse({ status: 200, description: "Reply message test completed" })
  async testReplyMessage(@Body() body: { 
    sessionId: string; 
    originalMessage: string;
    originalType?: 'text' | 'image' | 'video' | 'document';
    replyText: string;
  }) {
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
  @Public()
  @ApiOperation({ summary: "Check audio transcription service status" })
  @ApiResponse({ status: 200, description: "Audio transcription status" })
  async getAudioTranscriptionStatus() {
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
  @Public()
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  @ApiOperation({ summary: "Test DeepSeek integration" })
  async testDeepSeekIntegration(@Body() body: any): Promise<any> {
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
