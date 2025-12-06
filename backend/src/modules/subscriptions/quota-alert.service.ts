import { Injectable, Logger } from '@nestjs/common';
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

  // In-memory cache of sent alerts (in production, use Redis or database)
  private sentAlerts: Map<string, Set<number>> = new Map();

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private quotaEnforcementService: QuotaEnforcementService,
    private emailService: EmailService,
  ) {
    // Clear sent alerts at the start of each month
    this.initializeMonthlyReset();
  }

  private initializeMonthlyReset() {
    const now = new Date();
    const currentMonth = this.getCurrentMonth();

    // Check if we need to reset (first run or new month)
    this.logger.log(`Quota Alert Service initialized for month: ${currentMonth}`);
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getAlertKey(organizationId: string | null, userId: string | null): string {
    const month = this.getCurrentMonth();
    if (organizationId) {
      return `org:${organizationId}:${month}`;
    }
    return `user:${userId}:${month}`;
  }

  private hasAlertBeenSent(key: string, threshold: number): boolean {
    const alerts = this.sentAlerts.get(key);
    return alerts?.has(threshold) || false;
  }

  private markAlertAsSent(key: string, threshold: number): void {
    if (!this.sentAlerts.has(key)) {
      this.sentAlerts.set(key, new Set());
    }
    this.sentAlerts.get(key)!.add(threshold);
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
    const alertKey = this.getAlertKey(organizationId, userId);

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
    if (this.hasAlertBeenSent(alertKey, highestThreshold)) {
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
        this.markAlertAsSent(alertKey, threshold);
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

    const beforeAlerts = this.countTotalAlerts();
    await this.checkQuotasAndSendAlerts();
    const afterAlerts = this.countTotalAlerts();

    return {
      checked: 1,
      alertsSent: afterAlerts - beforeAlerts,
    };
  }

  private countTotalAlerts(): number {
    let total = 0;
    this.sentAlerts.forEach((thresholds) => {
      total += thresholds.size;
    });
    return total;
  }

  /**
   * Reset alerts for a new month
   */
  @Cron('0 0 1 * *') // First day of each month at midnight
  resetMonthlyAlerts(): void {
    this.logger.log('🔄 Resetting monthly quota alerts');
    this.sentAlerts.clear();
  }
}
