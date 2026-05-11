import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import * as crypto from 'crypto';
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
   * Find an existing Stripe customer ID for a user (without creating one).
   * Returns null if no Stripe customer exists yet.
   */
  private async findExistingStripeCustomer(userId: string): Promise<string | null> {
    // Check user's direct subscription
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });
    if (subscription?.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    // Check organization subscription
    const org = await this.organizationRepository.findOne({ where: { ownerId: userId } });
    if (org) {
      const orgSub = await this.subscriptionRepository.findOne({
        where: { organizationId: org.id },
      });
      if (orgSub?.stripeCustomerId) {
        return orgSub.stripeCustomerId;
      }
    }

    return null;
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

    // Check if user already has a Stripe customer ID
    const existingCustomerId = await this.findExistingStripeCustomer(params.userId);

    // Resolve organizationId
    let organizationId = params.organizationId;
    if (!organizationId) {
      const org = await this.organizationRepository.findOne({ where: { ownerId: params.userId } });
      if (org) {
        organizationId = org.id;
      }
    }

    // Only offer trial for brand-new users who have NEVER had any subscription
    let trialDays = 0;
    const existingSubscriptionCount = await this.subscriptionRepository.count({
      where: organizationId
        ? { organizationId }
        : { userId: params.userId },
    });

    if (existingSubscriptionCount === 0) {
      trialDays = this.planService.getTrialDays(params.planCode.toLowerCase());
    }

    const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
      // If existing Stripe customer, reuse it; otherwise let user enter/edit email
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email }),
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

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { sessionId: session.id, url: session.url };
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

    const existingCustomerId = await this.findExistingStripeCustomer(params.userId);

    // Resolve organizationId
    let organizationId = params.organizationId;
    if (!organizationId) {
      const org = await this.organizationRepository.findOne({ where: { ownerId: params.userId } });
      if (org) {
        organizationId = org.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email }),
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

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { sessionId: session.id, url: session.url };
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
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.dispute.created':
        await this.handleChargeDispute(event.data.object as Stripe.Dispute);
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
    const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
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
   * Handle customer.subscription.updated (plan changes via Stripe Portal, auto-renewal updates, etc.)
   */
  private async handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      this.logger.debug(`No local subscription for updated Stripe subscription: ${stripeSubscription.id}`);
      return;
    }

    // Map Stripe status to local status
    const stripeStatus = stripeSubscription.status;
    let newStatus: SubscriptionStatus | null = null;

    if (stripeStatus === 'active') {
      newStatus = SubscriptionStatus.ACTIVE;
    } else if (stripeStatus === 'past_due') {
      newStatus = SubscriptionStatus.PAST_DUE;
    } else if (stripeStatus === 'canceled' || stripeStatus === 'unpaid') {
      newStatus = SubscriptionStatus.CANCELLED;
    } else if (stripeStatus === 'trialing') {
      newStatus = SubscriptionStatus.TRIALING;
    }

    if (newStatus && subscription.status !== newStatus) {
      this.logger.log(`Stripe subscription ${stripeSubscription.id} status changed: ${subscription.status} -> ${newStatus}`);
      subscription.status = newStatus;
    }

    // Update period dates from Stripe
    const currentPeriodEnd = (stripeSubscription as any).current_period_end;
    if (currentPeriodEnd) {
      subscription.nextBillingDate = new Date(currentPeriodEnd * 1000);
      subscription.endsAt = new Date(currentPeriodEnd * 1000);
    }

    const currentPeriodStart = (stripeSubscription as any).current_period_start;
    if (currentPeriodStart) {
      subscription.startsAt = new Date(currentPeriodStart * 1000);
    }

    // Check if plan changed via Stripe (e.g., user changed plan in Customer Portal)
    const stripeItems = stripeSubscription.items?.data;
    if (stripeItems?.length) {
      const priceId = stripeItems[0].price?.id;
      if (priceId) {
        // Look up which plan this price belongs to
        const plan = await this.planRepository.findOne({
          where: [
            { stripePriceMonthlyId: priceId },
            { stripePriceAnnualId: priceId },
          ],
        });
        if (plan) {
          const newPlan = plan.code.toLowerCase() as SubscriptionPlan;
          if (subscription.plan !== newPlan) {
            this.logger.log(`Plan changed via Stripe: ${subscription.plan} -> ${newPlan}`);
            subscription.plan = newPlan;
            // Sync limits/features from the new plan
            subscription.limits = this.planService.getPlanLimits(plan.code);
            subscription.features = this.planService.getPlanFeatures(plan.code);
          }
        }
      }
    }

    // Handle cancel_at_period_end
    if (stripeSubscription.cancel_at_period_end) {
      subscription.metadata = {
        ...subscription.metadata,
        cancelAtPeriodEnd: true,
        cancelAt: stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000).toISOString()
          : undefined,
      };
    } else if (subscription.metadata?.cancelAtPeriodEnd) {
      // Cancellation was reversed
      const { cancelAtPeriodEnd, cancelAt, ...restMetadata } = subscription.metadata;
      subscription.metadata = restMetadata;
    }

    await this.subscriptionRepository.save(subscription);

    // Clear caches
    if (subscription.organizationId) {
      await this.quotaEnforcementService.clearOrganizationCaches(subscription.organizationId);
    }
    if (subscription.userId) {
      await this.quotaEnforcementService.clearUserCaches(subscription.userId);
    }

    this.logger.log(`Stripe subscription updated: ${subscription.id} (status: ${subscription.status}, plan: ${subscription.plan})`);
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

    // Deactivate subscription (keep original plan name for display)
    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.stripeSubscriptionId = null;
    // Do NOT change plan - keep original so user sees what they had
    subscription.metadata = {
      ...subscription.metadata,
      stripeCancellation: {
        cancelledAt: new Date().toISOString(),
        stripeSubscriptionId: stripeSubscription.id,
        previousPlan: subscription.plan,
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
   * Handle charge.refunded - suspend subscription when a charge is refunded
   */
  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    this.logger.warn(`Stripe charge refunded: ${charge.id}, amount: ${charge.amount_refunded}`);

    // Find subscription by customer
    const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
    if (!customerId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: customerId, status: SubscriptionStatus.ACTIVE },
    });

    if (subscription) {
      subscription.status = SubscriptionStatus.PAST_DUE;
      subscription.metadata = {
        ...subscription.metadata,
        refund: {
          chargeId: charge.id,
          amountRefunded: charge.amount_refunded,
          refundedAt: new Date().toISOString(),
        },
      };
      await this.subscriptionRepository.save(subscription);

      if (subscription.organizationId) {
        await this.quotaEnforcementService.clearOrganizationCaches(subscription.organizationId);
      }
      this.logger.warn(`Subscription ${subscription.id} set to PAST_DUE due to refund`);
    }
  }

  /**
   * Handle charge.dispute.created - immediately suspend subscription
   */
  private async handleChargeDispute(dispute: Stripe.Dispute): Promise<void> {
    this.logger.warn(`Stripe charge dispute created: ${dispute.id}`);

    const charge = dispute.charge as Stripe.Charge;
    const customerId = typeof charge?.customer === 'string' ? charge.customer : charge?.customer?.id;
    if (!customerId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: customerId, status: SubscriptionStatus.ACTIVE },
    });

    if (subscription) {
      subscription.status = SubscriptionStatus.PAST_DUE;
      subscription.metadata = {
        ...subscription.metadata,
        dispute: {
          disputeId: dispute.id,
          reason: dispute.reason,
          createdAt: new Date().toISOString(),
        },
      };
      await this.subscriptionRepository.save(subscription);

      if (subscription.organizationId) {
        await this.quotaEnforcementService.clearOrganizationCaches(subscription.organizationId);
      }
      this.logger.warn(`Subscription ${subscription.id} set to PAST_DUE due to dispute`);
    }
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
            unit_amount: Math.round(plan.priceMonthlyUSD * 100), // DB stores whole dollars, Stripe expects cents
            currency: 'usd',
            recurring: { interval: 'month' },
            metadata: { planCode: plan.code, period: 'monthly' },
          });
          plan.stripePriceMonthlyId = monthlyPrice.id;
        }

        // Create annual price if needed
        if (!plan.stripePriceAnnualId && plan.priceAnnualUSD > 0) {
          const annualPrice = await stripe.prices.create({
            product: productId,
            unit_amount: Math.round(plan.priceAnnualUSD * 100), // DB stores whole dollars, Stripe expects cents
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
   * Renew subscription immediately by cancelling the current one and creating a new checkout
   */
  async renewSubscriptionNow(userId: string, organizationId: string): Promise<{ sessionId: string; url: string }> {
    const stripe = this.ensureStripe();

    // Find the active subscription for this org (with Stripe ID, most recent first)
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found for this organization');
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Subscription is not in a renewable state');
    }

    const planCode = subscription.plan;

    // Retrieve billing interval from Stripe before cancelling
    let billingPeriod: 'monthly' | 'annually' = 'monthly';
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const interval = stripeSub.items?.data?.[0]?.price?.recurring?.interval;
      if (interval === 'year') {
        billingPeriod = 'annually';
      }
    } catch (e) {
      this.logger.warn(`Could not retrieve Stripe subscription interval, defaulting to monthly: ${e.message}`);
    }

    // Cancel the current Stripe subscription immediately
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    this.logger.log(`Cancelled Stripe subscription ${subscription.stripeSubscriptionId} for immediate renewal`);

    // Create a new checkout session for the same plan
    const dashboardUrl = this.configService.get('DASHBOARD_URL') || 'https://app.wazeapp.ai';
    const result = await this.createCheckoutSession({
      userId,
      organizationId,
      planCode: planCode.toUpperCase(),
      billingPeriod: billingPeriod as 'monthly' | 'annually',
      successUrl: `${dashboardUrl}/dashboard?renewal=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${dashboardUrl}/dashboard?renewal=cancelled`,
    });

    return result;
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
