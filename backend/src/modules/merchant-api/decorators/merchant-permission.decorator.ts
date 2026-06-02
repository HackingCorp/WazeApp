import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyPermission } from '@/common/entities/api-key.entity';

export const MERCHANT_PERMISSION_KEY = 'merchant_permission';

/**
 * Decorator to set the required merchant permission for a route.
 * Used by MerchantApiKeyGuard to check API key permissions.
 */
export const RequireMerchantPermission = (permission: ApiKeyPermission) =>
  SetMetadata(MERCHANT_PERMISSION_KEY, permission);

/**
 * Parameter decorator to extract merchant auth info from request.
 * Returns { organizationId, permissions, keyId, keyName }.
 */
export const MerchantAuth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.merchantAuth;
  },
);
