import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Subscription, User, Organization, Invoice } from '../../common/entities';
import { SubscriptionPlan, SubscriptionStatus } from '../../common/enums';
import { InvoiceStatus } from '../../common/entities/invoice.entity';
import {
  SUBSCRIPTION_LIMITS,
  SUBSCRIPTION_FEATURES,
} from '../../common/entities/subscription.entity';
import { CurrencyService } from './currency.service';
import { EmailService } from '../email/email.service';

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

    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,

    private readonly currencyService: CurrencyService,
    private readonly emailService: EmailService,
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
      // Ensure plans are loaded before accessing them
      await this.currencyService.ensurePlansLoaded();

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
      const planInfo = this.currencyService.getPlan(paymentDetails.plan);
      if (!planInfo) {
        return {
          success: false,
          message: 'Plan not found',
          error: `Plan ${paymentDetails.plan} not found in pricing`,
        };
      }
      const priceInCents = planInfo.priceUSD * 100;

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

      // Create invoice for the payment (don't block the response)
      this.createPaymentInvoice(subscription, paymentDetails, userId, undefined).catch(err => {
        this.logger.error(`Failed to create invoice: ${err.message}`);
      });

      // Send confirmation emails (don't block the response)
      this.sendUpgradeEmails(user, paymentDetails, previousPlan, newPlan, subscription).catch(err => {
        this.logger.error(`Failed to send upgrade emails: ${err.message}`);
      });

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
   * Send payment and upgrade confirmation emails
   */
  private async sendUpgradeEmails(
    user: User,
    paymentDetails: PaymentDetails,
    previousPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
    subscription: Subscription,
  ): Promise<void> {
    const firstName = user.firstName || user.email.split('@')[0];
    const planInfo = this.currencyService.getPlan(paymentDetails.plan);

    if (!planInfo) {
      this.logger.warn(`Plan info not found for ${paymentDetails.plan}, skipping email`);
      return;
    }

    // Send payment confirmation email
    await this.emailService.sendPaymentConfirmationEmail(
      user.email,
      firstName,
      {
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        transactionId: paymentDetails.transactionId,
        paymentMethod: paymentDetails.paymentMethod === 'mobile_money' ? 'Mobile Money' :
                       paymentDetails.paymentMethod === 'card' ? 'Carte bancaire' : 'Virement',
        planName: planInfo.name,
        date: new Date(),
      },
    );

    // Send subscription upgrade email
    await this.emailService.sendSubscriptionUpgradeEmail(
      user.email,
      firstName,
      {
        previousPlan: previousPlan,
        newPlan: newPlan,
        newLimits: {
          messages: planInfo.messages,
          agents: planInfo.agents,
          storage: planInfo.storage,
        },
        nextBillingDate: subscription.nextBillingDate || subscription.endsAt,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
      },
    );

    this.logger.log(`✅ Confirmation emails sent to ${user.email}`);
  }

  /**
   * Send payment and upgrade confirmation emails for organization
   */
  private async sendOrganizationUpgradeEmails(
    organization: Organization,
    paymentDetails: PaymentDetails,
    previousPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
    subscription: Subscription,
  ): Promise<void> {
    // Get organization owner to send email
    const owner = await this.userRepository.findOne({
      where: { id: organization.ownerId },
    });

    if (!owner) {
      this.logger.warn(`Organization owner not found for ${organization.id}, skipping email`);
      return;
    }

    const firstName = owner.firstName || owner.email.split('@')[0];
    const planInfo = this.currencyService.getPlan(paymentDetails.plan);

    if (!planInfo) {
      this.logger.warn(`Plan info not found for ${paymentDetails.plan}, skipping email`);
      return;
    }

    // Send payment confirmation email
    await this.emailService.sendPaymentConfirmationEmail(
      owner.email,
      firstName,
      {
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        transactionId: paymentDetails.transactionId,
        paymentMethod: paymentDetails.paymentMethod === 'mobile_money' ? 'Mobile Money' :
                       paymentDetails.paymentMethod === 'card' ? 'Carte bancaire' : 'Virement',
        planName: planInfo.name,
        date: new Date(),
      },
    );

    // Send subscription upgrade email
    await this.emailService.sendSubscriptionUpgradeEmail(
      owner.email,
      firstName,
      {
        previousPlan: previousPlan,
        newPlan: newPlan,
        newLimits: {
          messages: planInfo.messages,
          agents: planInfo.agents,
          storage: planInfo.storage,
        },
        nextBillingDate: subscription.nextBillingDate || subscription.endsAt,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
      },
    );

    this.logger.log(`✅ Organization confirmation emails sent to ${owner.email}`);
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
      // Ensure plans are loaded before accessing them
      await this.currencyService.ensurePlansLoaded();

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
      const planInfo = this.currencyService.getPlan(paymentDetails.plan);
      if (!planInfo) {
        return {
          success: false,
          message: 'Plan not found',
          error: `Plan ${paymentDetails.plan} not found in pricing`,
        };
      }
      const priceInCents = planInfo.priceUSD * 100;

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

      // Create invoice for the payment (don't block the response)
      this.createPaymentInvoice(subscription, paymentDetails, undefined, organizationId).catch(err => {
        this.logger.error(`Failed to create invoice: ${err.message}`);
      });

      // Send confirmation emails to organization owner (don't block the response)
      this.sendOrganizationUpgradeEmails(organization, paymentDetails, previousPlan, newPlan, subscription).catch(err => {
        this.logger.error(`Failed to send organization upgrade emails: ${err.message}`);
      });

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
   * Create invoice after successful payment
   */
  private async createPaymentInvoice(
    subscription: Subscription,
    paymentDetails: PaymentDetails,
    userId?: string,
    organizationId?: string,
  ): Promise<Invoice | null> {
    // Invoice requires organizationId - for user subscriptions, we may not have an org
    // In that case, we need to get or create an organization for the user
    if (!organizationId && userId) {
      // Find user's organization or skip invoice creation
      const org = await this.organizationRepository.findOne({
        where: { ownerId: userId },
      });
      if (org) {
        organizationId = org.id;
      } else {
        this.logger.warn(`No organization found for user ${userId}, skipping invoice creation`);
        return null;
      }
    }

    if (!organizationId) {
      this.logger.warn('No organizationId available, skipping invoice creation');
      return null;
    }

    const invoiceNumber = this.generateInvoiceNumber();
    const planInfo = this.currencyService.getPlan(paymentDetails.plan);
    const planName = planInfo?.name || paymentDetails.plan;
    const amountInCents = Math.round(paymentDetails.amount * 100);

    const invoice = this.invoiceRepository.create({
      invoiceNumber,
      organizationId,
      subscriptionId: subscription.id,
      status: InvoiceStatus.PAID,
      amountInCents,
      totalAmountInCents: amountInCents,
      currency: paymentDetails.currency,
      description: `Abonnement ${planName} - ${paymentDetails.billingPeriod === 'annually' ? 'Annuel' : 'Mensuel'}`,
      periodStart: subscription.startsAt,
      periodEnd: subscription.endsAt,
      dueDate: new Date(),
      paidAt: new Date(),
      paymentMethod: paymentDetails.paymentMethod === 'mobile_money' ? 'Mobile Money' :
                     paymentDetails.paymentMethod === 'card' ? 'Carte bancaire' : 'Virement',
      paymentReference: paymentDetails.transactionId,
      lineItems: [
        {
          description: `Plan ${planName}`,
          quantity: 1,
          unitPrice: paymentDetails.amount,
          total: paymentDetails.amount,
        },
      ],
      metadata: {
        transactionId: paymentDetails.transactionId,
        ptn: paymentDetails.ptn,
        paymentMethod: paymentDetails.paymentMethod,
        paymentProvider: paymentDetails.paymentProvider,
        billingPeriod: paymentDetails.billingPeriod,
        planName,
      },
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);
    this.logger.log(`Invoice created: ${invoiceNumber} for ${paymentDetails.amount} ${paymentDetails.currency}`);
    return savedInvoice;
  }

  /**
   * Generate unique invoice number
   */
  private generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INV-${year}${month}-${random}`;
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
