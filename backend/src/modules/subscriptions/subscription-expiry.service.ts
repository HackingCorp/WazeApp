import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Subscription, Invoice, InvoiceStatus, User, OrganizationMember } from '../../common/entities';
import { SubscriptionStatus, SubscriptionPlan, UserRole } from '../../common/enums';
import { PlanService } from './plan.service';
import { EmailService } from '../email/email.service';

/**
 * Grace period in days before a PAST_DUE subscription is downgraded to FREE.
 * During this period, the user receives daily reminders but keeps their plan features.
 */
const GRACE_PERIOD_DAYS = 14;

@Injectable()
export class SubscriptionExpiryService {
  private readonly logger = new Logger(SubscriptionExpiryService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
    private readonly planService: PlanService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Cron 1: Check for expired subscriptions and mark them PAST_DUE.
   *
   * Runs daily at 1AM. Finds ACTIVE paid subscriptions where:
   * - nextBillingDate has passed
   * - No PAID invoice exists for the current billing period
   * - Not managed by Stripe (Stripe handles this natively)
   *
   * These subscriptions are transitioned to PAST_DUE status and
   * the user receives an email notification.
   */
  @Cron('0 1 * * *') // Every day at 1:00 AM
  async checkExpiredSubscriptions(): Promise<void> {
    const now = new Date();
    this.logger.log('Checking for expired subscriptions...');

    // Find ACTIVE subscriptions where nextBillingDate has passed
    const expiredSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: LessThanOrEqual(now),
        plan: Not(SubscriptionPlan.FREE),
      },
    });

    let markedCount = 0;

    for (const subscription of expiredSubscriptions) {
      // Skip Stripe-managed subscriptions
      if (subscription.stripeSubscriptionId) continue;

      // Check if there's a paid invoice covering the current period
      const hasPaidInvoice = await this.hasPaidInvoiceForCurrentPeriod(subscription);
      if (hasPaidInvoice) continue;

      // Transition to PAST_DUE
      subscription.status = SubscriptionStatus.PAST_DUE;
      subscription.metadata = {
        ...subscription.metadata,
        pastDueSince: now.toISOString(),
        previousPlan: subscription.plan,
      };

      await this.subscriptionRepository.save(subscription);
      markedCount++;

      // Send notification email
      await this.sendPastDueNotification(subscription);

      this.logger.warn(
        `Subscription ${subscription.id} (${subscription.plan}) marked as PAST_DUE ` +
        `(nextBillingDate: ${subscription.nextBillingDate?.toISOString()})`,
      );
    }

    if (markedCount > 0) {
      this.logger.log(`Marked ${markedCount} subscription(s) as PAST_DUE`);
    }
  }

  /**
   * Cron 2: Downgrade PAST_DUE subscriptions to FREE after grace period.
   *
   * Runs daily at 2AM. Finds PAST_DUE subscriptions where:
   * - pastDueSince is older than GRACE_PERIOD_DAYS (14 days)
   * - No payment was received during the grace period
   * - Not managed by Stripe
   *
   * These subscriptions are downgraded to the FREE plan with
   * FREE limits and features. The user receives a final notification.
   */
  @Cron('0 2 * * *') // Every day at 2:00 AM
  async downgradeUnpaidSubscriptions(): Promise<void> {
    const now = new Date();
    this.logger.log('Checking for PAST_DUE subscriptions to downgrade...');

    const pastDueSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        plan: Not(SubscriptionPlan.FREE),
      },
    });

    let downgradedCount = 0;

    for (const subscription of pastDueSubscriptions) {
      // Skip Stripe-managed
      if (subscription.stripeSubscriptionId) continue;

      // Check how long it's been PAST_DUE
      const pastDueSince = subscription.metadata?.pastDueSince
        ? new Date(subscription.metadata.pastDueSince)
        : subscription.nextBillingDate || now;

      const daysPastDue = Math.floor(
        (now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysPastDue < GRACE_PERIOD_DAYS) continue;

      // Check one last time if payment was made
      const hasPaidInvoice = await this.hasPaidInvoiceForCurrentPeriod(subscription);
      if (hasPaidInvoice) {
        // Payment was made during grace period - reactivate
        subscription.status = SubscriptionStatus.ACTIVE;
        delete subscription.metadata?.pastDueSince;
        await this.subscriptionRepository.save(subscription);
        this.logger.log(`Subscription ${subscription.id} reactivated - payment found during grace period`);
        continue;
      }

      // Downgrade to FREE
      const previousPlan = subscription.plan;
      subscription.status = SubscriptionStatus.INACTIVE;
      subscription.plan = SubscriptionPlan.FREE;
      subscription.limits = this.planService.getPlanLimits('free');
      subscription.features = this.planService.getPlanFeatures('free');
      subscription.metadata = {
        ...subscription.metadata,
        downgradedAt: now.toISOString(),
        downgradedFrom: previousPlan,
        reason: 'unpaid_after_grace_period',
        gracePeriodDays: GRACE_PERIOD_DAYS,
      };

      await this.subscriptionRepository.save(subscription);
      downgradedCount++;

      // Send downgrade notification
      await this.sendDowngradeNotification(subscription, previousPlan);

      this.logger.warn(
        `Subscription ${subscription.id} downgraded from ${previousPlan} to FREE ` +
        `(${daysPastDue} days past due, grace period: ${GRACE_PERIOD_DAYS} days)`,
      );
    }

    if (downgradedCount > 0) {
      this.logger.log(`Downgraded ${downgradedCount} unpaid subscription(s) to FREE`);
    }
  }

  /**
   * Check if there's a PAID invoice covering the subscription's current billing period.
   */
  private async hasPaidInvoiceForCurrentPeriod(subscription: Subscription): Promise<boolean> {
    if (!subscription.nextBillingDate) return false;

    // Look for a paid invoice with periodStart around the nextBillingDate
    // (the renewal invoice's periodStart is typically the day after the current period ends)
    const searchStart = new Date(subscription.nextBillingDate);
    searchStart.setDate(searchStart.getDate() - 5);
    const searchEnd = new Date(subscription.nextBillingDate);
    searchEnd.setDate(searchEnd.getDate() + 5);

    const paidInvoice = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.subscriptionId = :subscriptionId', { subscriptionId: subscription.id })
      .andWhere('invoice.status = :status', { status: InvoiceStatus.PAID })
      .andWhere('invoice.periodStart >= :searchStart', { searchStart })
      .andWhere('invoice.periodStart <= :searchEnd', { searchEnd })
      .getOne();

    return !!paidInvoice;
  }

  /**
   * Send PAST_DUE notification email to organization admins.
   */
  private async sendPastDueNotification(subscription: Subscription): Promise<void> {
    const recipients = await this.getSubscriptionRecipients(subscription);

    for (const user of recipients) {
      try {
        await this.emailService.sendSubscriptionPastDueEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
          {
            planName: subscription.plan,
            gracePeriodDays: GRACE_PERIOD_DAYS,
            nextBillingDate: subscription.nextBillingDate,
          },
        );
      } catch (error) {
        this.logger.error(`Failed to send past-due email for subscription ${subscription.id}: ${error.message}`);
      }
    }
  }

  /**
   * Send downgrade notification email to organization admins.
   */
  private async sendDowngradeNotification(subscription: Subscription, previousPlan: string): Promise<void> {
    const recipients = await this.getSubscriptionRecipients(subscription);

    for (const user of recipients) {
      try {
        await this.emailService.sendSubscriptionDowngradedEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
          {
            previousPlan,
            gracePeriodDays: GRACE_PERIOD_DAYS,
          },
        );
      } catch (error) {
        this.logger.error(`Failed to send downgrade email for subscription ${subscription.id}: ${error.message}`);
      }
    }
  }

  /**
   * Get email recipients for a subscription (user or org admins).
   */
  private async getSubscriptionRecipients(subscription: Subscription): Promise<User[]> {
    if (subscription.userId) {
      const user = await this.userRepository.findOne({ where: { id: subscription.userId } });
      return user ? [user] : [];
    }

    if (subscription.organizationId) {
      const adminMembers = await this.memberRepository.find({
        where: {
          organizationId: subscription.organizationId,
          role: In([UserRole.OWNER, UserRole.ADMIN]),
          isActive: true,
        },
        relations: ['user'],
      });

      return adminMembers.filter(m => m.user?.email).map(m => m.user);
    }

    return [];
  }
}
