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
} from "@/common/entities";
import {
  WhatsAppSessionStatus,
  UserRole,
  UsageMetricType,
  AuditAction,
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
    const updatedSessions = await Promise.all(
      sessions.map(async (session) => {
        // Check if session is actually active in Baileys
        const isReallyActive = await this.baileysService.isSessionActive(
          session.id,
        );

        // Update session with real status
        if (
          session.status === WhatsAppSessionStatus.CONNECTED &&
          !isReallyActive
        ) {
          session.status = WhatsAppSessionStatus.DISCONNECTED;
          session.isActive = false;
          // Update in database too
          await this.sessionRepository.update(session.id, {
            status: WhatsAppSessionStatus.DISCONNECTED,
            isActive: false,
          });
        } else if (
          session.status === WhatsAppSessionStatus.DISCONNECTED &&
          isReallyActive
        ) {
          session.status = WhatsAppSessionStatus.CONNECTED;
          session.isActive = true;
          // Update in database too
          await this.sessionRepository.update(session.id, {
            status: WhatsAppSessionStatus.CONNECTED,
            isActive: true,
          });
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

    // Get message counts from usage metrics (only if organizationId exists)
    let messagesToday = { total: "0" };
    let messagesThisMonth = { total: "0" };

    if (organizationId) {
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = new Date().toISOString().slice(0, 7);

      messagesToday = await this.usageMetricRepository
        .createQueryBuilder("usage")
        .where("usage.organizationId = :organizationId", { organizationId })
        .andWhere("usage.type = :type", {
          type: UsageMetricType.WHATSAPP_MESSAGES,
        })
        .andWhere("usage.date = :date", { date: today })
        .select("SUM(usage.value)", "total")
        .getRawOne();

      messagesThisMonth = await this.usageMetricRepository
        .createQueryBuilder("usage")
        .where("usage.organizationId = :organizationId", { organizationId })
        .andWhere("usage.type = :type", {
          type: UsageMetricType.WHATSAPP_MESSAGES,
        })
        .andWhere("DATE_TRUNC('month', usage.date::date) = :month", {
          month: `${thisMonth}-01`,
        })
        .select("SUM(usage.value)", "total")
        .getRawOne();
    }

    return {
      messagesSentToday: parseInt(messagesToday?.total || "0"),
      messagesSentThisMonth: parseInt(messagesThisMonth?.total || "0"),
      messagesReceivedToday: 0, // TODO: Implement received message tracking
      messagesReceivedThisMonth: 0, // TODO: Implement received message tracking
      uptimePercentage: session.isActive ? 95 : 0, // TODO: Calculate actual uptime
      lastConnected: session.lastSeenAt,
      lastDisconnected:
        session.status === WhatsAppSessionStatus.DISCONNECTED
          ? session.updatedAt
          : null,
      connectionTimeToday: 0, // TODO: Implement connection time tracking
      connectionTimeThisMonth: 0, // TODO: Implement connection time tracking
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
  @OnEvent("whatsapp.connection.update")
  async handleConnectionUpdate(data: { sessionId: string; update: any }) {
    const { sessionId, update } = data;

    try {
      this.logger.log(`📡 Connection update received for session ${sessionId}: ${JSON.stringify(update)}`);

      // Check if session exists in database
      const existingSession = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!existingSession) {
        this.logger.warn(`⚠️ Session ${sessionId} not found in database - cannot update status`);
        return;
      }

      let status = WhatsAppSessionStatus.DISCONNECTED;
      let isActive = false;
      let updateData: any = {};

      if (update.connection === "open") {
        status = WhatsAppSessionStatus.CONNECTED;
        isActive = true;
        updateData = {
          status,
          isActive,
          lastSeenAt: new Date(),
          retryCount: 0,
        };
        this.logger.log(`✅ Session ${sessionId} is now CONNECTED in database`);
      } else if (update.connection === "connecting") {
        status = WhatsAppSessionStatus.CONNECTING;
        updateData = {
          status,
          lastConnectionAttempt: new Date(),
        };
        this.logger.log(`🔄 Session ${sessionId} is CONNECTING`);
      } else if (update.connection === "close") {
        // Check if this is a permanent disconnect or temporary
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === 401 || statusCode === 403 || statusCode === 515;

        if (isLoggedOut) {
          // Permanent disconnect - update immediately
          status = WhatsAppSessionStatus.DISCONNECTED;
          isActive = false;
          updateData = {
            status,
            isActive,
          };
          this.logger.log(`🚪 Session ${sessionId} logged out permanently (code: ${statusCode})`);
        } else {
          // Temporary disconnect - keep status as connecting to allow reconnection
          // Only update to disconnected after a delay if not reconnected
          this.logger.log(`⏳ Session ${sessionId} temporarily disconnected (code: ${statusCode}) - waiting for reconnection...`);

          // Schedule a delayed status update (30 seconds)
          setTimeout(async () => {
            try {
              // Re-check if session is still disconnected
              const currentSession = await this.sessionRepository.findOne({
                where: { id: sessionId },
              });
              // Only mark as disconnected if still not connected
              if (currentSession && currentSession.status !== WhatsAppSessionStatus.CONNECTED) {
                await this.sessionRepository.update(sessionId, {
                  status: WhatsAppSessionStatus.DISCONNECTED,
                  isActive: false,
                });
                this.logger.log(`❌ Session ${sessionId} confirmed DISCONNECTED after timeout`);
              }
            } catch (error) {
              this.logger.error(`Failed to update delayed disconnect status:`, error);
            }
          }, 30000); // 30 second delay

          // Don't update database immediately for temporary disconnects
          return;
        }
      } else {
        this.logger.debug(`Session ${sessionId} received update without connection state change`);
        return;
      }

      const result = await this.sessionRepository.update(sessionId, updateData);
      this.logger.log(`📝 Database update result for ${sessionId}: ${JSON.stringify(result)}`);

      // Verify the update worked
      const verifySession = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });
      this.logger.log(`✓ Verified session ${sessionId} status in DB: ${verifySession?.status}, isActive: ${verifySession?.isActive}`);

      // Also update lastSeenAt periodically for active sessions
      if (isActive) {
        this.scheduleLastSeenUpdate(sessionId);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to update connection status for session ${sessionId}:`, error);
    }
  }

  private lastSeenTimers = new Map<string, NodeJS.Timeout>();

  private scheduleLastSeenUpdate(sessionId: string) {
    // Clear existing timer if any
    const existingTimer = this.lastSeenTimers.get(sessionId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Update lastSeenAt every 30 seconds for active sessions
    const timer = setInterval(async () => {
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
        clearInterval(timer);
        this.lastSeenTimers.delete(sessionId);
      }
    }, 30000); // 30 seconds

    this.lastSeenTimers.set(sessionId, timer);
  }

  @OnEvent("whatsapp.message.received")
  async handleIncomingMessage(data: {
    sessionId: string;
    message: any;
    type: string;
  }) {
    const { sessionId, message } = data;

    try {
      this.logger.log(`Processing incoming message for session ${sessionId}`);

      // Get session details
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["user"],
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for incoming message`);
        return;
      }

      this.logger.log(`Found session ${sessionId} for user ${session.userId}`);

      // Extract sender information - handle undefined key
      if (!message.key) {
        this.logger.warn(
          `Message has no key, skipping: ${JSON.stringify(message)}`,
        );
        return;
      }

      const remoteJid = message.key.remoteJid;
      if (!remoteJid) {
        this.logger.warn(
          `Message has no remoteJid, skipping: ${JSON.stringify(message.key)}`,
        );
        return;
      }

      const fromNumber = remoteJid
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "");
      const isGroup = remoteJid.endsWith("@g.us");
      let messageText =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        "Media message";

      // Try to download media for real-time messages
      if (message.message?.imageMessage) {
        try {
          const { downloadMediaMessage } = await import(
            "@whiskeysockets/baileys"
          );
          const buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
              logger: this.logger as any,
              reuploadRequest: () => Promise.resolve(message),
            },
          );

          if (buffer) {
            const base64 = buffer.toString("base64");
            const mimeType =
              message.message.imageMessage.mimetype || "image/jpeg";
            messageText = `data:${mimeType};base64,${base64}`;
            this.logger.log(
              `Downloaded real-time image for message ${message.key.id}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to download real-time image for message ${message.key.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `Received ${isGroup ? "group" : "individual"} message from ${fromNumber}: ${messageText}`,
      );

      // Emit event for conversation handling
      this.eventEmitter.emit("whatsapp.conversation.message", {
        sessionId,
        userId: session.userId,
        organizationId: session.organizationId,
        fromNumber: remoteJid, // Use full JID to preserve group vs individual distinction
        messageText,
        messageId: message.key.id,
        timestamp: new Date(),
        isGroup,
        groupId: isGroup ? fromNumber : null,
        participant: isGroup ? message.key.participant : null, // Individual sender in group
        isFromMe: message.key.fromMe,
        isHistorical: false, // CRITICAL: Mark as real-time message to enable AI responses
        messageType: message.message?.imageMessage
          ? "image"
          : message.message?.videoMessage
            ? "video"
            : message.message?.audioMessage
              ? "audio"
              : message.message?.documentMessage
                ? "file"
                : "text",
      });

      this.logger.log(
        `Emitted whatsapp.conversation.message event for ${fromNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle incoming message for session ${sessionId}:`,
        error,
      );
    }
  }

  @OnEvent("whatsapp.sync.messages.batch")
  async handleSyncMessagesBatch(data: {
    sessionId: string;
    messages: Array<{
      sessionId: string;
      fromNumber: string;
      messageText: string;
      messageId: string;
      timestamp: Date;
      isGroup?: boolean;
      isHistorical?: boolean;
      isFromMe?: boolean;
      messageType?: string;
      groupId?: string;
      participant?: string;
    }>;
  }) {
    const { sessionId, messages } = data;

    try {
      this.logger.log(
        `Processing batch of ${messages.length} historical messages for session ${sessionId}`,
      );

      // Get session details once for the entire batch
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["user"],
      });

      if (!session) {
        this.logger.warn(
          `Session ${sessionId} not found for sync messages batch`,
        );
        return;
      }

      // Process messages in the batch
      for (const messageData of messages) {
        try {
          await this.processSyncMessage(session, messageData);
        } catch (error) {
          this.logger.error(
            `Error processing sync message ${messageData.messageId}:`,
            error,
          );
        }
      }

      this.logger.log(`Completed processing batch for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Error processing sync messages batch for session ${sessionId}:`,
        error,
      );
    }
  }

  @OnEvent("whatsapp.sync.message")
  async handleSyncMessage(data: {
    sessionId: string;
    fromNumber: string;
    messageText: string;
    messageId: string;
    timestamp: Date;
    isGroup?: boolean;
    isHistorical?: boolean;
    isFromMe?: boolean;
    messageType?: string;
    groupId?: string;
    participant?: string;
  }) {
    const { sessionId } = data;

    try {
      this.logger.log(
        `Processing individual historical message for session ${sessionId}`,
      );

      // Get session details
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["user"],
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found for sync message`);
        return;
      }

      await this.processSyncMessage(session, data);
    } catch (error) {
      this.logger.error(
        `Error processing individual sync message for session ${sessionId}:`,
        error,
      );
    }
  }

  private async processSyncMessage(
    session: any,
    data: {
      sessionId: string;
      fromNumber: string;
      messageText: string;
      messageId: string;
      timestamp: Date;
      isGroup?: boolean;
      isHistorical?: boolean;
      isFromMe?: boolean;
      messageType?: string;
      groupId?: string;
      participant?: string;
    },
  ) {
    const {
      sessionId,
      fromNumber,
      messageText,
      messageId,
      timestamp,
      isGroup,
      isHistorical,
      isFromMe,
      messageType,
    } = data;

    try {
      // Emit event for conversation handling (same as regular messages but marked as historical)
      this.eventEmitter.emit("whatsapp.conversation.message", {
        sessionId,
        userId: session.userId,
        organizationId: session.organizationId,
        fromNumber,
        messageText,
        messageId,
        timestamp,
        isGroup,
        groupId: data.groupId,
        participant: data.participant,
        isHistorical: true, // Important: mark as historical so we don't generate AI responses
        isFromMe, // Include sender information
        messageType, // Include message type
      });

      this.logger.log(
        `Emitted historical whatsapp.conversation.message event for ${fromNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle sync message for session ${sessionId}:`,
        error,
      );
    }
  }

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
    this.logger.log(
      `✅ WhatsApp sync completed for session ${data.sessionId}: ${data.syncedChats}/${data.totalChats} chats processed`,
    );

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
  }

  @OnEvent("whatsapp.sync.failed")
  async handleSyncFailed(data: { sessionId: string; error: string }) {
    this.logger.error(
      `❌ WhatsApp sync failed for session ${data.sessionId}: ${data.error}`,
    );

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
  }) {
    const { sessionId, phoneNumber, message } = data;

    this.logger.log(
      `📨 RECEIVED whatsapp.send.message event: sessionId=${sessionId}, phoneNumber=${phoneNumber}, message="${message}"`,
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

      // Use the existing sendMessage method with correct userId
      await this.sendMessage(
        sessionId,
        {
          to: phoneNumber,
          message,
          type: "text",
        },
        session.userId,
        session.organizationId,
      );

      this.logger.log(`Sent automated message to ${phoneNumber}: ${message}`);
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
      usageMetric.value += value;
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
      // Extract phone number from contact id (remove @s.whatsapp.net, @lid, etc.)
      const contactId = contact.id || contact.jid || '';
      const phoneNumber = this.cleanPhoneNumber(contactId);

      if (!phoneNumber) {
        return; // Skip contacts without valid phone numbers
      }

      // Check if contact exists
      let existingContact = await this.contactRepository.findOne({
        where: { sessionId, phoneNumber },
      });

      if (existingContact) {
        // Update existing contact
        existingContact.name = contact.name || contact.notify || existingContact.name;
        existingContact.pushName = contact.notify || contact.verifiedName || existingContact.pushName;
        existingContact.shortName = contact.shortName || existingContact.shortName;
        existingContact.lid = contact.lid || contactId.includes('@lid') ? contactId : existingContact.lid;
        existingContact.isBusiness = contact.isBusiness || existingContact.isBusiness;
        existingContact.profilePictureUrl = contact.imgUrl || existingContact.profilePictureUrl;
        existingContact.lastInteractionAt = new Date();
        existingContact.metadata = {
          ...existingContact.metadata,
          verifiedName: contact.verifiedName,
          status: contact.status,
        };

        await this.contactRepository.save(existingContact);
      } else {
        // Create new contact
        const newContact = this.contactRepository.create({
          sessionId,
          phoneNumber,
          lid: contactId.includes('@lid') ? contactId : undefined,
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
    // Verify session access
    const session = await this.findOne(sessionId, userId, organizationId);

    return this.contactRepository.find({
      where: { sessionId },
      order: { name: 'ASC', phoneNumber: 'ASC' },
    });
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
}
