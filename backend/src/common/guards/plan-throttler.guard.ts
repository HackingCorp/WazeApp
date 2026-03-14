import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerOptions, ThrottlerGetTrackerFunction, ThrottlerGenerateKeyFunction } from '@nestjs/throttler';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Subscription } from '../entities/subscription.entity';

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
    if (request?.user) {
      const planLimit = await this.getPlanLimit(request.user);
      if (planLimit) {
        limit = planLimit;
      }
    }
    return super.handleRequest(context, limit, ttl, throttler, getTracker, generateKey);
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
