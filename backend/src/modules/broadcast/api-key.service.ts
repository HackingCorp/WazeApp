import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyPermission, Subscription } from '../../common/entities';
import { SubscriptionPlan } from '../../common/enums';
import { CreateApiKeyDto } from './dto/broadcast.dto';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);
  private readonly KEY_PREFIX = 'wz_live_';

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
  ) {}

  /**
   * Check if organization can use external API
   */
  async canUseExternalApi(organizationId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    // Only Enterprise plan can use external API
    return subscription?.plan === SubscriptionPlan.ENTERPRISE;
  }

  /**
   * Create a new API key
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
        'External API access requires Enterprise plan',
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
   * Validate API key and return organization info
   */
  async validateApiKey(
    key: string,
    requiredPermission?: ApiKeyPermission,
    clientIp?: string,
  ): Promise<{ organizationId: string; permissions: ApiKeyPermission[] }> {
    if (!key.startsWith(this.KEY_PREFIX)) {
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

    // Update last used
    await this.apiKeyRepository.update(apiKey.id, {
      lastUsedAt: new Date(),
      lastUsedIp: clientIp,
      totalRequests: () => 'total_requests + 1',
    });

    return {
      organizationId: apiKey.organizationId,
      permissions: apiKey.permissions,
    };
  }

  /**
   * Check rate limit for API key
   */
  async checkRateLimit(key: string): Promise<boolean> {
    // In production, this would use Redis to track requests
    // For now, we'll just return true
    return true;
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
