import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Subscription, User, OrganizationMember } from '../../common/entities';
import { SubscriptionStatus, SubscriptionPlan, UserRole } from '../../common/enums';
import { PlanService } from './plan.service';
import { InvoiceService } from './invoice.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
    private readonly planService: PlanService,
    private readonly invoiceService: InvoiceService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Start a trial for a subscription (non-Stripe only).
   * Creates a trial invoice and sends the welcome email.
   */
  async startTrial(subscription: Subscription): Promise<void> {
    try {
      // Skip for Stripe-managed subscriptions (Stripe handles trials natively)
      if (subscription.stripeSubscriptionId) return;

      const user = await this.getSubscriptionUser(subscription);
      if (!user) return;

      // Create trial invoice with dueDate = trialEndsAt.
      // Isolate its failure so it never blocks the welcome email below.
      if (subscription.trialEndsAt) {
        try {
          await this.invoiceService.createTrialInvoice(subscription);
        } catch (invoiceError) {
          this.logger.error(
            `Failed to create trial invoice for subscription ${subscription.id}: ${invoiceError.message}`,
          );
        }
      }

      // Send trial start email
      const planCode = subscription.plan.toLowerCase();
      const trialDays = this.planService.getTrialDays(planCode);
      await this.emailService.sendTrialStartEmail(
        user.email,
        user.firstName || user.email.split('@')[0],
        {
          planName: subscription.plan,
          trialDays,
          trialEndsAt: subscription.trialEndsAt,
        },
      );

      this.logger.log(`Trial started for subscription ${subscription.id} (${subscription.plan}, ${trialDays} days)`);
    } catch (error) {
      this.logger.error(`Failed to start trial for subscription ${subscription.id}: ${error.message}`);
    }
  }

  /**
   * Cron: Send reminders to trialing subscriptions (3 days, 1 day before, and on expiration day)
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkTrialReminders(): Promise<void> {
    const now = new Date();

    const trialingSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.TRIALING,
      },
    });

    for (const subscription of trialingSubscriptions) {
      // Skip Stripe-managed
      if (subscription.stripeSubscriptionId) continue;
      if (!subscription.trialEndsAt) continue;

      const daysRemaining = Math.ceil(
        (subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      const shouldRemind = [3, 1, 0].includes(daysRemaining);
      if (!shouldRemind) continue;

      const user = await this.getSubscriptionUser(subscription);
      if (!user) continue;

      try {
        await this.emailService.sendTrialReminderEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
          {
            planName: subscription.plan,
            daysRemaining: Math.max(0, daysRemaining),
            trialEndsAt: subscription.trialEndsAt,
          },
        );
        this.logger.log(`Trial reminder sent: ${subscription.id} (${daysRemaining} days remaining)`);
      } catch (error) {
        this.logger.error(`Failed to send trial reminder for ${subscription.id}: ${error.message}`);
      }
    }
  }

  /**
   * Cron: Expire unpaid trials - deactivate subscriptions where trial has ended and no payment received
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireUnpaidTrials(): Promise<void> {
    const now = new Date();

    const expiredTrials = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: LessThanOrEqual(now),
      },
    });

    for (const subscription of expiredTrials) {
      // Skip Stripe-managed
      if (subscription.stripeSubscriptionId) continue;

      // Deactivate subscription (keep original plan name for display)
      const previousPlan = subscription.plan;
      subscription.status = SubscriptionStatus.INACTIVE;
      // Do NOT change plan - keep original so user sees what they had
      subscription.metadata = {
        ...subscription.metadata,
        trialExpired: {
          expiredAt: now.toISOString(),
          previousPlan,
        },
      };

      await this.subscriptionRepository.save(subscription);

      // Send expiration email
      const user = await this.getSubscriptionUser(subscription);
      if (user) {
        try {
          await this.emailService.sendTrialExpiredEmail(
            user.email,
            user.firstName || user.email.split('@')[0],
            {
              planName: subscription.metadata?.trialExpired?.previousPlan || subscription.plan,
            },
          );
        } catch (error) {
          this.logger.error(`Failed to send trial expired email for ${subscription.id}: ${error.message}`);
        }
      }

      this.logger.log(`Trial expired for subscription ${subscription.id}, set to INACTIVE (was ${previousPlan})`);
    }

    if (expiredTrials.length > 0) {
      this.logger.log(`Expired ${expiredTrials.length} unpaid trial(s)`);
    }
  }

  /**
   * Cron: Clean up abandoned Stripe checkouts.
   * Subscriptions with stripeCheckoutPending=true and no trialEndsAt (new behavior)
   * will never be caught by expireUnpaidTrials. This cron deactivates them after 7 days.
   */
  @Cron('0 3 * * *')
  async cleanupAbandonedCheckouts(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    const abandoned = await this.subscriptionRepository
      .createQueryBuilder('sub')
      .where('sub.status = :status', { status: SubscriptionStatus.TRIALING })
      .andWhere("sub.metadata->>'stripeCheckoutPending' = 'true'")
      .andWhere('sub."stripeSubscriptionId" IS NULL')
      .andWhere('sub."createdAt" <= :cutoff', { cutoff: cutoffDate })
      .getMany();

    for (const subscription of abandoned) {
      subscription.status = SubscriptionStatus.INACTIVE;
      subscription.metadata = {
        ...subscription.metadata,
        abandonedCheckout: {
          detectedAt: new Date().toISOString(),
          reason: 'stripe_checkout_never_completed',
        },
      };
      await this.subscriptionRepository.save(subscription);

      const user = await this.getSubscriptionUser(subscription);
      if (user) {
        await this.emailService.sendTrialExpiredEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
          { planName: subscription.plan },
        ).catch(() => {});
      }

      this.logger.log(`Abandoned checkout cleaned up: ${subscription.id}`);
    }

    if (abandoned.length > 0) {
      this.logger.log(`Cleaned up ${abandoned.length} abandoned Stripe checkout(s)`);
    }
  }

  /**
   * Get the user associated with a subscription (via userId or organization owner)
   */
  private async getSubscriptionUser(subscription: Subscription): Promise<User | null> {
    if (subscription.userId) {
      return this.userRepository.findOne({ where: { id: subscription.userId } });
    }

    if (subscription.organizationId) {
      const adminMember = await this.memberRepository.findOne({
        where: {
          organizationId: subscription.organizationId,
          role: In([UserRole.OWNER, UserRole.ADMIN]),
          isActive: true,
        },
        relations: ['user'],
      });
      return adminMember?.user || null;
    }

    return null;
  }
}
