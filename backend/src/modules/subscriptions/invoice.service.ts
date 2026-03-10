import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Invoice, InvoiceStatus, Subscription, Organization, User, OrganizationMember } from '../../common/entities';
import { SubscriptionStatus, UserRole } from '../../common/enums';
import { PlanService } from './plan.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
    @Inject(forwardRef(() => PlanService))
    private readonly planService: PlanService,
    private readonly emailService: EmailService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Generate invoice number
   */
  private generateInvoiceNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INV-${year}${month}-${random}`;
  }

  /**
   * Create a new invoice for a subscription
   */
  async createInvoice(
    subscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Invoice> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['organization'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const planCode = subscription.plan.toLowerCase();
    const priceXAF = this.planService.getPlanPriceXAF(planCode);
    const priceInCents = priceXAF * 100; // Convert to cents

    if (priceXAF === 0) {
      // Don't create invoices for free plans
      return null;
    }

    // Check if invoice already exists for this period
    const existingInvoice = await this.invoiceRepository.findOne({
      where: {
        subscriptionId,
        periodStart,
      },
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    const dueDate = new Date(periodStart);
    dueDate.setDate(dueDate.getDate() + 7); // Due 7 days after period start

    const invoice = this.invoiceRepository.create({
      invoiceNumber: this.generateInvoiceNumber(),
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      status: InvoiceStatus.PENDING,
      amountInCents: priceInCents,
      currency: 'XAF',
      description: `Abonnement ${subscription.plan} - ${this.formatDateRange(periodStart, periodEnd)}`,
      periodStart,
      periodEnd,
      dueDate,
      lineItems: [
        {
          description: `Plan ${subscription.plan}`,
          quantity: 1,
          unitPrice: priceInCents,
          total: priceInCents,
        },
      ],
      taxAmountInCents: 0,
      discountAmountInCents: 0,
      totalAmountInCents: priceInCents,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);
    this.logger.log(`Created invoice ${savedInvoice.invoiceNumber} for subscription ${subscriptionId}`);

    return savedInvoice;
  }

  /**
   * Create a trial invoice - due at end of trial period
   */
  async createTrialInvoice(subscription: Subscription): Promise<Invoice | null> {
    const planCode = subscription.plan.toLowerCase();
    const priceXAF = this.planService.getPlanPriceXAF(planCode);
    const priceInCents = priceXAF * 100;

    if (priceXAF === 0) return null;

    const now = new Date();
    const trialEndsAt = subscription.trialEndsAt || now;
    const periodEnd = new Date(trialEndsAt);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const invoice = this.invoiceRepository.create({
      invoiceNumber: this.generateInvoiceNumber(),
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      status: InvoiceStatus.PENDING,
      amountInCents: priceInCents,
      currency: 'XAF',
      description: `Abonnement ${subscription.plan} - Premiere facture (periode d'essai)`,
      periodStart: trialEndsAt,
      periodEnd,
      dueDate: trialEndsAt,
      lineItems: [
        {
          description: `Plan ${subscription.plan} - Activation apres essai gratuit`,
          quantity: 1,
          unitPrice: priceInCents,
          total: priceInCents,
        },
      ],
      taxAmountInCents: 0,
      discountAmountInCents: 0,
      totalAmountInCents: priceInCents,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);
    this.logger.log(`Created trial invoice ${savedInvoice.invoiceNumber} for subscription ${subscription.id}`);

    return savedInvoice;
  }

  /**
   * Get all invoices for an organization
   */
  async getOrganizationInvoices(organizationId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string, organizationId: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId, organizationId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Get pending invoices for an organization
   */
  async getPendingInvoices(organizationId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: {
        organizationId,
        status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      },
      order: { dueDate: 'ASC' },
    });
  }

  /**
   * Mark invoice as paid
   * This also resets the billing cycle and clears quota caches
   */
  async markAsPaid(
    invoiceId: string,
    paymentMethod: string,
    paymentReference: string,
  ): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
      relations: ['subscription'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    invoice.paymentMethod = paymentMethod;
    invoice.paymentReference = paymentReference;

    const savedInvoice = await this.invoiceRepository.save(invoice);

    // Update subscription - reset billing cycle properly
    if (invoice.subscription) {
      // Set startsAt to periodStart to properly reset the billing cycle
      // This ensures quota counting starts fresh from the new period
      invoice.subscription.startsAt = invoice.periodStart;

      // nextBillingDate is the end of the paid period (when next invoice is due)
      invoice.subscription.nextBillingDate = invoice.periodEnd;
      invoice.subscription.status = SubscriptionStatus.ACTIVE;

      await this.subscriptionRepository.save(invoice.subscription);

      // Clear subscription and quota caches to ensure fresh data is used
      const organizationId = invoice.subscription.organizationId;
      const userId = invoice.subscription.userId;

      if (organizationId) {
        await this.cacheManager.del(`subscription:org:${organizationId}`);
        await this.cacheManager.del(`quota:whatsapp:org:${organizationId}`);
        this.logger.log(`Cleared subscription and quota caches for organization ${organizationId}`);
      }

      if (userId) {
        await this.cacheManager.del(`subscription:user:${userId}`);
        this.logger.log(`Cleared subscription cache for user ${userId}`);
      }

      this.logger.log(
        `Updated subscription ${invoice.subscriptionId}: startsAt=${invoice.periodStart}, nextBillingDate=${invoice.periodEnd}`,
      );
    }

    this.logger.log(`Invoice ${invoice.invoiceNumber} marked as paid via ${paymentMethod}`);

    return savedInvoice;
  }

  /**
   * Get billing summary for an organization
   */
  async getBillingSummary(organizationId: string): Promise<{
    currentPlan: string;
    nextBillingDate: Date | null;
    nextAmount: number;
    currency: string;
    pendingInvoices: number;
    totalDue: number;
    billingPeriod: { start: Date; end: Date } | null;
  }> {
    // Find subscription: prefer ACTIVE/TRIALING, fall back to most recent (any status)
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]) },
      order: { createdAt: 'DESC' },
    });
    if (!subscription) {
      subscription = await this.subscriptionRepository.findOne({
        where: { organizationId },
        order: { updatedAt: 'DESC' },
      });
    }

    const pendingInvoices = await this.invoiceRepository.count({
      where: {
        organizationId,
        status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      },
    });

    const totalDueResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('SUM(invoice.totalAmountInCents)', 'total')
      .where('invoice.organizationId = :organizationId', { organizationId })
      .andWhere('invoice.status IN (:...statuses)', {
        statuses: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE],
      })
      .getRawOne();

    const planCode = subscription?.plan?.toLowerCase() || 'free';
    const priceXAF = this.planService.getPlanPriceXAF(planCode);
    const nextAmount = priceXAF * 100; // Convert to cents

    // Calculate current billing period
    let billingPeriod = null;
    let nextBillingDate: Date | null = null;

    if (subscription?.startsAt) {
      const now = new Date();
      const subscriptionStart = new Date(subscription.startsAt);
      const daysSinceStart = Math.floor(
        (now.getTime() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const completeCycles = Math.floor(daysSinceStart / 30);

      const periodStart = new Date(subscriptionStart);
      periodStart.setDate(periodStart.getDate() + (completeCycles * 30));

      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 30);

      billingPeriod = { start: periodStart, end: periodEnd };

      // Next billing date is the end of current period
      nextBillingDate = periodEnd;
    }

    return {
      currentPlan: subscription?.plan || 'FREE',
      nextBillingDate,
      nextAmount,
      currency: 'XAF',
      pendingInvoices,
      totalDue: parseInt(totalDueResult?.total) || 0,
      billingPeriod,
    };
  }

  /**
   * Create an invoice for message credits purchase
   */
  async createCreditInvoice(data: {
    organizationId: string;
    amount: number;
    currency: string;
    description: string;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    paymentReference?: string;
    metadata?: Record<string, any>;
  }): Promise<Invoice> {
    const amountInCents = Math.round(data.amount * 100);
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = this.invoiceRepository.create({
      invoiceNumber: this.generateInvoiceNumber(),
      organizationId: data.organizationId,
      status: InvoiceStatus.PAID, // Credits are pre-paid
      amountInCents,
      currency: data.currency,
      description: data.description,
      periodStart: now,
      periodEnd: now,
      dueDate: now,
      paidAt: now,
      paymentMethod: 'mobile_money',
      paymentReference: data.paymentReference,
      lineItems: data.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: Math.round(item.unitPrice * 100),
        total: Math.round(item.total * 100),
      })),
      taxAmountInCents: 0,
      discountAmountInCents: 0,
      totalAmountInCents: amountInCents,
      metadata: data.metadata,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);
    this.logger.log(`Created credit invoice ${savedInvoice.invoiceNumber} for organization ${data.organizationId}`);

    return savedInvoice;
  }

  /**
   * Cron job: Check for overdue invoices and update status
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueInvoices(): Promise<void> {
    const now = new Date();

    const overdueInvoices = await this.invoiceRepository.find({
      where: {
        status: InvoiceStatus.PENDING,
        dueDate: LessThanOrEqual(now),
      },
    });

    for (const invoice of overdueInvoices) {
      invoice.status = InvoiceStatus.OVERDUE;
      await this.invoiceRepository.save(invoice);
      this.logger.warn(`Invoice ${invoice.invoiceNumber} is now overdue`);
    }

    if (overdueInvoices.length > 0) {
      this.logger.log(`Marked ${overdueInvoices.length} invoices as overdue`);
    }
  }

  /**
   * Cron job: Generate renewal invoices 10 days before subscription end
   * Also runs at startup to catch any missed invoices
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateUpcomingInvoices(): Promise<void> {
    this.logger.log('Checking for subscriptions needing renewal invoices...');

    // Find active paid subscriptions
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
      },
    });

    const now = new Date();
    const DAYS_BEFORE_RENEWAL = 10; // Generate invoice 10 days before end

    for (const subscription of subscriptions) {
      // Skip Stripe-managed subscriptions — Stripe handles renewal automatically
      if (subscription.stripeSubscriptionId) continue;

      const planCode = subscription.plan.toLowerCase();
      const planPrice = this.planService.getPlanPriceXAF(planCode);
      if (planCode === 'free' || planPrice === 0) continue;

      // Calculate current billing period
      const subscriptionStart = new Date(subscription.startsAt);
      const daysSinceStart = Math.floor(
        (now.getTime() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const completeCycles = Math.floor(daysSinceStart / 30);

      // Current period
      const currentPeriodStart = new Date(subscriptionStart);
      currentPeriodStart.setDate(currentPeriodStart.getDate() + (completeCycles * 30));

      const currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      // Days until current period ends
      const daysUntilEnd = Math.ceil(
        (currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Generate renewal invoice 10 days before current period ends (or if we're past that point but still in period)
      if (daysUntilEnd <= DAYS_BEFORE_RENEWAL && daysUntilEnd > 0) {
        // Next period (renewal period)
        const nextPeriodStart = new Date(currentPeriodEnd);
        nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);

        const nextPeriodEnd = new Date(nextPeriodStart);
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);

        // Check if we already have ANY pending/overdue invoice for this subscription's next period
        // Use a date range to account for slight date variations
        const invoiceSearchStart = new Date(currentPeriodEnd);
        invoiceSearchStart.setDate(invoiceSearchStart.getDate() - 1);
        const invoiceSearchEnd = new Date(currentPeriodEnd);
        invoiceSearchEnd.setDate(invoiceSearchEnd.getDate() + 3);

        const existingInvoice = await this.invoiceRepository
          .createQueryBuilder('invoice')
          .where('invoice.subscriptionId = :subscriptionId', { subscriptionId: subscription.id })
          .andWhere('invoice.periodStart >= :searchStart', { searchStart: invoiceSearchStart })
          .andWhere('invoice.periodStart <= :searchEnd', { searchEnd: invoiceSearchEnd })
          .getOne();

        if (!existingInvoice) {
          try {
            const invoice = await this.createInvoice(subscription.id, nextPeriodStart, nextPeriodEnd);
            if (invoice) {
              this.logger.log(
                `📄 Created renewal invoice ${invoice.invoiceNumber} for subscription ${subscription.id} ` +
                `(${daysUntilEnd} days before current period ends)`,
              );

              // Send initial invoice email
              await this.sendNewInvoiceEmail(invoice, subscription);
            }
          } catch (error) {
            this.logger.error(
              `Failed to create renewal invoice for subscription ${subscription.id}: ${error.message}`,
            );
          }
        }
      }
    }
  }

  /**
   * Force generate renewal invoice for a specific subscription (admin/manual use)
   */
  async forceGenerateRenewalInvoice(subscriptionId: string): Promise<Invoice | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const planCode = subscription.plan.toLowerCase();
    const planPrice = this.planService.getPlanPriceXAF(planCode);
    if (planCode === 'free' || planPrice === 0) {
      return null;
    }

    const now = new Date();
    const subscriptionStart = new Date(subscription.startsAt);
    const daysSinceStart = Math.floor(
      (now.getTime() - subscriptionStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const completeCycles = Math.floor(daysSinceStart / 30);

    // Current period end
    const currentPeriodStart = new Date(subscriptionStart);
    currentPeriodStart.setDate(currentPeriodStart.getDate() + (completeCycles * 30));
    const currentPeriodEnd = new Date(currentPeriodStart);
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

    // Next period
    const nextPeriodStart = new Date(currentPeriodEnd);
    nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
    const nextPeriodEnd = new Date(nextPeriodStart);
    nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30);

    const invoice = await this.createInvoice(subscription.id, nextPeriodStart, nextPeriodEnd);
    if (invoice) {
      this.logger.log(`📄 Force-created renewal invoice ${invoice.invoiceNumber} for subscription ${subscriptionId}`);
      await this.sendNewInvoiceEmail(invoice, subscription);
    }
    return invoice;
  }

  /**
   * Mark multiple invoices as paid by their IDs
   */
  async markMultipleAsPaid(
    invoiceIds: string[],
    paymentMethod: string,
    paymentReference: string,
  ): Promise<Invoice[]> {
    const results: Invoice[] = [];
    for (const invoiceId of invoiceIds) {
      try {
        const invoice = await this.markAsPaid(invoiceId, paymentMethod, paymentReference);
        results.push(invoice);
      } catch (error) {
        this.logger.error(`Failed to mark invoice ${invoiceId} as paid: ${error.message}`);
      }
    }
    return results;
  }

  /**
   * Send email notification for a new invoice
   */
  private async sendNewInvoiceEmail(invoice: Invoice, subscription: Subscription): Promise<void> {
    try {
      const recipients = await this.getOrganizationEmailRecipients(invoice.organizationId);

      if (recipients.length === 0) {
        this.logger.warn(`No email recipients found for organization ${invoice.organizationId}`);
        return;
      }

      const organization = await this.organizationRepository.findOne({
        where: { id: invoice.organizationId },
      });

      for (const user of recipients) {
        if (user.email) {
          await this.emailService.sendNewInvoiceEmail(
            user.email,
            user.firstName || user.email.split('@')[0],
            {
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.totalAmountInCents / 100,
              currency: invoice.currency,
              dueDate: invoice.dueDate,
              planName: subscription.plan,
              organizationName: organization?.name || 'Votre organisation',
              periodStart: invoice.periodStart,
              periodEnd: invoice.periodEnd,
            },
          );
        }
      }

      this.logger.log(`📧 New invoice email sent for ${invoice.invoiceNumber} to ${recipients.length} recipient(s)`);
    } catch (error) {
      this.logger.error(`Failed to send new invoice email: ${error.message}`);
    }
  }

  /**
   * Cron job: Send payment reminders continuously until paid
   * Runs every day at 9AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendPaymentReminders(): Promise<void> {
    const now = new Date();

    // Find pending invoices that need reminders
    const pendingInvoices = await this.invoiceRepository.find({
      where: {
        status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      },
      relations: ['organization', 'subscription'],
    });

    for (const invoice of pendingInvoices) {
      // Skip invoices for Stripe-managed subscriptions
      if (invoice.subscription?.stripeSubscriptionId) continue;

      const daysUntilDue = Math.ceil(
        (invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate days since last reminder
      const daysSinceLastReminder = invoice.lastReminderSentAt
        ? Math.floor((now.getTime() - invoice.lastReminderSentAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999; // Large number if never sent

      // Determine reminder frequency based on urgency:
      // - Before due date: remind at 7, 5, 3, 2, 1 days before
      // - After due date (overdue): remind every day for first week, then every 2 days
      let shouldSendReminder = false;

      if (daysUntilDue > 0) {
        // Before due date - specific days
        const reminderDays = [7, 5, 3, 2, 1];
        shouldSendReminder = reminderDays.includes(daysUntilDue) && daysSinceLastReminder >= 1;
      } else {
        // Overdue - continuous reminders
        const daysOverdue = Math.abs(daysUntilDue);

        if (daysOverdue <= 7) {
          // First week overdue: remind every day
          shouldSendReminder = daysSinceLastReminder >= 1;
        } else if (daysOverdue <= 14) {
          // Second week overdue: remind every 2 days
          shouldSendReminder = daysSinceLastReminder >= 2;
        } else {
          // After 2 weeks: remind every 3 days (avoid spam but keep reminding)
          shouldSendReminder = daysSinceLastReminder >= 3;
        }
      }

      if (shouldSendReminder) {
        try {
          // Get organization owners/admins to send email
          const recipients = await this.getOrganizationEmailRecipients(invoice.organizationId);

          if (recipients.length === 0) {
            this.logger.warn(`No email recipients found for organization ${invoice.organizationId}, skipping reminder`);
            continue;
          }

          // Send email to each admin/owner
          const isOverdue = daysUntilDue <= 0;
          const planName = invoice.subscription?.plan || 'Standard';
          const daysOverdue = isOverdue ? Math.abs(daysUntilDue) : 0;

          for (const user of recipients) {
            if (user.email) {
              await this.emailService.sendPaymentReminderEmail(
                user.email,
                user.firstName || user.email.split('@')[0],
                {
                  invoiceNumber: invoice.invoiceNumber,
                  amount: invoice.totalAmountInCents / 100,
                  currency: invoice.currency,
                  dueDate: invoice.dueDate,
                  daysUntilDue,
                  daysOverdue,
                  planName,
                  organizationName: invoice.organization?.name || 'Votre organisation',
                  isOverdue,
                  reminderCount: invoice.remindersSent + 1,
                },
              );
            }
          }

          this.logger.log(
            `✅ Payment reminder #${invoice.remindersSent + 1} sent for invoice ${invoice.invoiceNumber} ` +
            `(${invoice.organization?.name || 'Unknown'}) - ` +
            `${isOverdue ? `${daysOverdue} days overdue` : `Due in ${daysUntilDue} days`} - ` +
            `Amount: ${invoice.totalAmountInCents / 100} ${invoice.currency} - ` +
            `Sent to ${recipients.length} recipient(s)`,
          );
        } catch (error) {
          this.logger.error(
            `❌ Failed to send payment reminder for invoice ${invoice.invoiceNumber}: ${error.message}`,
          );
        }

        invoice.remindersSent++;
        invoice.lastReminderSentAt = now;
        await this.invoiceRepository.save(invoice);
      }
    }
  }

  // Helper methods
  private formatDateRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('fr-FR', options)} - ${end.toLocaleDateString('fr-FR', options)}`;
  }

  /**
   * Get organization admins (owners and admins) who should receive billing emails
   */
  private async getOrganizationEmailRecipients(organizationId: string): Promise<User[]> {
    // First try to get owners and admins
    const adminMembers = await this.memberRepository.find({
      where: {
        organizationId,
        role: In([UserRole.OWNER, UserRole.ADMIN]),
        isActive: true,
      },
      relations: ['user'],
    });

    let recipients = adminMembers
      .filter(m => m.user && m.user.email)
      .map(m => m.user);

    // Fallback: if no admins found, get any active member
    if (recipients.length === 0) {
      const anyMember = await this.memberRepository.findOne({
        where: {
          organizationId,
          isActive: true,
        },
        relations: ['user'],
      });

      if (anyMember?.user?.email) {
        recipients = [anyMember.user];
      }
    }

    this.logger.debug(`Found ${recipients.length} email recipient(s) for organization ${organizationId}`);
    return recipients;
  }
}
