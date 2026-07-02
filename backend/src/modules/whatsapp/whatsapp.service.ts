import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import * as QRCode from "qrcode";
import {
  WhatsAppSession,
  WhatsAppContact,
  User,
  Organization,
  OrganizationMember,
  UsageMetric,
  AgentMessage,
  AgentConversation,
} from "@/common/entities";
import {
  WhatsAppSessionStatus,
  UserRole,
  UsageMetricType,
  AuditAction,
  MessageRole,
} from "@/common/enums";
import {
  CreateWhatsAppSessionDto,
  UpdateWhatsAppSessionDto,
  WhatsAppSessionQueryDto,
  SendMessageDto,
} from "./dto/whatsapp.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import { AuditService } from "../audit/audit.service";
import { BaileysService } from "./baileys.service";
import { QuotaEnforcementService } from "../subscriptions/quota-enforcement.service";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(WhatsAppContact)
    private contactRepository: Repository<WhatsAppContact>,
    @InjectRepository(OrganizationMember)
    private organizationMemberRepository: Repository<OrganizationMember>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private auditService: AuditService,
    private baileysService: BaileysService,
    private quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async create(
    dto: CreateWhatsAppSessionDto,
    userId: string,
    organizationId: string | null,
  ): Promise<WhatsAppSession> {
    // Check if user has permission (skip if no organization)
    if (organizationId) {
      const membership = await this.organizationMemberRepository.findOne({
        where: { userId, organizationId },
      });

      if (
        !membership ||
        !["owner", "admin", "member"].includes(membership.role)
      ) {
        throw new ForbiddenException(
          "Insufficient permissions to create WhatsApp session",
        );
      }
    }

    // Check if session with same name exists for user/organization
    const whereCondition = organizationId
      ? { name: dto.name, organizationId }
      : { name: dto.name, userId, organizationId: null };

    const existingSession = await this.sessionRepository.findOne({
      where: whereCondition,
    });

    if (existingSession) {
      throw new ConflictException("Session with this name already exists");
    }

    // Check subscription limits for max WhatsApp agents
    if (organizationId) {
      try {
        await this.quotaEnforcementService.enforceAgentQuota(organizationId);
      } catch (error) {
        throw new ForbiddenException(
          `WhatsApp agent limit exceeded. ${error.message}. Please upgrade your subscription to create more WhatsApp sessions.`,
        );
      }
    } else {
      // For individual users without organization
      try {
        await this.quotaEnforcementService.enforceUserAgentQuota(userId);
      } catch (error) {
        throw new ForbiddenException(
          `WhatsApp agent limit exceeded. ${error.message}. Please upgrade your subscription to create more WhatsApp sessions.`,
        );
      }
    }

    // Create session
    const session = this.sessionRepository.create({
      ...dto,
      userId,
      organizationId,
      status: WhatsAppSessionStatus.DISCONNECTED,
      config: {
        messageRetryCount: 3,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        defaultPresence: "available",
        ...dto.config,
      },
    });

    const savedSession = await this.sessionRepository.save(session);

    // Initialize Baileys session
    await this.baileysService.initializeSession(savedSession.id);

    // Log audit event (only if organizationId exists)
    if (organizationId) {
      await this.auditService.log({
        action: AuditAction.CREATE,
        resourceType: "whatsapp_session",
        resourceId: savedSession.id,
        userId,
        organizationId,
        description: `WhatsApp session ${dto.name} created`,
      });
    }

    return this.findOne(savedSession.id, userId, organizationId);
  }

  async findAll(
    query: WhatsAppSessionQueryDto,
    userId: string,
    organizationId: string | null,
  ): Promise<PaginatedResult<WhatsAppSession>> {
    // Check user access
    await this.checkUserAccess(userId, organizationId);

    const {
      page = 1,
      limit = 10,
      search,
      status,
      isActive,
      phoneNumber,
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.sessionRepository
      .createQueryBuilder("session")
      .leftJoinAndSelect("session.user", "user")
      .leftJoinAndSelect("session.organization", "organization")
      .leftJoinAndSelect("session.agent", "agent");

    // Filter by organization or personal sessions
    if (organizationId) {
      // Look for sessions in the organization OR user-owned sessions without organization
      queryBuilder.where(
        "(session.organizationId = :organizationId OR (session.userId = :userId AND session.organizationId IS NULL))",
        { organizationId, userId }
      );
    } else {
      queryBuilder.where(
        "session.userId = :userId AND session.organizationId IS NULL",
        { userId },
      );
    }

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(session.name ILIKE :search OR session.phoneNumber ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere("session.status = :status", { status });
    }

    if (typeof isActive === "boolean") {
      queryBuilder.andWhere("session.isActive = :isActive", { isActive });
    }

    if (phoneNumber) {
      queryBuilder.andWhere("session.phoneNumber = :phoneNumber", {
        phoneNumber,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const sessions = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy("session.createdAt", "DESC")
      .getMany();

    // Update real-time status from Baileys for each session
    // NOTE: We only update the session object for display, NOT the database
    // Database status is managed by connection events in BaileysService
    // This prevents race conditions during auto-restore after deployment
    const updatedSessions = await Promise.all(
      sessions.map(async (session) => {
        // Check if session is actually active in Baileys (in-memory state)
        const isReallyActive = await this.baileysService.isSessionActive(
          session.id,
        );

        // Only update the session object for display purposes
        // Do NOT update database here to avoid race conditions with auto-restore
        if (isReallyActive) {
          session.status = WhatsAppSessionStatus.CONNECTED;
          session.isActive = true;
        } else if (session.status === WhatsAppSessionStatus.CONNECTED) {
          // If DB says connected but memory says not, show as connecting
          // (might be in the process of auto-restoring)
          session.status = WhatsAppSessionStatus.CONNECTING;
        }

        return session;
      }),
    );

    return new PaginatedResult(updatedSessions, total, page, limit);
  }

  async findOne(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<WhatsAppSession> {
    await this.checkUserAccess(userId, organizationId);

    // Build query to find session by ID and either:
    // 1. It belongs to the user's organization, OR 
    // 2. It's a user-owned session without organization (legacy sessions)
    const queryBuilder = this.sessionRepository
      .createQueryBuilder("session")
      .leftJoinAndSelect("session.user", "user")
      .leftJoinAndSelect("session.organization", "organization")
      .leftJoinAndSelect("session.agent", "agent")
      .where("session.id = :id", { id });

    if (organizationId) {
      // Look for sessions in the organization OR user-owned sessions without organization
      queryBuilder.andWhere(
        "(session.organizationId = :organizationId OR (session.userId = :userId AND session.organizationId IS NULL))",
        { organizationId, userId }
      );
    } else {
      // For users without organization, only find their own sessions
      queryBuilder.andWhere(
        "session.userId = :userId AND session.organizationId IS NULL",
        { userId }
      );
    }

    const session = await queryBuilder.getOne();

    if (!session) {
      throw new NotFoundException("WhatsApp session not found");
    }

    return session;
  }

  async update(
    id: string,
    updateDto: UpdateWhatsAppSessionDto,
    userId: string,
    organizationId: string | null,
  ): Promise<WhatsAppSession> {
    const session = await this.findOne(id, userId, organizationId);

    // Check permissions - only session owner or admin can update
    if (session.userId !== userId) {
      const membership = await this.organizationMemberRepository.findOne({
        where: { userId, organizationId },
      });

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new ForbiddenException(
          "Insufficient permissions to update this session",
        );
      }
    }

    await this.sessionRepository.update(id, updateDto);

    // Log audit event (only if organizationId exists)
    if (organizationId) {
      await this.auditService.log({
        action: AuditAction.UPDATE,
        resourceType: "whatsapp_session",
        resourceId: id,
        userId,
        organizationId,
        description: `WhatsApp session ${session.name} updated`,
        metadata: { updatedFields: Object.keys(updateDto) },
      });
    }

    return this.findOne(id, userId, organizationId);
  }

  async delete(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<void> {
    const session = await this.findOne(id, userId, organizationId);

    // Check permissions - only session owner or admin can delete
    if (session.userId !== userId) {
      // If no organization, only session owner can delete
      if (!organizationId) {
        throw new ForbiddenException(
          "Insufficient permissions to delete this session",
        );
      }

      // Check organization membership for admin permissions
      const membership = await this.organizationMemberRepository.findOne({
        where: { userId, organizationId },
      });

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new ForbiddenException(
          "Insufficient permissions to delete this session",
        );
      }
    }

    // Disconnect session first (don't fail if already disconnected)
    try {
      await this.baileysService.disconnectSession(id);
    } catch (error) {
      this.logger.warn(`Failed to disconnect session ${id} during deletion (may already be disconnected):`, error);
      // Continue with deletion even if disconnect fails
    }

    // Delete session from database
    await this.sessionRepository.delete(id);
    this.logger.log(`Session ${id} deleted from database`);

    // Log audit event (only if organizationId exists)
    if (organizationId) {
      await this.auditService.log({
        action: AuditAction.DELETE,
        resourceType: "whatsapp_session",
        resourceId: id,
        userId,
        organizationId,
        description: `WhatsApp session ${session.name} deleted`,
      });
    }
  }

  async connect(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ qrCode?: string; message: string }> {
    const session = await this.findOne(id, userId, organizationId);

    if (session.status === WhatsAppSessionStatus.CONNECTED) {
      return { message: "Session is already connected" };
    }

    // Clear any expired QR code data when reconnecting
    await this.sessionRepository.update(id, {
      status: WhatsAppSessionStatus.CONNECTING,
      lastConnectionAttempt: new Date(),
      retryCount: session.retryCount + 1,
      qrCode: null, // Clear old QR code
      qrCodeExpiresAt: null, // Clear expiry time
    });

    try {
      // Connect through Baileys service with force reset to clear auth state
      const connectionResult = await this.baileysService.connectSession(
        id,
        true,
      );

      if (connectionResult.needsQR && connectionResult.qr) {
        // Generate QR code data URL with enhanced options for better Android compatibility
        const qrCodeDataUrl = await QRCode.toDataURL(connectionResult.qr, {
          width: 512,                    // Larger size for better scanning
          margin: 2,                     // Adequate margin
          errorCorrectionLevel: 'H',     // Highest error correction for reliable scanning
          color: {
            dark: '#000000',             // Pure black for maximum contrast
            light: '#FFFFFF',            // Pure white background
          },
        });

        // Update session with QR code and expiry (extended to 5 minutes)
        await this.sessionRepository.update(id, {
          qrCode: qrCodeDataUrl,
          qrCodeExpiresAt: new Date(Date.now() + 300000), // 5 minutes
        });

        return {
          qrCode: qrCodeDataUrl,
          message: "QR code generated. Please scan with WhatsApp mobile app.",
        };
      } else {
        // Session might already be connected or authenticating
        return {
          message: "Session is connecting. Please wait...",
        };
      }
    } catch (error) {
      await this.sessionRepository.update(id, {
        status: WhatsAppSessionStatus.DISCONNECTED,
      });

      this.logger.error(`Failed to connect session ${id}:`, error);
      throw new BadRequestException("Failed to connect to WhatsApp");
    }
  }

  async disconnect(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ message: string }> {
    const session = await this.findOne(id, userId, organizationId);

    await this.baileysService.disconnectSession(id);

    await this.sessionRepository.update(id, {
      status: WhatsAppSessionStatus.DISCONNECTED,
      isActive: false,
    });

    // Log audit event (only if organizationId exists)
    if (organizationId) {
      await this.auditService.log({
        action: AuditAction.UPDATE,
        resourceType: "whatsapp_session",
        resourceId: id,
        userId,
        organizationId,
        description: `WhatsApp session ${session.name} disconnected`,
      });
    }

    return { message: "Session disconnected successfully" };
  }

  async sendMessage(
    sessionId: string,
    messageDto: SendMessageDto,
    userId: string,
    organizationId: string | null,
  ): Promise<{ messageId: string; status: string }> {
    const session = await this.findOne(sessionId, userId, organizationId);

    if (!session.isConnected) {
      throw new BadRequestException("Session is not connected");
    }

    try {
      // Send message through Baileys service
      const result = await this.baileysService.sendMessage(
        sessionId,
        messageDto,
      );

      // Track usage (only if organizationId exists)
      if (organizationId) {
        await this.trackUsage(
          organizationId,
          UsageMetricType.WHATSAPP_MESSAGES,
          1,
        );
      }

      // Log audit event (only if organizationId exists)
      if (organizationId) {
        await this.auditService.log({
          action: AuditAction.CREATE,
          resourceType: "whatsapp_message",
          userId,
          organizationId,
          description: `Message sent to ${messageDto.to}`,
          metadata: {
            sessionId,
            messageId: result.messageId,
            to: messageDto.to,
            type: messageDto.type || "text",
          },
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to send message from session ${sessionId}:`,
        error,
      );
      throw new BadRequestException("Failed to send message");
    }
  }

  async getQRCode(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ qrCode: string; expiresAt: Date; timeRemaining: number }> {
    const session = await this.findOne(id, userId, organizationId);

    if (!session.isQrCodeValid) {
      throw new BadRequestException("QR code is not available or has expired");
    }

    const timeRemaining =
      Math.max(0, session.qrCodeExpiresAt.getTime() - Date.now()) / 1000;

    return {
      qrCode: session.qrCode,
      expiresAt: session.qrCodeExpiresAt,
      timeRemaining: Math.floor(timeRemaining),
    };
  }

  /**
   * Request a pairing code as alternative to QR code scanning
   * This is useful for Android devices that have issues with QR scanning
   */
  async requestPairingCode(
    id: string,
    phoneNumber: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ pairingCode: string; expiresAt: Date }> {
    const session = await this.findOne(id, userId, organizationId);

    if (session.status === WhatsAppSessionStatus.CONNECTED) {
      throw new BadRequestException("Session is already connected");
    }

    // Format phone number: remove +, spaces, dashes, parentheses
    const formattedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');

    this.logger.log(`Requesting pairing code for session ${id} with phone ${formattedPhone}`);

    try {
      // Request pairing code from Baileys
      const pairingCode = await this.baileysService.requestPairingCode(id, formattedPhone);

      // Update session status
      await this.sessionRepository.update(id, {
        status: WhatsAppSessionStatus.CONNECTING,
        lastConnectionAttempt: new Date(),
      });

      return {
        pairingCode,
        expiresAt: new Date(Date.now() + 300000), // 5 minutes
      };
    } catch (error) {
      this.logger.error(`Failed to get pairing code: ${error.message}`);
      throw new BadRequestException(`Failed to generate pairing code: ${error.message}`);
    }
  }

  async getSessionStats(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<any> {
    const session = await this.findOne(id, userId, organizationId);

    // Initialize counters
    let sentToday = 0;
    let sentThisMonth = 0;
    let receivedToday = 0;
    let receivedThisMonth = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Find conversations by sessionId (primary) or by agentId if session has an agent
    const sessionWithAgent = await this.sessionRepository.findOne({
      where: { id },
      relations: ['agent'],
    });

    // Build query to find all conversations for this session
    const conversationQuery = this.conversationRepository
      .createQueryBuilder('conv')
      .select(['conv.id']);

    // Look for conversations by sessionId OR by agentId
    if (sessionWithAgent?.agent?.id) {
      conversationQuery.where(
        '(conv.sessionId = :sessionId OR conv.agentId = :agentId)',
        { sessionId: id, agentId: sessionWithAgent.agent.id }
      );
    } else {
      conversationQuery.where('conv.sessionId = :sessionId', { sessionId: id });
    }

    const conversations = await conversationQuery.getMany();
    const conversationIds = conversations.map(c => c.id);

    this.logger.debug(`Found ${conversationIds.length} conversations for session ${id}`);

    if (conversationIds.length > 0) {
      // Count messages SENT today (AI/AGENT role)
      sentToday = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId IN (:...conversationIds)', { conversationIds })
        .andWhere('message.role = :role', { role: MessageRole.AGENT })
        .andWhere('message.createdAt >= :today', { today })
        .getCount();

      // Count messages SENT this month (AI/AGENT role)
      sentThisMonth = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId IN (:...conversationIds)', { conversationIds })
        .andWhere('message.role = :role', { role: MessageRole.AGENT })
        .andWhere('message.createdAt >= :startOfMonth', { startOfMonth })
        .getCount();

      // Count messages RECEIVED today (USER role)
      receivedToday = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId IN (:...conversationIds)', { conversationIds })
        .andWhere('message.role = :role', { role: MessageRole.USER })
        .andWhere('message.createdAt >= :today', { today })
        .getCount();

      // Count messages RECEIVED this month (USER role)
      receivedThisMonth = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId IN (:...conversationIds)', { conversationIds })
        .andWhere('message.role = :role', { role: MessageRole.USER })
        .andWhere('message.createdAt >= :startOfMonth', { startOfMonth })
        .getCount();

      this.logger.debug(`Message counts - Sent Today: ${sentToday}, Received Today: ${receivedToday}, Sent Month: ${sentThisMonth}, Received Month: ${receivedThisMonth}`);
    }

    return {
      messagesSentToday: sentToday,
      messagesSentThisMonth: sentThisMonth,
      messagesReceivedToday: receivedToday,
      messagesReceivedThisMonth: receivedThisMonth,
      uptimePercentage: session.isActive ? 100 : 0,
      lastConnected: session.lastSeenAt,
      lastDisconnected:
        session.status === WhatsAppSessionStatus.DISCONNECTED
          ? session.updatedAt
          : null,
      connectionTimeToday: 0,
      connectionTimeThisMonth: 0,
    };
  }

  async getRealTimeStatus(
    id: string,
    userId: string,
    organizationId: string | null,
  ): Promise<{ status: string; isActive: boolean; needsSync: boolean }> {
    const session = await this.findOne(id, userId, organizationId);

    // Check if this session has been manually forced to connected (bypass Baileys check)
    if (session.metadata && session.metadata["forcedConnected"]) {
      return {
        status: "connected",
        isActive: true,
        needsSync: false,
      };
    }

    // Get real-time status from Baileys
    const realTimeStatus = this.baileysService.getSessionStatus(id);

    // Check if database status matches real-time status
    const dbStatus = session.status;
    const dbIsActive = session.isActive;

    let needsSync = false;
    let actualStatus = realTimeStatus;
    let actualIsActive = realTimeStatus === "connected";

    // Determine if sync is needed
    if (
      realTimeStatus === "connected" &&
      dbStatus !== WhatsAppSessionStatus.CONNECTED
    ) {
      needsSync = true;
    } else if (
      realTimeStatus === "connecting" &&
      dbStatus !== WhatsAppSessionStatus.CONNECTING
    ) {
      needsSync = true;
    } else if (
      realTimeStatus === "disconnected" &&
      dbStatus !== WhatsAppSessionStatus.DISCONNECTED
    ) {
      needsSync = true;
    }

    // Auto-sync if needed
    if (needsSync) {
      this.logger.log(
        `Syncing session ${id} status from ${dbStatus} to ${realTimeStatus}`,
      );

      let newStatus: WhatsAppSessionStatus;
      switch (realTimeStatus) {
        case "connected":
          newStatus = WhatsAppSessionStatus.CONNECTED;
          break;
        case "connecting":
          newStatus = WhatsAppSessionStatus.CONNECTING;
          break;
        default:
          newStatus = WhatsAppSessionStatus.DISCONNECTED;
          break;
      }

      await this.sessionRepository.update(id, {
        status: newStatus,
        isActive: actualIsActive,
        lastSeenAt: actualIsActive ? new Date() : session.lastSeenAt,
      });

      this.logger.log(`Session ${id} status synchronized to ${newStatus}`);
    }

    return {
      status: actualStatus,
      isActive: actualIsActive,
      needsSync,
    };
  }

  // Event handlers for Baileys events
  // NOTE: BaileysService is now the single source of truth for connection status.
  // This handler only logs events and manages auxiliary tasks (like lastSeenAt updates).
  @OnEvent("whatsapp.connection.update")
  async handleConnectionUpdate(data: { sessionId: string; update: any }) {
    const { sessionId, update } = data;

    try {
      this.logger.debug(`📡 Connection update received for session ${sessionId}: ${JSON.stringify(update)}`);

      // BaileysService handles all database status updates now.
      // We only handle auxiliary tasks here.

      if (update.connection === "open") {
        this.logger.log(`✅ Session ${sessionId} connected (handled by BaileysService)`);
        // Schedule periodic lastSeenAt updates for active sessions
        this.scheduleLastSeenUpdate(sessionId);
      } else if (update.connection === "connecting") {
        this.logger.debug(`🔄 Session ${sessionId} connecting (handled by BaileysService)`);
      } else if (update.connection === "close") {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        this.logger.log(`🔌 Session ${sessionId} closed with code ${statusCode} (handled by BaileysService)`);

        // Stop lastSeenAt updates for this session
        this.stopLastSeenUpdate(sessionId);
      }
    } catch (error) {
      this.logger.error(`❌ Error in connection update handler for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.device.removed")
  async handleDeviceRemoved(data: { sessionId: string; message: string; statusCode: number }) {
    const { sessionId, message, statusCode } = data;

    try {
      this.logger.warn(`🔴 Device removed event for session ${sessionId}: ${message}`);

      // Update session status in database
      const result = await this.sessionRepository.update(sessionId, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
        retryCount: 0,
      });

      this.logger.log(`📝 Updated session ${sessionId} to DISCONNECTED after device removal`);

      // Stop lastSeenAt updates
      this.stopLastSeenUpdate(sessionId);

      // Emit WebSocket event to frontend
      this.eventEmitter.emit("whatsapp.session.error", {
        sessionId,
        errorType: "device_removed",
        errorCode: statusCode,
        message: "Session disconnected by WhatsApp. Please unlink old devices and reconnect.",
        requiresReauth: true,
      });
    } catch (error) {
      this.logger.error(`Failed to handle device removed for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.connection.stale")
  async handleStaleConnection(data: { sessionId: string; message: string }) {
    const { sessionId, message } = data;

    try {
      this.logger.warn(`⚠️ Stale connection detected for session ${sessionId}: ${message}`);

      // Check if session has autoReconnect enabled
      const session = await this.sessionRepository.findOne({ where: { id: sessionId } });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found in database`);
        return;
      }

      // Update session status in database
      await this.sessionRepository.update(sessionId, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
      });

      // Stop lastSeenAt updates
      this.stopLastSeenUpdate(sessionId);

      // Emit WebSocket event to frontend
      this.eventEmitter.emit("whatsapp.session.status", {
        sessionId,
        status: "disconnected",
        message: "Connection became stale. Automatic reconnection will be attempted.",
      });

      // ACTUALLY trigger reconnection if autoReconnect is enabled
      if (session.autoReconnect) {
        this.logger.log(`🔄 Triggering automatic reconnection for stale session ${sessionId}`);

        // Small delay before reconnection attempt
        setTimeout(async () => {
          try {
            const result = await this.baileysService.connectSession(sessionId, false);
            if (result.needsQR) {
              this.logger.warn(`⚠️ Session ${sessionId} requires QR code - cannot auto-reconnect`);
            } else {
              this.logger.log(`✅ Stale session ${sessionId} reconnected successfully`);
            }
          } catch (error) {
            this.logger.error(`❌ Failed to reconnect stale session ${sessionId}:`, error.message);
          }
        }, 5000); // 5 second delay before reconnection
      }
    } catch (error) {
      this.logger.error(`Failed to handle stale connection for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.reconnect.success")
  async handleReconnectSuccess(data: { sessionId: string; attempt: number }) {
    const { sessionId, attempt } = data;

    try {
      this.logger.log(`✅ Reconnection successful for session ${sessionId} on attempt ${attempt}`);

      // Emit WebSocket event to frontend
      this.eventEmitter.emit("whatsapp.session.status", {
        sessionId,
        status: "connected",
        message: `Session reconnected successfully after ${attempt} attempt(s).`,
      });

      // Restart lastSeenAt updates
      this.scheduleLastSeenUpdate(sessionId);
    } catch (error) {
      this.logger.error(`Failed to handle reconnect success for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.reconnect.failed")
  async handleReconnectFailed(data: { sessionId: string; totalAttempts: number; errorType?: string }) {
    const { sessionId, totalAttempts, errorType } = data;

    try {
      this.logger.error(`❌ All reconnection attempts failed for session ${sessionId} (${totalAttempts} attempts, error: ${errorType})`);

      // Update session status
      await this.sessionRepository.update(sessionId, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
      });

      // Emit WebSocket event to frontend
      this.eventEmitter.emit("whatsapp.session.error", {
        sessionId,
        errorType: "reconnect_failed",
        message: `Failed to reconnect after ${totalAttempts} attempts. Please reconnect manually.`,
        requiresReauth: false,
      });
    } catch (error) {
      this.logger.error(`Failed to handle reconnect failure for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.reconnect.needs.qr")
  async handleReconnectNeedsQR(data: { sessionId: string; message: string }) {
    const { sessionId, message } = data;

    try {
      this.logger.warn(`⚠️ Session ${sessionId} requires QR code for reconnection: ${message}`);

      // Update session status
      await this.sessionRepository.update(sessionId, {
        status: WhatsAppSessionStatus.DISCONNECTED,
        isActive: false,
      });

      // Emit WebSocket event to frontend
      this.eventEmitter.emit("whatsapp.session.error", {
        sessionId,
        errorType: "needs_qr",
        message: "Session requires QR code authentication. Please scan the QR code again.",
        requiresReauth: true,
      });
    } catch (error) {
      this.logger.error(`Failed to handle reconnect needs QR for session ${sessionId}:`, error);
    }
  }

  private lastSeenTimers = new Map<string, NodeJS.Timeout>();

  private scheduleLastSeenUpdate(sessionId: string) {
    // Clear existing timer if any
    this.stopLastSeenUpdate(sessionId);

    // Update lastSeenAt every 60 seconds for active sessions (less frequent to reduce DB load)
    const timer = setInterval(async () => {
      try {
        const session = await this.sessionRepository.findOne({
          where: { id: sessionId },
        });
        if (
          session &&
          session.isActive &&
          session.status === WhatsAppSessionStatus.CONNECTED
        ) {
          await this.sessionRepository.update(sessionId, {
            lastSeenAt: new Date(),
          });
          this.logger.debug(`Updated lastSeenAt for session ${sessionId}`);
        } else {
          // Session no longer active, stop the timer
          this.stopLastSeenUpdate(sessionId);
        }
      } catch (error) {
        this.logger.debug(`Failed to update lastSeenAt for ${sessionId}: ${error.message}`);
        // Don't stop the timer on transient errors
      }
    }, 60000); // 60 seconds (reduced frequency)

    this.lastSeenTimers.set(sessionId, timer);
    this.logger.debug(`Started lastSeenAt timer for session ${sessionId}`);
  }

  private stopLastSeenUpdate(sessionId: string) {
    const existingTimer = this.lastSeenTimers.get(sessionId);
    if (existingTimer) {
      clearInterval(existingTimer);
      this.lastSeenTimers.delete(sessionId);
      this.logger.debug(`Stopped lastSeenAt timer for session ${sessionId}`);
    }
  }

  // NOTE: whatsapp.message.received is handled exclusively by WhatsAppAIResponderService.
  // Previously this handler re-emitted as whatsapp.conversation.message, which caused
  // SimpleConversationService to save the same message in a separate conversation record.
  // The catch-up system then found these orphaned messages (with no agent response) and
  // generated ghost AI responses. Removing this handler stops the duplicate chain.

  // NOTE: whatsapp.sync.messages.batch and whatsapp.sync.message events are handled
  // exclusively by SimpleConversationService to avoid duplicate processing and DB saturation.

  @OnEvent("whatsapp.sync.started")
  async handleSyncStarted(data: { sessionId: string; totalChats: number }) {
    this.logger.log(
      `🔄 WhatsApp sync started for session ${data.sessionId}: ${data.totalChats} chats to process`,
    );

    // Update session status to indicate sync is in progress
    const session = await this.sessionRepository.findOne({
      where: { id: data.sessionId },
    });
    if (session) {
      session.metadata = {
        ...session.metadata,
        syncInProgress: true,
        totalChats: data.totalChats,
        syncedChats: 0,
      };
      await this.sessionRepository.save(session);
    }

    // Emit to frontend via Gateway
    this.eventEmitter.emit("whatsapp.session.sync", {
      sessionId: data.sessionId,
      status: "started",
      totalChats: data.totalChats,
    });
  }

  @OnEvent("whatsapp.sync.progress")
  async handleSyncProgress(data: {
    sessionId: string;
    syncedChats: number;
    totalChats: number;
    currentChat: string;
  }) {
    this.logger.log(
      `🔄 WhatsApp sync progress for session ${data.sessionId}: ${data.syncedChats}/${data.totalChats} - ${data.currentChat}`,
    );

    // Update session metadata
    const session = await this.sessionRepository.findOne({
      where: { id: data.sessionId },
    });
    if (session) {
      session.metadata = {
        ...session.metadata,
        syncInProgress: true,
        totalChats: data.totalChats,
        syncedChats: data.syncedChats,
        currentChat: data.currentChat,
      };
      await this.sessionRepository.save(session);
    }

    // Emit to frontend via Gateway
    this.eventEmitter.emit("whatsapp.session.sync", {
      sessionId: data.sessionId,
      status: "progress",
      syncedChats: data.syncedChats,
      totalChats: data.totalChats,
      currentChat: data.currentChat,
    });
  }

  @OnEvent("whatsapp.sync.completed")
  async handleSyncCompleted(data: {
    sessionId: string;
    syncedChats: number;
    totalChats: number;
  }) {
    // This runs as an async @OnEvent handler: any throw here (e.g. a transient
    // DB/query failure under memory pressure) would surface as an unhandled
    // rejection and can crash the whole process. Contain it locally.
    try {
      this.logger.log(
        `✅ WhatsApp sync completed for session ${data?.sessionId}: ${data?.syncedChats}/${data?.totalChats} chats processed`,
      );

      if (!data?.sessionId) return;

      // Update session to indicate sync is complete
      const session = await this.sessionRepository.findOne({
        where: { id: data.sessionId },
      });
      if (session) {
        session.metadata = {
          ...session.metadata,
          syncInProgress: false,
          syncCompleted: true,
          syncCompletedAt: new Date().toISOString(),
          totalChats: data.totalChats,
          syncedChats: data.syncedChats,
        };
        await this.sessionRepository.save(session);
      }

      // Emit to frontend via Gateway
      this.eventEmitter.emit("whatsapp.session.sync", {
        sessionId: data.sessionId,
        status: "completed",
        syncedChats: data.syncedChats,
        totalChats: data.totalChats,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process sync completion for session ${data?.sessionId}: ${error?.message}`,
      );
    }
  }

  @OnEvent("whatsapp.sync.failed")
  async handleSyncFailed(data: { sessionId: string; error: string }) {
    try {
      this.logger.error(
        `❌ WhatsApp sync failed for session ${data?.sessionId}: ${data?.error}`,
      );

      if (!data?.sessionId) return;

      // Update session to indicate sync failed
      const session = await this.sessionRepository.findOne({
        where: { id: data.sessionId },
      });
      if (session) {
        session.metadata = {
          ...session.metadata,
          syncInProgress: false,
          syncFailed: true,
          syncFailedAt: new Date().toISOString(),
          syncError: data.error,
        };
        await this.sessionRepository.save(session);
      }

      // Emit to frontend via Gateway
      this.eventEmitter.emit("whatsapp.session.sync", {
        sessionId: data.sessionId,
        status: "failed",
        error: data.error,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process sync failure for session ${data?.sessionId}: ${error?.message}`,
      );
    }
  }

  @OnEvent("whatsapp.qr.update")
  async handleQRUpdate(data: { sessionId: string; qr: string }) {
    const { sessionId, qr } = data;

    // Generate QR code with enhanced options for better Android compatibility
    const qrCodeDataUrl = await QRCode.toDataURL(qr, {
      width: 512,                    // Larger size for better scanning
      margin: 2,                     // Adequate margin
      errorCorrectionLevel: 'H',     // Highest error correction for reliable scanning
      color: {
        dark: '#000000',             // Pure black for maximum contrast
        light: '#FFFFFF',            // Pure white background
      },
    });

    await this.sessionRepository.update(sessionId, {
      qrCode: qrCodeDataUrl,
      qrCodeExpiresAt: new Date(Date.now() + 300000), // 5 minutes
    });

    this.logger.log(`QR code updated for session ${sessionId}`);
  }

  @OnEvent("whatsapp.send.message")
  async handleSendMessage(data: {
    sessionId: string;
    phoneNumber: string;
    message: string;
    mediaUrl?: string;
    type?: string;
    caption?: string;
    filename?: string;
  }) {
    const { sessionId, phoneNumber, message, mediaUrl, type, caption, filename } = data;

    this.logger.log(
      `📨 RECEIVED whatsapp.send.message event: sessionId=${sessionId}, phoneNumber=${phoneNumber}, type=${type || 'text'}, message="${message}"`,
    );

    try {
      // Get session from database to find userId and organizationId
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        this.logger.error(`Session ${sessionId} not found for sending message`);
        return;
      }

      // Build message DTO with media support
      const messageDto: any = {
        to: phoneNumber,
        message: message || caption || '',
        type: mediaUrl ? (type || 'image') : 'text',
      };

      if (mediaUrl) {
        messageDto.mediaUrl = mediaUrl;
        messageDto.caption = caption || message || '';
        if (filename) {
          messageDto.filename = filename;
        }
      }

      // Use the existing sendMessage method with correct userId
      await this.sendMessage(
        sessionId,
        messageDto,
        session.userId,
        session.organizationId,
      );

      this.logger.log(`Sent automated message to ${phoneNumber}: type=${messageDto.type}, message="${message}"`);
    } catch (error) {
      this.logger.error(
        `Failed to send automated message to ${phoneNumber}:`,
        error,
      );
    }
  }

  private async checkUserAccess(
    userId: string,
    organizationId?: string,
  ): Promise<void> {
    // If no organization ID provided, allow access for personal use
    if (!organizationId) {
      return;
    }

    const membership = await this.organizationMemberRepository.findOne({
      where: { userId, organizationId },
    });

    if (!membership) {
      throw new ForbiddenException("Access denied to this organization");
    }
  }

  private async trackUsage(
    organizationId: string,
    type: UsageMetricType,
    value: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

    // Find or create usage metric for today
    let usageMetric = await this.usageMetricRepository.findOne({
      where: { organizationId, type, date },
    });

    if (usageMetric) {
      usageMetric.value = Number(usageMetric.value) + value;
      if (metadata) {
        usageMetric.metadata = { ...usageMetric.metadata, ...metadata };
      }
    } else {
      usageMetric = this.usageMetricRepository.create({
        organizationId,
        type,
        value,
        date,
        metadata: metadata || {},
      });
    }

    await this.usageMetricRepository.save(usageMetric);
  }

  // ==================== CONTACT SYNCHRONIZATION ====================

  @OnEvent("whatsapp.contacts.sync")
  async handleContactsSync(data: { sessionId: string; contacts: any[]; isInitial: boolean }) {
    const { sessionId, contacts, isInitial } = data;
    this.logger.log(`📇 Processing ${contacts.length} contacts for session ${sessionId} (initial: ${isInitial})`);

    try {
      for (const contact of contacts) {
        await this.upsertContact(sessionId, contact);
      }
      this.logger.log(`✅ Successfully synced ${contacts.length} contacts for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to sync contacts for session ${sessionId}:`, error);
    }
  }

  @OnEvent("whatsapp.contacts.update")
  async handleContactsUpdate(data: { sessionId: string; contacts: any[] }) {
    const { sessionId, contacts } = data;
    this.logger.log(`📇 Updating ${contacts.length} contacts for session ${sessionId}`);

    try {
      for (const contact of contacts) {
        await this.upsertContact(sessionId, contact);
      }
      this.logger.log(`✅ Successfully updated ${contacts.length} contacts for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to update contacts for session ${sessionId}:`, error);
    }
  }

  private async upsertContact(sessionId: string, contact: any): Promise<void> {
    try {
      // Extract contact identifiers
      const contactId = contact.id || contact.jid || '';
      const isLidFormat = contactId.includes('@lid');

      // Extract LID (remove @lid suffix and store)
      const lid = isLidFormat ? contactId.replace(/@lid$/i, '') : (contact.lid || undefined);

      // Extract phone number - for LID contacts, the real phone might be in a different field
      // or we need to skip if we can't get a valid phone number
      let phoneNumber = '';

      if (isLidFormat) {
        // For LID contacts, Baileys v7 provides phoneNumber field when id is a LID
        // Try multiple sources for the real phone number
        phoneNumber = this.cleanPhoneNumber(
          contact.phoneNumber || // Baileys v7 puts real phone here when id is LID
          contact.phone ||
          ''
        );

        // If still no phone, try to resolve via Baileys lidMapping
        if (!phoneNumber && lid) {
          try {
            // Use the sessionId parameter passed to this function, not contact.sessionId
            const resolved = await this.baileysService.resolveLidToPhoneNumber(sessionId, lid);
            if (resolved) {
              phoneNumber = resolved;
              this.logger.log(`Resolved LID ${lid} to phone ${phoneNumber} during contact upsert`);
            }
          } catch (error) {
            this.logger.debug(`Could not resolve LID during upsert: ${error.message}`);
          }
        }

        if (!phoneNumber && lid) {
          // If no phone available, use LID as identifier but mark it specially
          // This allows us to at least store the contact for later resolution
          phoneNumber = `lid_${lid.substring(0, 20)}`; // Use truncated LID as temporary ID
          this.logger.debug(`Storing LID contact with temporary phone: ${phoneNumber}`);
        }
      } else {
        phoneNumber = this.cleanPhoneNumber(contactId);
      }

      if (!phoneNumber) {
        return; // Skip contacts without valid identifiers
      }

      // Check if contact exists - check both by phone and by LID
      let existingContact = await this.contactRepository.findOne({
        where: { sessionId, phoneNumber },
      });

      // Also check by LID if we have one
      if (!existingContact && lid) {
        existingContact = await this.contactRepository.findOne({
          where: { sessionId, lid },
        });

        if (existingContact && existingContact.phoneNumber !== phoneNumber) {
          // We found a contact by LID - update its phone number if we have a better one
          if (!phoneNumber.startsWith('lid_') && existingContact.phoneNumber.startsWith('lid_')) {
            existingContact.phoneNumber = phoneNumber;
            this.logger.log(`Updated phone number for LID contact: ${lid} -> ${phoneNumber}`);
          }
        }
      }

      if (existingContact) {
        // Update existing contact
        existingContact.name = contact.name || contact.notify || existingContact.name;
        existingContact.pushName = contact.notify || contact.verifiedName || existingContact.pushName;
        existingContact.shortName = contact.shortName || existingContact.shortName;
        existingContact.lid = lid || existingContact.lid;
        existingContact.isBusiness = contact.isBusiness || existingContact.isBusiness;
        existingContact.profilePictureUrl = contact.imgUrl || existingContact.profilePictureUrl;
        existingContact.lastInteractionAt = new Date();
        existingContact.metadata = {
          ...existingContact.metadata,
          verifiedName: contact.verifiedName,
          status: contact.status,
          rawId: contactId,
        };

        await this.contactRepository.save(existingContact);
      } else {
        // Create new contact
        const newContact = this.contactRepository.create({
          sessionId,
          phoneNumber,
          lid: lid,
          name: contact.name || contact.notify,
          pushName: contact.notify || contact.verifiedName,
          shortName: contact.shortName,
          isBusiness: contact.isBusiness || false,
          isGroup: contactId.includes('@g.us'),
          profilePictureUrl: contact.imgUrl,
          lastInteractionAt: new Date(),
          metadata: {
            verifiedName: contact.verifiedName,
            status: contact.status,
            rawId: contactId,
          },
        });

        await this.contactRepository.save(newContact);
      }
    } catch (error) {
      this.logger.error(`Failed to upsert contact:`, error);
    }
  }

  private cleanPhoneNumber(contactId: string): string {
    if (!contactId) return '';

    return contactId
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@lid$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/@g\.us$/i, '')
      .replace(/[^\d+]/g, ''); // Keep only digits and +
  }

  // Get contacts for a session
  async getContacts(sessionId: string, userId: string, organizationId: string | null): Promise<WhatsAppContact[]> {
    try {
      // Verify session access
      const session = await this.findOne(sessionId, userId, organizationId);

      const contacts = await this.contactRepository.find({
        where: { sessionId },
        order: { name: 'ASC', phoneNumber: 'ASC' },
      });

      // Fetch missing profile pictures in background (non-blocking)
      this.fetchMissingProfilePictures(sessionId, contacts).catch(err => {
        this.logger.debug(`Background profile picture fetch failed: ${err.message}`);
      });

      return contacts;
    } catch (error) {
      this.logger.warn(`Failed to get contacts for session ${sessionId}: ${error.message}`);
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  // Fetch and update profile pictures for contacts that don't have them
  private async fetchMissingProfilePictures(sessionId: string, contacts: WhatsAppContact[]): Promise<void> {
    // Only process contacts without profile pictures, limit to 10 at a time to avoid rate limiting
    const contactsWithoutPicture = contacts
      .filter(c => !c.profilePictureUrl && c.phoneNumber && !c.phoneNumber.startsWith('lid_'))
      .slice(0, 10);

    if (contactsWithoutPicture.length === 0) {
      return;
    }

    this.logger.debug(`Fetching profile pictures for ${contactsWithoutPicture.length} contacts`);

    for (const contact of contactsWithoutPicture) {
      try {
        const jid = contact.phoneNumber.includes('@')
          ? contact.phoneNumber
          : `${contact.phoneNumber}@s.whatsapp.net`;

        const profilePictureUrl = await this.baileysService.getProfilePictureUrl(sessionId, jid);

        if (profilePictureUrl) {
          await this.contactRepository.update(contact.id, { profilePictureUrl });
          this.logger.debug(`Updated profile picture for ${contact.phoneNumber}`);
        }
      } catch (error) {
        // Silently ignore individual failures
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Get contact by phone number
  async getContactByPhone(sessionId: string, phoneNumber: string): Promise<WhatsAppContact | null> {
    const cleanPhone = this.cleanPhoneNumber(phoneNumber);

    return this.contactRepository.findOne({
      where: { sessionId, phoneNumber: cleanPhone },
    });
  }

  // Get contact name for display
  async getContactName(sessionId: string, phoneNumber: string): Promise<string> {
    const contact = await this.getContactByPhone(sessionId, phoneNumber);

    if (contact) {
      return contact.name || contact.pushName || contact.shortName || phoneNumber;
    }

    return phoneNumber;
  }

  /**
   * Get contact by LID (Linked Identity) - Baileys v7+
   * LID is an encrypted identifier used instead of real phone numbers
   */
  async getContactByLid(sessionId: string, lid: string): Promise<WhatsAppContact | null> {
    // Clean the LID (remove @lid suffix if present)
    const cleanLid = lid.replace(/@lid$/i, '');

    return this.contactRepository.findOne({
      where: { sessionId, lid: cleanLid },
    });
  }

  /**
   * Resolve real phone number from JID
   * Handles both regular phone JIDs and LID (Linked Identity) format
   * @param sessionId The session ID to look up contacts
   * @param jid The JID which could be phone@s.whatsapp.net or lid_value@lid
   * @returns The real phone number or the original JID if not resolvable
   */
  async resolveRealPhoneNumber(sessionId: string, jid: string): Promise<string> {
    if (!jid) return jid;

    // Check if this is a LID format (contains @lid)
    if (jid.includes('@lid')) {
      this.logger.debug(`Resolving LID format JID: ${jid}`);

      const lid = jid.replace(/@lid$/i, '');

      // Method 1: Try Baileys' lidMapping store (most reliable for v7+)
      try {
        const resolvedPhone = await this.baileysService.resolveLidToPhoneNumber(sessionId, lid);
        if (resolvedPhone && !resolvedPhone.startsWith('lid')) {
          this.logger.log(`Resolved LID ${lid} to phone ${resolvedPhone} via Baileys lidMapping`);

          // Also update our contact database with this mapping
          const existingContact = await this.getContactByLid(sessionId, lid);
          if (existingContact && existingContact.phoneNumber.startsWith('lid_')) {
            existingContact.phoneNumber = resolvedPhone;
            await this.contactRepository.save(existingContact);
            this.logger.log(`Updated contact ${lid} with resolved phone ${resolvedPhone}`);
          }

          return `${resolvedPhone}@s.whatsapp.net`;
        }
      } catch (error) {
        this.logger.debug(`Baileys lidMapping resolution failed for ${lid}: ${error.message}`);
      }

      // Method 2: Look up contact by LID in our database
      const contact = await this.getContactByLid(sessionId, lid);

      if (contact && contact.phoneNumber) {
        // Check if we have a real phone number (not a temporary lid_ placeholder)
        if (!contact.phoneNumber.startsWith('lid_')) {
          this.logger.log(`Resolved LID ${lid} to phone number ${contact.phoneNumber} from DB`);
          // Return in full JID format for consistency
          return `${contact.phoneNumber}@s.whatsapp.net`;
        } else {
          this.logger.debug(`Contact found for LID ${lid} but phone number is temporary: ${contact.phoneNumber}`);
        }
      }

      this.logger.warn(`Could not resolve LID ${lid} to real phone number`);
      // Return the original JID if we can't resolve it
      return jid;
    }

    // For regular JIDs, return as-is
    return jid;
  }

  /**
   * Check if a JID is in LID format
   */
  isLidFormat(jid: string): boolean {
    return jid && jid.includes('@lid');
  }
}
