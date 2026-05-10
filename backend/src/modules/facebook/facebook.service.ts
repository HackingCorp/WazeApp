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
import { AuditAction } from "@/common/enums";
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
      // Step 1: Get a permanent page access token
      const pageData = await this.resolvePageToken(dto.pageAccessToken, dto.pageId);

      this.logger.log(`Resolved page: ${pageData.pageName} (${pageData.pageId})`);

      // Check if page already connected
      const existingSession = await this.sessionRepository.findOne({
        where: { pageId: pageData.pageId },
      });

      if (existingSession) {
        throw new BadRequestException("This Facebook Page is already connected");
      }

      // Step 2: Get full page details using the permanent token
      const pageDetails = await this.getPageDetails(pageData.pageAccessToken, pageData.pageId);

      // Create session
      const session = new FacebookPageSession();
      session.name = dto.name || pageData.pageName || `Facebook Page ${pageData.pageId}`;
      session.pageId = pageData.pageId;
      session.pageName = pageData.pageName || pageDetails.name;
      session.pageUsername = pageDetails.username;
      session.pageAvatarUrl = pageDetails.picture?.data?.url;
      session.pageAccessToken = pageData.pageAccessToken;
      session.tokenExpiresAt = pageData.tokenExpiresAt;
      session.status = FacebookPageSessionStatus.CONNECTED;
      session.isActive = true;
      session.aiResponsesEnabled = dto.aiResponsesEnabled ?? dto.autoReplyEnabled ?? true;
      session.commentAutoReplyEnabled = dto.commentAutoReplyEnabled ?? dto.autoReplyEnabled ?? true;
      session.userId = userId;
      session.organizationId = organizationId || null;
      session.agentId = dto.agentId || null;
      session.grantedScopes = pageDetails.granted_scopes || [];
      session.config = {
        replyDelay: dto.replyDelay ?? 30,
        keywordsFilter: dto.keywordsFilter || [],
        replyToAllComments: true,
      };
      session.metadata = {
        followersCount: pageDetails.followers_count,
        likesCount: pageDetails.fan_count,
        category: pageDetails.category,
        tokenType: pageData.tokenType,
        connectedAt: new Date(),
      };

      const savedSession = await this.sessionRepository.save(session);

      // Subscribe to webhooks
      await this.subscribeToWebhooks(savedSession);

      // Audit log
      await this.auditService.log({
        userId,
        organizationId: organizationId || null,
        action: AuditAction.CREATE,
        resourceType: "facebook_page_session",
        resourceId: savedSession.id,
        description: `Connected Facebook Page: ${pageData.pageName} (${pageData.pageId})`,
        metadata: {
          pageId: pageData.pageId,
          pageName: pageData.pageName,
          tokenType: pageData.tokenType,
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
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Failed to connect Facebook Page: ${error.message}`,
      );
    }
  }

  /**
   * Resolve the provided token into a permanent Page Access Token.
   * Flow:
   *   1. Exchange short-lived user token → long-lived user token
   *   2. Call /me/accounts → get permanent page access tokens
   *   3. Return the matching page token (or first page if no pageId specified)
   *
   * If /me/accounts fails (token is already a page token), fall back to using it directly.
   */
  private async resolvePageToken(
    inputToken: string,
    requestedPageId?: string,
  ): Promise<{
    pageAccessToken: string;
    pageId: string;
    pageName: string;
    tokenExpiresAt: Date | null;
    tokenType: string;
  }> {
    const appId = this.configService.get("FACEBOOK_APP_ID");
    const appSecret = this.configService.get("FACEBOOK_APP_SECRET");

    // Step 1: Try to exchange for long-lived user token
    let longLivedUserToken = inputToken;
    let exchanged = false;

    if (appId && appSecret) {
      try {
        const exchangeResponse = await firstValueFrom(
          this.httpService.get(`${this.GRAPH_API_BASE_URL}/oauth/access_token`, {
            params: {
              grant_type: "fb_exchange_token",
              client_id: appId,
              client_secret: appSecret,
              fb_exchange_token: inputToken,
            },
          }),
        );
        longLivedUserToken = exchangeResponse.data.access_token;
        exchanged = true;
        this.logger.log("Successfully exchanged for long-lived user token");
      } catch (error) {
        this.logger.warn(`Token exchange failed (${error.message}), trying as page token`);
      }
    } else {
      this.logger.warn("FACEBOOK_APP_ID/FACEBOOK_APP_SECRET not configured, cannot exchange tokens");
    }

    // Step 2: Call /me/accounts to get permanent page access tokens
    try {
      const accountsResponse = await firstValueFrom(
        this.httpService.get(`${this.GRAPH_API_BASE_URL}/me/accounts`, {
          params: {
            access_token: longLivedUserToken,
            fields: "id,name,access_token",
          },
        }),
      );

      const pages = accountsResponse.data?.data || [];

      if (pages.length === 0) {
        throw new BadRequestException("No Facebook Pages found for this account. Make sure you have admin access to at least one page.");
      }

      // Find the requested page or use the first one
      let selectedPage: any;
      if (requestedPageId) {
        selectedPage = pages.find((p: any) => p.id === requestedPageId);
        if (!selectedPage) {
          const availablePages = pages.map((p: any) => `${p.name} (${p.id})`).join(", ");
          throw new BadRequestException(
            `Page ${requestedPageId} not found. Available pages: ${availablePages}`,
          );
        }
      } else {
        selectedPage = pages[0];
        if (pages.length > 1) {
          this.logger.log(`Multiple pages found, using first: ${selectedPage.name} (${selectedPage.id})`);
        }
      }

      // Page tokens obtained via /me/accounts with a long-lived user token are permanent
      this.logger.log(`Obtained permanent page token for: ${selectedPage.name} (${selectedPage.id})`);

      return {
        pageAccessToken: selectedPage.access_token,
        pageId: selectedPage.id,
        pageName: selectedPage.name,
        tokenExpiresAt: null, // Permanent token — never expires
        tokenType: exchanged ? "permanent" : "long-lived",
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      // /me/accounts failed — the token might already be a page token
      this.logger.warn(`/me/accounts failed (${error.message}), trying token as direct page token`);

      // Try to use the token directly to get page info
      return this.resolveDirectPageToken(longLivedUserToken, requestedPageId);
    }
  }

  /**
   * Fallback: treat the token as a direct Page Access Token
   */
  private async resolveDirectPageToken(
    token: string,
    requestedPageId?: string,
  ): Promise<{
    pageAccessToken: string;
    pageId: string;
    pageName: string;
    tokenExpiresAt: Date | null;
    tokenType: string;
  }> {
    try {
      // Try /me to get the page identity
      const meResponse = await firstValueFrom(
        this.httpService.get(`${this.GRAPH_API_BASE_URL}/me`, {
          params: {
            access_token: token,
            fields: "id,name",
          },
        }),
      );

      const pageId = meResponse.data.id;
      const pageName = meResponse.data.name;

      if (requestedPageId && pageId !== requestedPageId) {
        throw new BadRequestException(
          `Token belongs to page ${pageName} (${pageId}), not ${requestedPageId}`,
        );
      }

      // Check token expiry via debug_token
      let tokenExpiresAt: Date | null = null;
      try {
        const appId = this.configService.get("FACEBOOK_APP_ID");
        const appSecret = this.configService.get("FACEBOOK_APP_SECRET");
        if (appId && appSecret) {
          const debugResponse = await firstValueFrom(
            this.httpService.get(`${this.GRAPH_API_BASE_URL}/debug_token`, {
              params: {
                input_token: token,
                access_token: `${appId}|${appSecret}`,
              },
            }),
          );
          const expiresAt = debugResponse.data?.data?.expires_at;
          if (expiresAt && expiresAt > 0) {
            tokenExpiresAt = new Date(expiresAt * 1000);
            this.logger.warn(`Page token expires at: ${tokenExpiresAt.toISOString()}`);
          } else {
            this.logger.log("Page token does not expire (permanent)");
          }
        }
      } catch {
        // debug_token failed, ignore
      }

      return {
        pageAccessToken: token,
        pageId,
        pageName,
        tokenExpiresAt,
        tokenType: tokenExpiresAt ? "short-lived" : "unknown",
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Failed to resolve page token: ${error.message}`);
      throw new BadRequestException("Invalid access token. Please provide a valid User Access Token from Graph API Explorer.");
    }
  }

  /**
   * Get page details using a page access token
   */
  private async getPageDetails(accessToken: string, pageId: string): Promise<any> {
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
      this.logger.warn(`Failed to get page details: ${error.message}`);
      return {};
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
    if (dto.autoReplyEnabled !== undefined) {
      session.commentAutoReplyEnabled = dto.autoReplyEnabled;
      session.aiResponsesEnabled = dto.autoReplyEnabled;
    }
    if (dto.autoReconnect !== undefined)
      session.autoReconnect = dto.autoReconnect;

    const updated = await this.sessionRepository.save(session);

    await this.auditService.log({
      userId,
      organizationId: organizationId || null,
      action: AuditAction.UPDATE,
      resourceType: "facebook_page_session",
      resourceId: id,
      description: `Updated Facebook Page session: ${session.pageName || id}`,
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
      action: AuditAction.DELETE,
      resourceType: "facebook_page_session",
      resourceId: id,
      description: `Disconnected Facebook Page: ${session.pageName || session.pageId}`,
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
