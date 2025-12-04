import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Subscription, User, Organization } from '../../common/entities';
import { SubscriptionPlan, SubscriptionStatus } from '../../common/enums';
import {
  SUBSCRIPTION_LIMITS,
  SUBSCRIPTION_FEATURES,
} from '../../common/entities/subscription.entity';
import { CurrencyService } from './currency.service';

export interface PaymentDetails {
  transactionId: string;
  ptn?: string;
  plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';
  amount: number;
  currency: string;
  billingPeriod: 'monthly' | 'annually';
  paymentMethod: 'mobile_money' | 'card' | 'bank_transfer';
  paymentProvider: 's3p' | 'enkap' | 'stripe';
}

export interface UpgradeResult {
  success: boolean;
  subscription?: Subscription;
  previousPlan?: SubscriptionPlan;
  newPlan?: SubscriptionPlan;
  message: string;
  error?: string;
}

@Injectable()
export class SubscriptionUpgradeService {
  private readonly logger = new Logger(SubscriptionUpgradeService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Upgrade subscription for a user after successful payment
   */
  async upgradeUserSubscription(
    userId: string,
    paymentDetails: PaymentDetails,
  ): Promise<UpgradeResult> {
    this.logger.log(`Processing subscription upgrade for user ${userId} to ${paymentDetails.plan}`);

    try {
      // Find user
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return {
          success: false,
          message: 'User not found',
          error: `User with ID ${userId} not found`,
        };
      }

      // Find existing subscription
      let subscription = await this.subscriptionRepository.findOne({
        where: {
          userId,
          organizationId: IsNull(),
        },
      });

      const previousPlan = subscription?.plan || SubscriptionPlan.FREE;
      const newPlan = this.getPlanEnum(paymentDetails.plan);

      // Calculate subscription dates
      const now = new Date();
      const endsAt = this.calculateEndDate(now, paymentDetails.billingPeriod);
      const nextBillingDate = endsAt;

      // Get price in cents (USD base)
      const priceInCents = this.currencyService.PRICING[paymentDetails.plan].priceUSD * 100;

      if (subscription) {
        // Update existing subscription
        subscription.plan = newPlan;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.priceInCents = priceInCents;
        subscription.currency = 'USD';
        subscription.startsAt = now;
        subscription.endsAt = endsAt;
        subscription.nextBillingDate = nextBillingDate;
        subscription.limits = SUBSCRIPTION_LIMITS[newPlan];
        subscription.features = SUBSCRIPTION_FEATURES[newPlan];
        subscription.metadata = {
          ...subscription.metadata,
          lastPayment: {
            transactionId: paymentDetails.transactionId,
            ptn: paymentDetails.ptn,
            amount: paymentDetails.amount,
            currency: paymentDetails.currency,
            paymentMethod: paymentDetails.paymentMethod,
            paymentProvider: paymentDetails.paymentProvider,
            billingPeriod: paymentDetails.billingPeriod,
            processedAt: now.toISOString(),
          },
          upgradeHistory: [
            ...(subscription.metadata?.upgradeHistory || []),
            {
              from: previousPlan,
              to: newPlan,
              date: now.toISOString(),
              transactionId: paymentDetails.transactionId,
            },
          ],
        };
      } else {
        // Create new subscription
        subscription = this.subscriptionRepository.create({
          userId,
          organizationId: null,
          plan: newPlan,
          status: SubscriptionStatus.ACTIVE,
          priceInCents,
          currency: 'USD',
          startsAt: now,
          endsAt,
          nextBillingDate,
          limits: SUBSCRIPTION_LIMITS[newPlan],
          features: SUBSCRIPTION_FEATURES[newPlan],
          metadata: {
            lastPayment: {
              transactionId: paymentDetails.transactionId,
              ptn: paymentDetails.ptn,
              amount: paymentDetails.amount,
              currency: paymentDetails.currency,
              paymentMethod: paymentDetails.paymentMethod,
              paymentProvider: paymentDetails.paymentProvider,
              billingPeriod: paymentDetails.billingPeriod,
              processedAt: now.toISOString(),
            },
            upgradeHistory: [
              {
                from: SubscriptionPlan.FREE,
                to: newPlan,
                date: now.toISOString(),
                transactionId: paymentDetails.transactionId,
              },
            ],
          },
        });
      }

      await this.subscriptionRepository.save(subscription);

      this.logger.log(`Subscription upgraded successfully: ${previousPlan} -> ${newPlan} for user ${userId}`);

      return {
        success: true,
        subscription,
        previousPlan,
        newPlan,
        message: `Successfully upgraded from ${previousPlan} to ${newPlan}`,
      };
    } catch (error) {
      this.logger.error(`Failed to upgrade subscription: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to upgrade subscription',
        error: error.message,
      };
    }
  }

  /**
   * Upgrade subscription for an organization after successful payment
   */
  async upgradeOrganizationSubscription(
    organizationId: string,
    paymentDetails: PaymentDetails,
  ): Promise<UpgradeResult> {
    this.logger.log(`Processing subscription upgrade for organization ${organizationId} to ${paymentDetails.plan}`);

    try {
      // Find organization
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
        relations: ['subscriptions'],
      });

      if (!organization) {
        return {
          success: false,
          message: 'Organization not found',
          error: `Organization with ID ${organizationId} not found`,
        };
      }

      // Find existing active subscription
      let subscription = organization.subscriptions?.find(s => s.isActive);

      const previousPlan = subscription?.plan || SubscriptionPlan.FREE;
      const newPlan = this.getPlanEnum(paymentDetails.plan);

      // Calculate subscription dates
      const now = new Date();
      const endsAt = this.calculateEndDate(now, paymentDetails.billingPeriod);
      const nextBillingDate = endsAt;

      // Get price in cents (USD base)
      const priceInCents = this.currencyService.PRICING[paymentDetails.plan].priceUSD * 100;

      if (subscription) {
        // Update existing subscription
        subscription.plan = newPlan;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.priceInCents = priceInCents;
        subscription.currency = 'USD';
        subscription.startsAt = now;
        subscription.endsAt = endsAt;
        subscription.nextBillingDate = nextBillingDate;
        subscription.limits = SUBSCRIPTION_LIMITS[newPlan];
        subscription.features = SUBSCRIPTION_FEATURES[newPlan];
        subscription.metadata = {
          ...subscription.metadata,
          lastPayment: {
            transactionId: paymentDetails.transactionId,
            ptn: paymentDetails.ptn,
            amount: paymentDetails.amount,
            currency: paymentDetails.currency,
            paymentMethod: paymentDetails.paymentMethod,
            paymentProvider: paymentDetails.paymentProvider,
            billingPeriod: paymentDetails.billingPeriod,
            processedAt: now.toISOString(),
          },
          upgradeHistory: [
            ...(subscription.metadata?.upgradeHistory || []),
            {
              from: previousPlan,
              to: newPlan,
              date: now.toISOString(),
              transactionId: paymentDetails.transactionId,
            },
          ],
        };
      } else {
        // Create new subscription
        subscription = this.subscriptionRepository.create({
          organizationId,
          userId: null,
          plan: newPlan,
          status: SubscriptionStatus.ACTIVE,
          priceInCents,
          currency: 'USD',
          startsAt: now,
          endsAt,
          nextBillingDate,
          limits: SUBSCRIPTION_LIMITS[newPlan],
          features: SUBSCRIPTION_FEATURES[newPlan],
          metadata: {
            lastPayment: {
              transactionId: paymentDetails.transactionId,
              ptn: paymentDetails.ptn,
              amount: paymentDetails.amount,
              currency: paymentDetails.currency,
              paymentMethod: paymentDetails.paymentMethod,
              paymentProvider: paymentDetails.paymentProvider,
              billingPeriod: paymentDetails.billingPeriod,
              processedAt: now.toISOString(),
            },
            upgradeHistory: [
              {
                from: SubscriptionPlan.FREE,
                to: newPlan,
                date: now.toISOString(),
                transactionId: paymentDetails.transactionId,
              },
            ],
          },
        });
      }

      await this.subscriptionRepository.save(subscription);

      this.logger.log(`Subscription upgraded successfully: ${previousPlan} -> ${newPlan} for organization ${organizationId}`);

      return {
        success: true,
        subscription,
        previousPlan,
        newPlan,
        message: `Successfully upgraded from ${previousPlan} to ${newPlan}`,
      };
    } catch (error) {
      this.logger.error(`Failed to upgrade organization subscription: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Failed to upgrade subscription',
        error: error.message,
      };
    }
  }

