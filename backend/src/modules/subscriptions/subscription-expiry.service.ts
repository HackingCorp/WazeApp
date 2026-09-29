import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between, In, Not } from 'typeorm';
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

/** Days before the billing date at which a renewal reminder goes out (descending). */
const RENEWAL_REMINDER_DAYS = [7, 3, 1];

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

      // Skip if the same org/user already has another ACTIVE subscription (means this is a stale record)
      const ownerId = subscription.organizationId || subscription.userId;
      if (ownerId && await this.hasOtherActiveSubscription(subscription.id, ownerId, !!subscription.organizationId)) {
        this.logger.log(`Skipping expired subscription ${subscription.id} — org/user has another ACTIVE subscription. Cleaning up.`);
        subscription.status = SubscriptionStatus.CANCELLED;
        subscription.metadata = { ...subscription.metadata, cancelledReason: 'stale_duplicate_cleaned' };
        await this.subscriptionRepository.save(subscription);
        continue;
      }

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
   * Cron 0: Remind before the billing date, at J-7, J-3 and J-1.
   *
   * Runs daily at 9AM. Renewal is a manual payment (Mobile Money or card
   * through Nkap Pay), so without this the first thing a customer hears is
   * the past-due notice. Each step is recorded on the subscription so a day
   * the cron runs twice, or a restart, does not resend it.
   */
  @Cron('0 9 * * *')
  async sendRenewalReminders(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + RENEWAL_REMINDER_DAYS[0] + 1);

    const upcoming = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: Not(SubscriptionPlan.FREE),
        nextBillingDate: Between(now, horizon),
      },
    });

    let sent = 0;
    for (const subscription of upcoming) {
      if (!subscription.nextBillingDate) continue;

      const daysLeft = Math.ceil(
        (subscription.nextBillingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      // The step is the smallest threshold still ahead: 6 days left is the
      // J-7 mail, 2 days left the J-3 one. Once a step is stamped it is never
      // resent, so the next mail waits for the next threshold.
      const step = [...RENEWAL_REMINDER_DAYS].reverse().find((d) => daysLeft <= d);
      if (!step) continue;

      const periodKey = subscription.nextBillingDate.toISOString().slice(0, 10);
      const already: Record<string, string> = subscription.metadata?.renewalReminders || {};
      const stampKey = `${periodKey}:J-${step}`;
      if (already[stampKey]) continue;

      if (await this.hasPaidInvoiceForCurrentPeriod(subscription)) continue;

      const recipients = await this.getSubscriptionRecipients(subscription);
      for (const user of recipients) {
        try {
          await this.emailService.sendSubscriptionRenewalReminderEmail(
            user.email,
            user.firstName || user.email.split('@')[0],
            {
              planName: subscription.plan,
              nextBillingDate: subscription.nextBillingDate,
              daysLeft: Math.max(1, daysLeft),
            },
          );
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send renewal reminder for subscription ${subscription.id}: ${error.message}`);
        }
      }

      subscription.metadata = {
        ...subscription.metadata,
        renewalReminders: { ...already, [stampKey]: now.toISOString() },
      };
      await this.subscriptionRepository.save(subscription);
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} renewal reminder(s)`);
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

      // Skip if the same org/user already has another ACTIVE subscription (payment was made, this is stale)
      const ownerId = subscription.organizationId || subscription.userId;
      if (ownerId && await this.hasOtherActiveSubscription(subscription.id, ownerId, !!subscription.organizationId)) {
        this.logger.log(`Skipping PAST_DUE subscription ${subscription.id} — org/user has an ACTIVE subscription. Cleaning up.`);
        subscription.status = SubscriptionStatus.CANCELLED;
        subscription.metadata = { ...subscription.metadata, cancelledReason: 'stale_duplicate_cleaned' };
        await this.subscriptionRepository.save(subscription);
        continue;
      }

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
        if (subscription.metadata) {
          delete subscription.metadata.pastDueSince;
        }
        await this.subscriptionRepository.save(subscription);
        this.logger.log(`Subscription ${subscription.id} reactivated - payment found during grace period`);
        continue;
      }

      // Deactivate subscription (keep original plan name for display)
      const previousPlan = subscription.plan;
      subscription.status = SubscriptionStatus.INACTIVE;
      // Do NOT change plan to FREE - keep original plan so user sees what they had
      subscription.metadata = {
        ...subscription.metadata,
        deactivatedAt: now.toISOString(),
        reason: 'unpaid_after_grace_period',
        gracePeriodDays: GRACE_PERIOD_DAYS,
      };

      await this.subscriptionRepository.save(subscription);
      downgradedCount++;

      // Send downgrade notification
      await this.sendDowngradeNotification(subscription, previousPlan);

      this.logger.warn(
        `Subscription ${subscription.id} (${previousPlan}) deactivated ` +
        `(${daysPastDue} days past due, grace period: ${GRACE_PERIOD_DAYS} days)`,
      );
    }

    if (downgradedCount > 0) {
      this.logger.log(`Deactivated ${downgradedCount} unpaid subscription(s)`);
    }
  }

  /**
   * Check if the same org or user has another ACTIVE subscription (different from the given one).
   * This detects stale duplicate records that should be cleaned up instead of processed.
   */
  private async hasOtherActiveSubscription(
    subscriptionId: string,
    ownerId: string,
    isOrganization: boolean,
  ): Promise<boolean> {
    const where: any = {
      status: SubscriptionStatus.ACTIVE,
      plan: Not(SubscriptionPlan.FREE),
    };
    if (isOrganization) {
      where.organizationId = ownerId;
    } else {
      where.userId = ownerId;
    }

    const activeSubscription = await this.subscriptionRepository.findOne({ where });
    return !!activeSubscription && activeSubscription.id !== subscriptionId;
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
