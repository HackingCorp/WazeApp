import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In } from 'typeorm';
import { Subscription, User, Organization } from '../../common/entities';
import { SubscriptionStatus } from '../../common/enums';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { EmailService } from '../email/email.service';

// Thresholds for quota alerts (in percentage)
const QUOTA_ALERT_THRESHOLDS = [50, 75, 90, 100];

interface QuotaAlertRecord {
  organizationId?: string;
  userId?: string;
  threshold: number;
  month: string; // Format: YYYY-MM
}

@Injectable()
export class QuotaAlertService {
  private readonly logger = new Logger(QuotaAlertService.name);

  // TTL for quota alert cache entries (24 hours in milliseconds)
  private readonly ALERT_CACHE_TTL = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private quotaEnforcementService: QuotaEnforcementService,
    private emailService: EmailService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    this.logger.log(`Quota Alert Service initialized for month: ${this.getCurrentMonth()}`);
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getAlertCacheKey(organizationId: string | null, userId: string | null, threshold: number): string {
    const month = this.getCurrentMonth();
    const entityKey = organizationId ? `org:${organizationId}` : `user:${userId}`;
    return `quota-alert:${entityKey}:${threshold}:${month}`;
  }

  private async hasAlertBeenSent(organizationId: string | null, userId: string | null, threshold: number): Promise<boolean> {
    const key = this.getAlertCacheKey(organizationId, userId, threshold);
    const sent = await this.cacheManager.get<boolean>(key);
    return sent === true;
  }

  private async markAlertAsSent(organizationId: string | null, userId: string | null, threshold: number): Promise<void> {
    const key = this.getAlertCacheKey(organizationId, userId, threshold);
    await this.cacheManager.set(key, true, this.ALERT_CACHE_TTL);
  }

  /**
   * Check quotas every hour and send alerts if needed
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkQuotasAndSendAlerts(): Promise<void> {
    this.logger.log('🔍 Starting hourly quota check...');

    try {
      // Check organization quotas
      await this.checkOrganizationQuotas();

      // Check user quotas (users without organization)
      await this.checkUserQuotas();

      this.logger.log('✅ Quota check completed');
    } catch (error) {
      this.logger.error('❌ Error during quota check:', error);
    }
  }

  /**
   * Check quotas for all organizations
   */
  private async checkOrganizationQuotas(): Promise<void> {
    // Get all active subscriptions with organizations
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        organizationId: Not(IsNull()),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
      relations: ['organization'],
    });

    this.logger.log(`Checking quotas for ${subscriptions.length} organizations`);

    for (const subscription of subscriptions) {
      if (!subscription.organizationId) continue;

      try {
        const quota = await this.quotaEnforcementService.checkWhatsAppMessageQuota(
          subscription.organizationId,
        );

        await this.processQuotaAlert(
          subscription.organizationId,
          null,
          quota.percentUsed,
          quota.current,
          quota.limit,
          subscription.plan,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to check quota for org ${subscription.organizationId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Check quotas for users without organization
   */
  private async checkUserQuotas(): Promise<void> {
    // Get all active subscriptions for users (not linked to organizations)
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        userId: Not(IsNull()),
        organizationId: IsNull(),
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    this.logger.log(`Checking quotas for ${subscriptions.length} individual users`);

    for (const subscription of subscriptions) {
      if (!subscription.userId) continue;

      try {
        const quota = await this.quotaEnforcementService.checkUserWhatsAppMessageQuota(
          subscription.userId,
        );

        await this.processQuotaAlert(
          null,
          subscription.userId,
          quota.percentUsed,
          quota.current,
          quota.limit,
          subscription.plan,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to check quota for user ${subscription.userId}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Process quota and send alert if threshold is reached
   */
  private async processQuotaAlert(
    organizationId: string | null,
    userId: string | null,
    percentUsed: number,
    currentUsage: number,
    limit: number,
    planName: string,
  ): Promise<void> {
    // Find the highest threshold that has been crossed
    const crossedThresholds = QUOTA_ALERT_THRESHOLDS.filter(
      (threshold) => percentUsed >= threshold,
    );

    if (crossedThresholds.length === 0) {
      return; // No threshold crossed
    }

    // Get the highest crossed threshold
    const highestThreshold = Math.max(...crossedThresholds);

    // Check if we already sent an alert for this threshold
    if (await this.hasAlertBeenSent(organizationId, userId, highestThreshold)) {
      return; // Already sent
    }

    // Get user email
    let email: string | null = null;
    let firstName: string = 'Utilisateur';

    if (organizationId) {
      // Get organization owner
      const org = await this.organizationRepository.findOne({
        where: { id: organizationId },
        relations: ['owner'],
      });
      if (org?.owner) {
        email = org.owner.email;
        firstName = org.owner.firstName || 'Utilisateur';
      }
    } else if (userId) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (user) {
        email = user.email;
        firstName = user.firstName || 'Utilisateur';
      }
    }

    if (!email) {
      this.logger.warn(
        `No email found for ${organizationId ? 'org' : 'user'} ${organizationId || userId}`,
      );
      return;
    }

    // Send the alert email
    this.logger.log(
      `📧 Sending ${highestThreshold}% quota alert to ${email} (${currentUsage}/${limit} messages)`,
    );

    try {
      await this.emailService.sendQuotaAlertEmail(
        email,
        firstName,
        highestThreshold,
        currentUsage,
        limit,
        this.formatPlanName(planName),
      );

      // Mark all thresholds up to this one as sent
      for (const threshold of crossedThresholds) {
        await this.markAlertAsSent(organizationId, userId, threshold);
      }

      this.logger.log(`✅ Quota alert (${highestThreshold}%) sent to ${email}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send quota alert to ${email}:`, error);
    }
  }

  private formatPlanName(plan: string): string {
    const planNames: Record<string, string> = {
      FREE: 'Gratuit',
      STANDARD: 'Standard',
      PRO: 'Pro',
      ENTERPRISE: 'Enterprise',
    };
    return planNames[plan] || plan;
  }

  /**
   * Manual trigger to check quotas (for testing)
   */
  async triggerQuotaCheck(): Promise<{ checked: number; alertsSent: number }> {
    this.logger.log('Manual quota check triggered');
    await this.checkQuotasAndSendAlerts();

    return {
      checked: 1,
      alertsSent: 0,
    };
  }
}
