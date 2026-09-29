import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions, ThrottlerGetTrackerFunction, ThrottlerGenerateKeyFunction } from '@nestjs/throttler';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Subscription } from '../entities/subscription.entity';

// @Throttle() writes this key (suffixed with the throttler name) on the handler.
// The package does not re-export its constants, hence the literal.
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';

/**
 * Per-plan rate limiter that extends the default ThrottlerGuard.
 * Adjusts rate limits based on the user's subscription plan.
 * Falls back to the default limit if the plan cannot be determined.
 */

const PLAN_RATE_LIMITS: Record<string, number> = {
  free: 100,
  standard: 300,
  pro: 600,
  enterprise: 1200,
};

@Injectable()
export class PlanThrottlerGuard extends ThrottlerGuard {
  @Inject(CACHE_MANAGER)
  private readonly cache: Cache;

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttler: ThrottlerOptions,
    getTracker: ThrottlerGetTrackerFunction,
    generateKey: ThrottlerGenerateKeyFunction,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // A route that declares its own @Throttle() is asking for a deliberate cap
    // (checkout, renewal…). The plan limit is a generous default, so applying it
    // there would silently widen a limit that exists for a reason.
    if (request?.user && !this.hasRouteThrottle(context, throttler.name)) {
      const planLimit = await this.getPlanLimit(request.user);
      if (planLimit) {
        limit = planLimit;
      }
    }
    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
  }

  private hasRouteThrottle(context: ExecutionContext, name = 'default'): boolean {
    const limit = this.reflector.getAllAndOverride<number>(`${THROTTLER_LIMIT}${name}`, [
      context.getHandler(),
      context.getClass(),
    ]);
    return limit !== undefined && limit !== null;
  }

  /**
   * Behind Cloudflare every request reaches us from an edge IP, so the default
   * `req.ip` tracker pools unrelated customers into one bucket — one person's
   * clicks then exhaust another's quota. Count per authenticated user, and fall
   * back to the forwarded client IP for anonymous traffic.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.user?.userId || req?.user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    const forwarded =
      req?.headers?.['cf-connecting-ip'] ||
      String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return String(forwarded || req?.ip || 'unknown');
  }

  private async getPlanLimit(user: any): Promise<number | null> {
    try {
      // Try organization subscription cache first
      const orgId = user.currentOrganizationId;
      if (orgId) {
        const cached = await this.cache.get<Subscription>(`subscription:org:${orgId}`);
        if (cached?.plan) {
          return PLAN_RATE_LIMITS[cached.plan.toLowerCase()] || null;
        }
      }

      // Try user subscription cache
      const userId = user.id || user.userId;
      if (userId) {
        const cached = await this.cache.get<Subscription>(`subscription:user:${userId}`);
        if (cached?.plan) {
          return PLAN_RATE_LIMITS[cached.plan.toLowerCase()] || null;
        }
      }
    } catch {
      // Cache miss or error - use default limit
    }
    return null;
  }
}
