import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Subscription, User, Organization, Plan, Invoice } from '../../common/entities';
import { MessageCredit, MessageCreditStatus } from '../../common/entities/message-credit.entity';
import { InvoiceStatus } from '../../common/entities/invoice.entity';
import { SubscriptionStatus, SubscriptionPlan } from '../../common/enums';
import { SubscriptionUpgradeService, PaymentDetails } from './subscription-upgrade.service';
import { PlanService } from '../subscriptions/plan.service';
import { QuotaEnforcementService } from '../subscriptions/quota-enforcement.service';
import { MESSAGE_CREDIT_CONFIG } from '../subscriptions/message-credits.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe | null = null;
  private readonly webhookSecret: string;
  private readonly publishableKey: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(MessageCredit)
    private readonly messageCreditRepository: Repository<MessageCredit>,
    private readonly subscriptionUpgradeService: SubscriptionUpgradeService,
    private readonly planService: PlanService,
    private readonly quotaEnforcementService: QuotaEnforcementService,
    private readonly emailService: EmailService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.publishableKey = this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') || '';

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
      this.logger.log('Stripe initialized successfully');
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not configured - Stripe payments will be unavailable');
    }
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.',
      );
    }
    return this.stripe;
  }

  /**
   * Get or create a Stripe customer for a user
   */
  async getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
    const stripe = this.ensureStripe();

    // Check if user already has a subscription with stripeCustomerId
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    if (subscription?.stripeCustomerId) {
      // Sync email/name on Stripe customer to keep it up-to-date
      await stripe.customers.update(subscription.stripeCustomerId, {
        email,
        ...(name ? { name } : {}),
      });
      return subscription.stripeCustomerId;
    }

    // Check organization subscriptions
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user) {
      const org = await this.organizationRepository.findOne({ where: { ownerId: userId } });
      if (org) {
        const orgSub = await this.subscriptionRepository.findOne({
          where: { organizationId: org.id },
        });
        if (orgSub?.stripeCustomerId) {
          // Sync email/name on Stripe customer to keep it up-to-date
          await stripe.customers.update(orgSub.stripeCustomerId, {
            email,
            ...(name ? { name } : {}),
          });
          return orgSub.stripeCustomerId;
        }
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { userId },
    });

    return customer.id;
  }

  /**
   * Create a Stripe Checkout session for subscription
   */
  async createCheckoutSession(params: {
    userId: string;
    organizationId?: string;
    planCode: string;
    billingPeriod: 'monthly' | 'annually';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    const stripe = this.ensureStripe();

    const user = await this.userRepository.findOne({ where: { id: params.userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get plan from DB
    const plan = await this.planRepository.findOne({
      where: { code: params.planCode.toLowerCase() },
    });
    if (!plan) {
      throw new BadRequestException(`Plan ${params.planCode} not found`);
    }

    const stripePriceId = params.billingPeriod === 'annually'
      ? plan.stripePriceAnnualId
      : plan.stripePriceMonthlyId;

    if (!stripePriceId) {
      throw new BadRequestException(
        `Stripe price not configured for plan ${params.planCode} (${params.billingPeriod}). Run sync-plans first.`,
      );
    }

    // Get or create customer
    const customerId = await this.getOrCreateCustomer(
      params.userId,
      user.email,
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
    );

    // Resolve organizationId
    let organizationId = params.organizationId;
    if (!organizationId) {
      const org = await this.organizationRepository.findOne({ where: { ownerId: params.userId } });
      if (org) {
        organizationId = org.id;
      }
    }

    // Get trial days for this plan (Stripe handles trials natively)
    const trialDays = this.planService.getTrialDays(params.planCode.toLowerCase());

    const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
        organizationId: organizationId || '',
        planCode: params.planCode.toUpperCase(),
        billingPeriod: params.billingPeriod,
        type: 'subscription',
      },
      subscription_data: {
        metadata: {
          userId: params.userId,
          organizationId: organizationId || '',
          planCode: params.planCode.toUpperCase(),
          billingPeriod: params.billingPeriod,
        },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionCreateParams);

    return { sessionId: session.id, url: session.url! };
  }

  /**
   * Create a Stripe Checkout session for one-time message credits purchase
   */
  async createCreditCheckoutSession(params: {
    userId: string;
    organizationId?: string;
    amount: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }> {
    const stripe = this.ensureStripe();

    const user = await this.userRepository.findOne({ where: { id: params.userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Calculate price in USD cents
    const pricePerMessageUSD = MESSAGE_CREDIT_CONFIG.pricePerMessageUSD;
    const totalUSD = params.amount * pricePerMessageUSD;
    const totalCents = Math.round(totalUSD * 100);

    if (totalCents < 50) {
      throw new BadRequestException('Minimum Stripe charge is $0.50. Please purchase more credits.');
    }

    const customerId = await this.getOrCreateCustomer(
      params.userId,
      user.email,
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
    );

    // Resolve organizationId
    let organizationId = params.organizationId;
    if (!organizationId) {
      const org = await this.organizationRepository.findOne({ where: { ownerId: params.userId } });
      if (org) {
        organizationId = org.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${params.amount.toLocaleString()} Message Credits`,
              description: `${params.amount} additional WhatsApp messages for WazeApp`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
        organizationId: organizationId || '',
        type: 'message_credits',
        creditAmount: String(params.amount),
        totalUSD: totalUSD.toFixed(2),
      },
    });

    return { sessionId: session.id, url: session.url! };
  }

  /**
   * Create a Stripe Customer Portal session
   */
  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const stripe = this.ensureStripe();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Cancel a Stripe subscription at period end
   */
  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    const stripe = this.ensureStripe();

    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    this.logger.log(`Stripe subscription ${stripeSubscriptionId} set to cancel at period end`);
  }

  /**
   * Verify webhook signature and construct event
   */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const stripe = this.ensureStripe();

    if (!this.webhookSecret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    return stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Handling Stripe event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Handle checkout.session.completed
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata || {};

    if (metadata.type === 'message_credits') {
      await this.handleCreditCheckoutCompleted(session);
      return;
    }

    // Subscription checkout
    const { userId, organizationId, planCode, billingPeriod } = metadata;

    if (!userId || !planCode) {
      this.logger.warn(`Checkout session ${session.id} missing metadata (userId or planCode)`);
      return;
    }

    // Idempotence: check if subscription already has this Stripe subscription ID
    const stripeSubscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as any)?.id;

    if (stripeSubscriptionId) {
      const existing = await this.subscriptionRepository.findOne({
        where: { stripeSubscriptionId },
      });
      if (existing) {
        this.logger.log(`Subscription already exists for Stripe subscription ${stripeSubscriptionId}, skipping`);
        return;
      }
    }

    const customerId = typeof session.customer === 'string'
      ? session.customer
      : (session.customer as any)?.id;

    // Use SubscriptionUpgradeService to handle the upgrade
    const paymentDetails: PaymentDetails = {
      transactionId: session.id,
      plan: planCode as 'STANDARD' | 'PRO' | 'ENTERPRISE',
      amount: (session.amount_total || 0) / 100,
      currency: (session.currency || 'usd').toUpperCase(),
      billingPeriod: (billingPeriod || 'monthly') as 'monthly' | 'annually',
      paymentMethod: 'card',
      paymentProvider: 'stripe',
    };

    let result;
    if (organizationId) {
      result = await this.subscriptionUpgradeService.upgradeOrganizationSubscription(
        organizationId,
        paymentDetails,
      );
    } else {
      result = await this.subscriptionUpgradeService.upgradeUserSubscription(userId, paymentDetails);
    }

    if (result.success && result.subscription) {
      // Save Stripe IDs on the subscription
      result.subscription.stripeSubscriptionId = stripeSubscriptionId || null;
      result.subscription.stripeCustomerId = customerId || null;

      // Clear stripeCheckoutPending flag (set during registration for Stripe users)
      if (result.subscription.metadata?.stripeCheckoutPending) {
        result.subscription.metadata = {
          ...result.subscription.metadata,
          stripeCheckoutPending: false,
        };
      }

      await this.subscriptionRepository.save(result.subscription);

      this.logger.log(
        `Stripe checkout completed: ${planCode} plan for ${organizationId || userId}`,
      );
    } else {
      // If upgrade service didn't find/create subscription (e.g. registration flow),
      // look for existing TRIALING subscription with stripeCheckoutPending and update it
      const existingSub = await this.subscriptionRepository.findOne({
        where: organizationId
          ? { organizationId }
          : { userId },
      });

      if (existingSub && existingSub.metadata?.stripeCheckoutPending) {
        existingSub.stripeSubscriptionId = stripeSubscriptionId || null;
        existingSub.stripeCustomerId = customerId || null;
        existingSub.metadata = {
          ...existingSub.metadata,
          stripeCheckoutPending: false,
        };
        await this.subscriptionRepository.save(existingSub);
        this.logger.log(
          `Stripe checkout completed (registration flow): ${planCode} plan for ${organizationId || userId}`,
        );
      } else {
        this.logger.error(`Failed to process Stripe checkout: ${result.message}`);
      }
    }
  }

  /**
   * Handle credit checkout completed
   */
  private async handleCreditCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata || {};
    const { organizationId, creditAmount } = metadata;
    const amount = parseInt(creditAmount || '0', 10);

    if (!organizationId || !amount) {
      this.logger.warn(`Credit checkout ${session.id} missing metadata`);
      return;
    }

    // Idempotence: check if we already have a credit with this transaction ID
    const existing = await this.messageCreditRepository.findOne({
      where: { transactionId: session.id },
    });
    if (existing) {
      this.logger.log(`Message credits already created for session ${session.id}, skipping`);
      return;
    }

    const priceXAF = amount * MESSAGE_CREDIT_CONFIG.pricePerMessageXAF;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MESSAGE_CREDIT_CONFIG.expirationDays);

    const credit = this.messageCreditRepository.create({
      organizationId,
      amount,
      remaining: amount,
      used: 0,
      status: MessageCreditStatus.ACTIVE,
      expiresAt,
      pricePerMessageXAF: MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
      totalAmountXAF: priceXAF,
      transactionId: session.id,
      paymentMethod: 'stripe',
      metadata: {
        paymentProvider: 'stripe',
        notes: `Stripe session: ${session.id}`,
      },
    });

    await this.messageCreditRepository.save(credit);
    this.logger.log(`Created ${amount} message credits for org ${organizationId} via Stripe`);
  }

  /**
   * Handle invoice.payment_succeeded (renewal)
   */
  private async handleInvoicePaymentSucceeded(stripeInvoice: Stripe.Invoice): Promise<void> {
    // In newer Stripe API versions, subscription may be nested differently
    const invoiceAny = stripeInvoice as any;
    const stripeSubscriptionId: string | undefined =
      invoiceAny.subscription ??
      invoiceAny.parent?.subscription_details?.subscription ??
      undefined;

    if (!stripeSubscriptionId) return;

    // Skip first invoice (handled by checkout.session.completed)
    if (stripeInvoice.billing_reason === 'subscription_create') {
      this.logger.debug(`Skipping initial subscription invoice ${stripeInvoice.id}`);
      return;
    }

    // Idempotence: check if we already processed this Stripe invoice
    const existingInvoice = await this.invoiceRepository.findOne({
      where: { paymentReference: stripeInvoice.id },
    });
    if (existingInvoice) {
      this.logger.log(`Invoice already exists for Stripe invoice ${stripeInvoice.id}, skipping`);
      return;
    }

    // Find local subscription
    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`No local subscription found for Stripe subscription ${stripeSubscriptionId}`);
      return;
    }

    // Extend subscription period
    const now = new Date();
    const periodEnd = stripeInvoice.lines?.data?.[0]?.period?.end;
    const newEndsAt = periodEnd ? new Date(periodEnd * 1000) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.startsAt = now;
    subscription.endsAt = newEndsAt;
    subscription.nextBillingDate = newEndsAt;
    await this.subscriptionRepository.save(subscription);

    // Create local invoice
    const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const amountInCents = stripeInvoice.amount_paid || 0;

    const localInvoice = this.invoiceRepository.create({
      invoiceNumber,
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      status: InvoiceStatus.PAID,
      amountInCents,
      totalAmountInCents: amountInCents,
      currency: (stripeInvoice.currency || 'usd').toUpperCase(),
      description: `Renouvellement abonnement ${subscription.plan} (Stripe)`,
      periodStart: now,
      periodEnd: newEndsAt,
      dueDate: now,
      paidAt: now,
      paymentMethod: 'Stripe',
      paymentReference: stripeInvoice.id,
      lineItems: [
        {
          description: `Plan ${subscription.plan} - Renouvellement`,
          quantity: 1,
          unitPrice: amountInCents,
          total: amountInCents,
        },
      ],
      metadata: {
        stripeInvoiceId: stripeInvoice.id,
        stripeSubscriptionId,
        paymentProvider: 'stripe',
      },
    });

    await this.invoiceRepository.save(localInvoice);

    // Clear caches
    if (subscription.organizationId) {
      await this.quotaEnforcementService.clearOrganizationCaches(subscription.organizationId);
    }
    if (subscription.userId) {
      await this.quotaEnforcementService.clearUserCaches(subscription.userId);
    }

    this.logger.log(
      `Stripe renewal processed for subscription ${subscription.id}: extended to ${newEndsAt.toISOString()}`,
    );
  }

  /**
   * Handle invoice.payment_failed
   */
  private async handleInvoicePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<void> {
    // In newer Stripe API versions, subscription may be nested differently
    const invoiceAny = stripeInvoice as any;
    const stripeSubscriptionId: string | undefined =
      invoiceAny.subscription ??
      invoiceAny.parent?.subscription_details?.subscription ??
      undefined;

    if (!stripeSubscriptionId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`No local subscription for failed invoice: ${stripeSubscriptionId}`);
      return;
    }

    subscription.status = SubscriptionStatus.PAST_DUE;
    await this.subscriptionRepository.save(subscription);

    // Send notification email
    if (subscription.organizationId) {
      const org = await this.organizationRepository.findOne({
        where: { id: subscription.organizationId },
      });
      if (org?.ownerId) {
        const owner = await this.userRepository.findOne({ where: { id: org.ownerId } });
        if (owner?.email) {
          try {
            await this.emailService.sendPaymentReminderEmail(
              owner.email,
              owner.firstName || owner.email.split('@')[0],
              {
                invoiceNumber: stripeInvoice.number || stripeInvoice.id,
                amount: (stripeInvoice.amount_due || 0) / 100,
                currency: (stripeInvoice.currency || 'usd').toUpperCase(),
                dueDate: new Date(),
                daysUntilDue: 0,
                daysOverdue: 0,
                planName: subscription.plan,
                organizationName: org.name || 'Votre organisation',
                isOverdue: true,
                reminderCount: 1,
              },
            );
          } catch (err) {
            this.logger.error(`Failed to send payment failed email: ${err.message}`);
          }
        }
      }
    }

    this.logger.warn(`Stripe payment failed for subscription ${subscription.id}, status set to PAST_DUE`);
  }

  /**
   * Handle customer.subscription.deleted
   */
  private async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      this.logger.warn(`No local subscription for deleted Stripe subscription: ${stripeSubscription.id}`);
      return;
    }

    // Downgrade to FREE
    subscription.plan = SubscriptionPlan.FREE;
    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.stripeSubscriptionId = null;
    subscription.limits = this.planService.getPlanLimits('free');
    subscription.features = this.planService.getPlanFeatures('free');
    subscription.metadata = {
      ...subscription.metadata,
      stripeCancellation: {
        cancelledAt: new Date().toISOString(),
        stripeSubscriptionId: stripeSubscription.id,
      },
    };

    await this.subscriptionRepository.save(subscription);

    // Clear caches
    if (subscription.organizationId) {
      await this.quotaEnforcementService.clearOrganizationCaches(subscription.organizationId);
    }
    if (subscription.userId) {
      await this.quotaEnforcementService.clearUserCaches(subscription.userId);
    }

    this.logger.log(`Stripe subscription deleted, downgraded to FREE: ${subscription.id}`);
  }

  /**
   * Sync local Plans to Stripe Products/Prices
   */
  async syncPlansToStripe(): Promise<{ synced: string[]; errors: string[] }> {
    const stripe = this.ensureStripe();
    const plans = await this.planRepository.find({ where: { isActive: true } });
    const synced: string[] = [];
    const errors: string[] = [];

    for (const plan of plans) {
      if (plan.code === 'free') continue; // Skip free plan

      try {
        // Create or update product
        let productId = plan.stripeProductId;
        if (!productId) {
          const product = await stripe.products.create({
            name: `WazeApp ${plan.name}`,
            description: plan.description || `WazeApp ${plan.name} plan`,
            metadata: { planCode: plan.code },
          });
          productId = product.id;
          plan.stripeProductId = productId;
        }

        // Create monthly price if needed
        if (!plan.stripePriceMonthlyId && plan.priceMonthlyUSD > 0) {
          const monthlyPrice = await stripe.prices.create({
            product: productId,
            unit_amount: plan.priceMonthlyUSD, // Already in cents
            currency: 'usd',
            recurring: { interval: 'month' },
            metadata: { planCode: plan.code, period: 'monthly' },
          });
          plan.stripePriceMonthlyId = monthlyPrice.id;
        }

        // Create annual price if needed
        if (!plan.stripePriceAnnualId && plan.priceAnnualUSD > 0) {
          // Annual price is the total annual price, Stripe bills it yearly
          const annualPrice = await stripe.prices.create({
            product: productId,
            unit_amount: plan.priceAnnualUSD, // Already in cents
            currency: 'usd',
            recurring: { interval: 'year' },
            metadata: { planCode: plan.code, period: 'annual' },
          });
          plan.stripePriceAnnualId = annualPrice.id;
        }

        await this.planRepository.save(plan);
        synced.push(plan.code);
        this.logger.log(`Synced plan ${plan.code} to Stripe (product: ${productId})`);
      } catch (err) {
        const msg = `Failed to sync plan ${plan.code}: ${err.message}`;
        errors.push(msg);
        this.logger.error(msg);
      }
    }

    return { synced, errors };
  }

  /**
   * Get Stripe publishable key for frontend
   */
  getPublishableKey(): string {
    return this.publishableKey;
  }

  /**
   * Check if Stripe is configured
   */
  isConfigured(): boolean {
    return this.stripe !== null;
  }
}
