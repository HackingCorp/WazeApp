import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '@/modules/broadcast/api-key.service';
import { ApiKeyPermission } from '@/common/entities/api-key.entity';
import { MERCHANT_PERMISSION_KEY } from '../decorators/merchant-permission.decorator';

@Injectable()
export class MerchantApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(MerchantApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException(
        'API key is required. Please provide X-API-Key header.',
      );
    }

    const requiredPermission = this.reflector.get<ApiKeyPermission>(
      MERCHANT_PERMISSION_KEY,
      context.getHandler(),
    );

    const clientIp =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.ip;

    const keyData = await this.apiKeyService.validateApiKey(
      apiKey,
      requiredPermission,
      clientIp,
      { skipSessionCheck: true },
    );

    // Check rate limit
    const rateLimitResult = await this.apiKeyService.checkRateLimit(
      keyData.keyHash,
      keyData.rateLimitPerMinute,
      keyData.rateLimitPerDay,
    );
    if (!rateLimitResult.allowed) {
      throw new ForbiddenException(rateLimitResult.message);
    }

    // Inject merchant auth info into request
    request.merchantAuth = {
      organizationId: keyData.organizationId,
      permissions: keyData.permissions,
      keyId: keyData.keyId,
      keyName: keyData.keyName,
    };

    this.logger.debug(
      `Merchant API request authenticated: key=${keyData.keyName}, org=${keyData.organizationId}, permission=${requiredPermission}`,
    );

    return true;
  }
}
