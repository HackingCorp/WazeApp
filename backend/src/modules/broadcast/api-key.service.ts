import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { ApiKey, ApiKeyPermission, Subscription, WhatsAppSession } from '../../common/entities';
import { SubscriptionPlan } from '../../common/enums';
import { CreateApiKeyDto } from './dto/broadcast.dto';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly KEY_PREFIX = 'wz_live_';
  private readonly LEGACY_KEY_PREFIXES = ['waze_sk_', 'wz_live_'];
  private readonly redis: Redis;

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  /**
   * Check if organization can use external API
   */
  async canUseExternalApi(organizationId: string): Promise<boolean> {
    this.logger.debug(`Checking API access for organization: ${organizationId}`);

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });

    // Check if subscription is active and has apiAccess feature
    if (!subscription) {
      this.logger.debug('No subscription found');
      return false;
    }

    this.logger.debug(`Subscription found: plan=${subscription.plan}, status=${subscription.status}`);

    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    if (!isActive) {
      this.logger.debug(`Subscription not active: ${subscription.status}`);
      return false;
    }

    // Pro and Enterprise plans can use external API
    // Compare with lowercase since enum values are lowercase
    const planLower = subscription.plan?.toLowerCase();
    const hasApiAccessPlan = planLower === 'pro' || planLower === 'enterprise';
    const hasApiAccessFeature = subscription.features?.apiAccess === true;

    this.logger.debug(`Plan check: plan=${subscription.plan}, planLower=${planLower}, hasApiAccessPlan=${hasApiAccessPlan}, hasApiAccessFeature=${hasApiAccessFeature}`);

    return hasApiAccessPlan || hasApiAccessFeature;
  }

  /**
   * Create a new API key
   * Each API key is linked to exactly ONE WhatsApp session
   */
  async createApiKey(
    organizationId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ apiKey: ApiKey; key: string }> {
    // Check if organization can use external API
    const canUse = await this.canUseExternalApi(organizationId);
    if (!canUse) {
      throw new ForbiddenException(
        'External API access requires Pro or Enterprise plan',
      );
    }

    // SessionId is required for new API keys
    if (!dto.sessionId) {
      throw new BadRequestException(
        'sessionId is required when creating a new API key',
      );
    }

    // Verify the session exists and belongs to this organization
    const session = await this.sessionRepository.findOne({
      where: { id: dto.sessionId, organizationId },
    });
    if (!session) {
      throw new BadRequestException(
        'Session not found or does not belong to this organization',
      );
    }

    // Validate permissions
    const validPermissions = Object.values(ApiKeyPermission);
    for (const permission of dto.permissions) {
      if (!validPermissions.includes(permission as ApiKeyPermission)) {
        throw new BadRequestException(`Invalid permission: ${permission}`);
      }
    }

    // Generate API key
    const rawKey = this.generateApiKey();
    const fullKey = this.KEY_PREFIX + rawKey;
    const keyHash = this.hashKey(fullKey);

    const apiKey = this.apiKeyRepository.create({
      organizationId,
      sessionId: dto.sessionId,
      name: dto.name,
      description: dto.description,
      keyHash,
      keyPrefix: this.KEY_PREFIX,
      permissions: dto.permissions as ApiKeyPermission[],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      allowedIps: dto.allowedIps,
      rateLimitPerMinute: dto.rateLimitPerMinute || 60,
      createdBy: userId,
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    // Return the full key only once (it won't be stored)
    return {
      apiKey: saved,
      key: fullKey,
    };
  }

  /**
   * Get all API keys for organization
   */
  async getApiKeys(organizationId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get API key by ID
   */
  async getApiKey(organizationId: string, keyId: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, organizationId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  /**
   * Update API key
   */
  async updateApiKey(
    organizationId: string,
    keyId: string,
    updates: Partial<CreateApiKeyDto>,
  ): Promise<ApiKey> {
    const apiKey = await this.getApiKey(organizationId, keyId);

    // Update sessionId if provided
    if (updates.sessionId) {
      // Verify the session exists and belongs to this organization
      const session = await this.sessionRepository.findOne({
        where: { id: updates.sessionId, organizationId },
      });
      if (!session) {
        throw new BadRequestException(
          'Session not found or does not belong to this organization',
        );
      }
      apiKey.sessionId = updates.sessionId;
    }

    if (updates.permissions) {
      const validPermissions = Object.values(ApiKeyPermission);
      for (const permission of updates.permissions) {
        if (!validPermissions.includes(permission as ApiKeyPermission)) {
          throw new BadRequestException(`Invalid permission: ${permission}`);
        }
      }
      apiKey.permissions = updates.permissions as ApiKeyPermission[];
    }

    if (updates.name) apiKey.name = updates.name;
    if (updates.description !== undefined) apiKey.description = updates.description;
    if (updates.allowedIps !== undefined) apiKey.allowedIps = updates.allowedIps;
    if (updates.rateLimitPerMinute) apiKey.rateLimitPerMinute = updates.rateLimitPerMinute;
    if (updates.expiresAt) apiKey.expiresAt = new Date(updates.expiresAt);

    return this.apiKeyRepository.save(apiKey);
  }

  /**
   * Delete API key
   */
  async deleteApiKey(organizationId: string, keyId: string): Promise<void> {
    const apiKey = await this.getApiKey(organizationId, keyId);
    await this.apiKeyRepository.remove(apiKey);
  }

  /**
   * Toggle API key active status
   */
  async toggleApiKey(
    organizationId: string,
    keyId: string,
    isActive: boolean,
  ): Promise<ApiKey> {
    const apiKey = await this.getApiKey(organizationId, keyId);
    apiKey.isActive = isActive;
    return this.apiKeyRepository.save(apiKey);
  }

  /**
   * Validate API key and return organization/session info
   * Each API key is linked to exactly ONE WhatsApp session
   */
  async validateApiKey(
    key: string,
    requiredPermission?: ApiKeyPermission,
    clientIp?: string,
  ): Promise<{ organizationId: string; sessionId: string; permissions: ApiKeyPermission[]; keyId: string; keyName: string; keyHash: string; rateLimitPerMinute: number; rateLimitPerDay: number }> {
    if (!key) {
      throw new UnauthorizedException('API key is required. Please provide X-API-Key header.');
    }

    // Accept both legacy (waze_sk_) and new (wz_live_) key formats
    const hasValidPrefix = this.LEGACY_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
    if (!hasValidPrefix) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const keyHash = this.hashKey(key);

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!apiKey.isActive) {
      throw new UnauthorizedException('API key is disabled');
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Check IP whitelist
    if (apiKey.allowedIps && apiKey.allowedIps.length > 0 && clientIp) {
      if (!apiKey.allowedIps.includes(clientIp)) {
        throw new UnauthorizedException('IP address not allowed');
      }
    }

    // Check permission
    if (requiredPermission && !apiKey.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `API key does not have permission: ${requiredPermission}`,
      );
    }

    // IMPORTANT: Verify subscription still allows API access
    const canUse = await this.canUseExternalApi(apiKey.organizationId);
    if (!canUse) {
      throw new ForbiddenException(
        'External API access requires Pro or Enterprise plan. Please upgrade your subscription.',
      );
    }

    // Check if API key has a session assigned
    if (!apiKey.sessionId) {
      throw new ForbiddenException(
        'This API key has no WhatsApp session assigned. Please update the API key to assign a session before using it.',
      );
    }

    // Update last used
    await this.apiKeyRepository.update(apiKey.id, {
      lastUsedAt: new Date(),
      lastUsedIp: clientIp,
      totalRequests: () => 'total_requests + 1',
    });

    return {
      organizationId: apiKey.organizationId,
      sessionId: apiKey.sessionId,
      permissions: apiKey.permissions,
      keyId: apiKey.id,
      keyName: apiKey.name,
      keyHash,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      rateLimitPerDay: apiKey.rateLimitPerDay,
    };
  }

  /**
   * Validate that the API key has access to the requested session
   */
  validateSessionAccess(apiKeySessionId: string, requestedSessionId: string): void {
    if (apiKeySessionId !== requestedSessionId) {
      throw new ForbiddenException(
        'This API key does not have access to the requested session. Each API key is linked to a specific WhatsApp session.',
      );
    }
  }

  /**
   * Check rate limit for API key using Redis sliding window counters.
   * Throws ForbiddenException-like info or returns void on success.
   * Returns { allowed: true } or { allowed: false, retryAfter, message }.
   */
  async checkRateLimit(keyHash: string, rateLimitPerMinute: number, rateLimitPerDay: number): Promise<{ allowed: boolean; retryAfter?: number; message?: string }> {
    const minuteKey = `ratelimit:apikey:${keyHash}:min`;
    const dayKey = `ratelimit:apikey:${keyHash}:day`;

    try {
      // Check per-minute rate limit
      const minuteCount = await this.redis.incr(minuteKey);
      if (minuteCount === 1) {
        await this.redis.expire(minuteKey, 60);
      }

      if (minuteCount > rateLimitPerMinute) {
        const minuteTtl = await this.redis.ttl(minuteKey);
        return {
          allowed: false,
          retryAfter: minuteTtl > 0 ? minuteTtl : 60,
          message: `Per-minute rate limit exceeded (${rateLimitPerMinute}/min). Try again in ${minuteTtl > 0 ? minuteTtl : 60}s.`,
        };
      }

      // Check per-day rate limit
      const dayCount = await this.redis.incr(dayKey);
      if (dayCount === 1) {
        await this.redis.expire(dayKey, 86400);
      }

      if (dayCount > rateLimitPerDay) {
        // Rollback the minute counter since the request is denied
        await this.redis.decr(minuteKey);
        const dayTtl = await this.redis.ttl(dayKey);
        return {
          allowed: false,
          retryAfter: dayTtl > 0 ? dayTtl : 86400,
          message: `Daily rate limit exceeded (${rateLimitPerDay}/day). Try again in ${dayTtl > 0 ? Math.ceil(dayTtl / 60) : 1440} minutes.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      // If Redis is unavailable, log the error but allow the request
      this.logger.error(`Rate limit check failed: ${error.message}`);
      return { allowed: true };
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private generateApiKey(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}