  /**
   * Cancel/Downgrade subscription to FREE plan
   */
  async cancelSubscription(userId: string, organizationId?: string): Promise<UpgradeResult> {
    try {
      const whereClause = organizationId
        ? { organizationId }
        : { userId, organizationId: IsNull() };

      const subscription = await this.subscriptionRepository.findOne({
        where: whereClause,
      });

      if (!subscription) {
        return {
          success: false,
          message: 'No active subscription found',
        };
      }

      const previousPlan = subscription.plan;

      subscription.plan = SubscriptionPlan.FREE;
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.FREE];
      subscription.features = SUBSCRIPTION_FEATURES[SubscriptionPlan.FREE];
      subscription.metadata = {
        ...subscription.metadata,
        cancellation: {
          previousPlan,
          cancelledAt: new Date().toISOString(),
        },
      };

      await this.subscriptionRepository.save(subscription);

      this.logger.log(`Subscription cancelled: ${previousPlan} -> FREE`);

      return {
        success: true,
        subscription,
        previousPlan,
        newPlan: SubscriptionPlan.FREE,
        message: `Subscription cancelled, downgraded to FREE plan`,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      return {
        success: false,
        message: 'Failed to cancel subscription',
        error: error.message,
      };
    }
  }

  /**
   * Get current subscription for user or organization
   */
  async getSubscription(userId: string, organizationId?: string): Promise<Subscription | null> {
    const whereClause = organizationId
      ? { organizationId }
      : { userId, organizationId: IsNull() };

    return this.subscriptionRepository.findOne({
      where: whereClause,
    });
  }

  /**
   * Convert plan string to enum
   */
  private getPlanEnum(plan: string): SubscriptionPlan {
    const planMap: Record<string, SubscriptionPlan> = {
      FREE: SubscriptionPlan.FREE,
      STANDARD: SubscriptionPlan.STANDARD,
      PRO: SubscriptionPlan.PRO,
      ENTERPRISE: SubscriptionPlan.ENTERPRISE,
    };

    return planMap[plan.toUpperCase()] || SubscriptionPlan.FREE;
  }

  /**
   * Calculate subscription end date based on billing period
   */
  private calculateEndDate(startDate: Date, billingPeriod: 'monthly' | 'annually'): Date {
    const endDate = new Date(startDate);

    if (billingPeriod === 'annually') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    return endDate;
  }
}
