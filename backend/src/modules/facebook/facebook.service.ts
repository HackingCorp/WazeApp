import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  FacebookPageSession,
  FacebookContact,
  User,
  Organization,
  AiAgent,
} from "@/common/entities";
import { FacebookPageSessionStatus } from "@/common/entities/facebook-page-session.entity";
import {
  ConnectPageDto,
  UpdatePageSessionDto,
  FacebookPageSessionResponseDto,
} from "./dto/connect-page.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly GRAPH_API_VERSION = "v21.0";
  private readonly GRAPH_API_BASE_URL = `https://graph.facebook.com/${this.GRAPH_API_VERSION}`;

  constructor(
    @InjectRepository(FacebookPageSession)
    private sessionRepository: Repository<FacebookPageSession>,
    @InjectRepository(FacebookContact)
    private contactRepository: Repository<FacebookContact>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    private configService: ConfigService,
    private httpService: HttpService,
    private eventEmitter: EventEmitter2,
    private auditService: AuditService,
  ) {}

  /**
   * Connect a Facebook Page
   */
  async connectPage(
    dto: ConnectPageDto,
    userId: string,
    organizationId?: string,
  ): Promise<FacebookPageSessionResponseDto> {
    this.logger.log(`Connecting Facebook Page for user: ${userId}`);

    try {
      // Verify the page access token and get page details
      const pageDetails = await this.verifyPageToken(dto.pageAccessToken, dto.pageId);

      // Check if page already connected
      const existingSession = await this.sessionRepository.findOne({
        where: { pageId: dto.pageId },
      });

      if (existingSession) {
        throw new BadRequestException("This Facebook Page is already connected");
      }

      // Get long-lived token
      const longLivedToken = await this.exchangeForLongLivedToken(dto.pageAccessToken);

      // Create session
      const session = this.sessionRepository.create({
        name: dto.name,
        pageId: dto.pageId,
        pageName: pageDetails.name,
        pageUsername: pageDetails.username,
        pageAvatarUrl: pageDetails.picture?.data?.url,
        pageAccessToken: longLivedToken.access_token,
        tokenExpiresAt: longLivedToken.expires_at
          ? new Date(longLivedToken.expires_at * 1000)
          : null,
        status: FacebookPageSessionStatus.CONNECTED,
        isActive: true,
        aiResponsesEnabled: dto.aiResponsesEnabled ?? true,
        commentAutoReplyEnabled: dto.commentAutoReplyEnabled ?? true,
        userId,
        organizationId: organizationId || null,
        agentId: dto.agentId || null,
        grantedScopes: pageDetails.granted_scopes || [],
        metadata: {
          followersCount: pageDetails.followers_count,
          likesCount: pageDetails.fan_count,
          category: pageDetails.category,
          connectedAt: new Date(),
        },
      });

      const savedSession = await this.sessionRepository.save(session);

      // Subscribe to webhooks
      await this.subscribeToWebhooks(savedSession);

      // Audit log
      await this.auditService.log({
        userId,
        organizationId: organizationId || null,
        action: "facebook.page.connected",
        resourceType: "facebook_page_session",
        resourceId: savedSession.id,
        metadata: {
          pageId: dto.pageId,
          pageName: pageDetails.name,
        },
      });

      this.eventEmitter.emit("facebook.page.connected", {
        sessionId: savedSession.id,
        pageId: savedSession.pageId,
        userId,
      });

      return this.toResponseDto(savedSession);
    } catch (error) {
      this.logger.error(`Failed to connect Facebook Page: ${error.message}`, error.stack);
      throw new BadRequestException(
        `Failed to connect Facebook Page: ${error.message}`,
      );
    }
  }

  /**
   * Verify page access token and get page details
   */
  private async verifyPageToken(accessToken: string, pageId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.GRAPH_API_BASE_URL}/${pageId}`, {
          params: {
            access_token: accessToken,
            fields: "id,name,username,picture,followers_count,fan_count,category,granted_scopes",
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to verify page token: ${error.message}`);
      throw new BadRequestException("Invalid page access token or page ID");
    }
  }

  /**
   * Exchange short-lived token for long-lived token
   */
  private async exchangeForLongLivedToken(shortLivedToken: string): Promise<any> {
    const appId = this.configService.get("FACEBOOK_APP_ID");
    const appSecret = this.configService.get("FACEBOOK_APP_SECRET");

    if (!appId || !appSecret) {
      this.logger.warn("Facebook App credentials not configured, using short-lived token");
      return { access_token: shortLivedToken };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.GRAPH_API_BASE_URL}/oauth/access_token`, {
          params: {
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedToken,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.warn(`Failed to exchange token: ${error.message}, using short-lived token`);
      return { access_token: shortLivedToken };
    }
  }

  /**
   * Subscribe to page webhooks
   */
  private async subscribeToWebhooks(session: FacebookPageSession): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.GRAPH_API_BASE_URL}/${session.pageId}/subscribed_apps`,
          {},
          {
            params: {
              access_token: session.pageAccessToken,
              subscribed_fields: "feed,mention,messages,message_reactions,conversations",
            },
          },
        ),
      );

      this.logger.log(`Subscribed to webhooks for page: ${session.pageId}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to webhooks: ${error.message}`);
      // Don't throw - webhook subscription is not critical for connection
    }
  }

  /**
   * Get all sessions for a user
   */
  async findAll(
    userId: string,
    organizationId?: string,
  ): Promise<FacebookPageSessionResponseDto[]> {
    const where: any = { userId };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const sessions = await this.sessionRepository.find({
      where,
      relations: ["agent"],
      order: { createdAt: "DESC" },
    });

    return sessions.map((session) => this.toResponseDto(session));
  }

  /**
   * Get session by ID
   */
  async findOne(
    id: string,
    userId: string,
    organizationId?: string,
  ): Promise<FacebookPageSessionResponseDto> {
    const where: any = { id, userId };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const session = await this.sessionRepository.findOne({
      where,
      relations: ["agent"],
    });

    if (!session) {
      throw new NotFoundException("Facebook Page session not found");
    }

    return this.toResponseDto(session);
  }

  /**
   * Update session
   */
  async update(
    id: string,
    dto: UpdatePageSessionDto,
    userId: string,
    organizationId?: string,
  ): Promise<FacebookPageSessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id, userId, ...(organizationId && { organizationId }) },
    });

    if (!session) {
      throw new NotFoundException("Facebook Page session not found");
    }

    // Update fields
    if (dto.name !== undefined) session.name = dto.name;
    if (dto.agentId !== undefined) session.agentId = dto.agentId;
    if (dto.aiResponsesEnabled !== undefined)
      session.aiResponsesEnabled = dto.aiResponsesEnabled;
    if (dto.commentAutoReplyEnabled !== undefined)
      session.commentAutoReplyEnabled = dto.commentAutoReplyEnabled;
    if (dto.autoReconnect !== undefined)
      session.autoReconnect = dto.autoReconnect;

    const updated = await this.sessionRepository.save(session);

    await this.auditService.log({
      userId,
      organizationId: organizationId || null,
      action: "facebook.page.updated",
      resourceType: "facebook_page_session",
      resourceId: id,
      metadata: dto,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Delete session
   */
  async delete(id: string, userId: string, organizationId?: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id, userId, ...(organizationId && { organizationId }) },
    });

    if (!session) {
      throw new NotFoundException("Facebook Page session not found");
    }

    // Unsubscribe from webhooks
    try {
      await this.unsubscribeFromWebhooks(session);
    } catch (error) {
      this.logger.warn(`Failed to unsubscribe from webhooks: ${error.message}`);
    }

    await this.sessionRepository.remove(session);

    await this.auditService.log({
      userId,
      organizationId: organizationId || null,
      action: "facebook.page.disconnected",
      resourceType: "facebook_page_session",
      resourceId: id,
      metadata: { pageId: session.pageId },
    });

    this.eventEmitter.emit("facebook.page.disconnected", {
      sessionId: id,
      pageId: session.pageId,
      userId,
    });
  }

  /**
   * Unsubscribe from page webhooks
   */
  private async unsubscribeFromWebhooks(session: FacebookPageSession): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.GRAPH_API_BASE_URL}/${session.pageId}/subscribed_apps`,
          {
            params: {
              access_token: session.pageAccessToken,
            },
          },
        ),
      );

      this.logger.log(`Unsubscribed from webhooks for page: ${session.pageId}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from webhooks: ${error.message}`);
    }
  }

  /**
   * Reply to a comment
   */
  async replyToComment(
    commentId: string,
    message: string,
    session: FacebookPageSession,
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.GRAPH_API_BASE_URL}/${commentId}/comments`,
          { message },
          {
            params: {
              access_token: session.pageAccessToken,
            },
          },
        ),
      );

      this.logger.log(`Replied to comment ${commentId} on page ${session.pageId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to reply to comment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get or create Facebook contact
   */
  async getOrCreateContact(
    facebookUserId: string,
    name: string,
    sessionId: string,
    organizationId: string,
  ): Promise<FacebookContact> {
    let contact = await this.contactRepository.findOne({
      where: { facebookUserId, sessionId },
    });

    if (!contact) {
      contact = this.contactRepository.create({
        facebookUserId,
        name,
        sessionId,
        organizationId,
        lastSeenAt: new Date(),
      });

      contact = await this.contactRepository.save(contact);
      this.logger.log(`Created new Facebook contact: ${facebookUserId}`);
    } else {
      // Update last seen
      contact.lastSeenAt = new Date();
      if (name && name !== contact.name) {
        contact.name = name;
      }
      await this.contactRepository.save(contact);
    }

    return contact;
  }

  /**
   * Convert to response DTO
   */
  private toResponseDto(session: FacebookPageSession): FacebookPageSessionResponseDto {
    return {
      id: session.id,
      name: session.name,
      pageId: session.pageId,
      pageName: session.pageName,
      pageUsername: session.pageUsername,
      pageAvatarUrl: session.pageAvatarUrl,
      status: session.status,
      isActive: session.isActive,
      aiResponsesEnabled: session.aiResponsesEnabled,
      commentAutoReplyEnabled: session.commentAutoReplyEnabled,
      isConnected: session.isConnected,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
