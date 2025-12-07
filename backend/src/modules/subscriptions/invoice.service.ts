import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Invoice, InvoiceStatus, Subscription, Organization } from '../../common/entities';
import { SubscriptionStatus } from '../../common/enums';

// Pricing in XAF (CFA Francs)
const PLAN_PRICES = {
  free: 0,
  standard: 5000,   // 5,000 XAF/month
  pro: 15000,       // 15,000 XAF/month
  enterprise: 50000, // 50,000 XAF/month
};

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

    const plan = subscription.plan.toLowerCase();
    const priceInCents = (PLAN_PRICES[plan] || 0) * 100; // Convert to cents

    if (priceInCents === 0) {
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

    // Update subscription - reset quotas by updating nextBillingDate
    if (invoice.subscription) {
      const nextBillingDate = new Date(invoice.periodEnd);
      nextBillingDate.setDate(nextBillingDate.getDate() + 1);

      invoice.subscription.nextBillingDate = nextBillingDate;
      invoice.subscription.status = SubscriptionStatus.ACTIVE;
      await this.subscriptionRepository.save(invoice.subscription);

      this.logger.log(
        `Updated subscription ${invoice.subscriptionId} next billing date to ${nextBillingDate}`,
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
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

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

    const plan = subscription?.plan?.toLowerCase() || 'free';
    const nextAmount = (PLAN_PRICES[plan] || 0) * 100; // Convert to cents

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
   * Cron job: Generate invoices for upcoming billing periods
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateUpcomingInvoices(): Promise<void> {
    this.logger.log('Checking for subscriptions needing invoices...');

    // Find active paid subscriptions
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
      },
    });

    for (const subscription of subscriptions) {
      const plan = subscription.plan.toLowerCase();
      if (plan === 'free' || !PLAN_PRICES[plan]) continue;

      // Calculate next billing period
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

      // Check if we need to create an invoice for current period
      const existingInvoice = await this.invoiceRepository.findOne({
        where: {
          subscriptionId: subscription.id,
          periodStart,
        },
      });

      if (!existingInvoice) {
        try {
          await this.createInvoice(subscription.id, periodStart, periodEnd);
        } catch (error) {
          this.logger.error(
            `Failed to create invoice for subscription ${subscription.id}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Cron job: Send payment reminders
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendPaymentReminders(): Promise<void> {
    const now = new Date();

    // Find pending invoices that need reminders
    const pendingInvoices = await this.invoiceRepository.find({
      where: {
        status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      },
      relations: ['organization'],
    });

    for (const invoice of pendingInvoices) {
      const daysUntilDue = Math.ceil(
        (invoice.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Send reminders at specific intervals: 7 days, 3 days, 1 day before, and 1 day after
      const shouldSendReminder =
        (daysUntilDue === 7 && invoice.remindersSent < 1) ||
        (daysUntilDue === 3 && invoice.remindersSent < 2) ||
        (daysUntilDue === 1 && invoice.remindersSent < 3) ||
        (daysUntilDue <= 0 && invoice.remindersSent < 4);

      if (shouldSendReminder) {
        // TODO: Send actual email/notification here
        this.logger.log(
          `Payment reminder for invoice ${invoice.invoiceNumber} ` +
          `(${invoice.organization?.name || 'Unknown'}) - ` +
          `Due in ${daysUntilDue} days - Amount: ${invoice.totalAmountInCents / 100} ${invoice.currency}`,
        );

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
}
