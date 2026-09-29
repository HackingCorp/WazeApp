import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, Organization, MessageCredit } from '../../common/entities';
import { MessageCreditStatus } from '../../common/entities/message-credit.entity';
import { MESSAGE_CREDIT_CONFIG } from '../subscriptions/message-credits.service';
import { CurrencyService } from './currency.service';
import {
  NkapPayService,
  NkapPayCreateResponse,
  NkapPayMethod,
} from './nkappay.service';

export type PlanCode = 'STANDARD' | 'PRO' | 'ENTERPRISE';
export type BillingPeriod = 'monthly' | 'annually';

/** Countries whose Nkap Pay settlement currency is one we price plans in directly. */
const NATIVE_CURRENCIES: Record<string, string> = {
  CM: 'XAF',
  CG: 'XAF',
  GA: 'XAF',
  BJ: 'XOF',
  CI: 'XOF',
  ML: 'XOF',
  NE: 'XOF',
  TG: 'XOF',
};

export interface NkapPayCheckoutOptions {
  country?: string;
  operator?: string;
  customerPhone?: string;
  paymentMethod?: NkapPayMethod;
  returnUrl?: string;
}

/**
 * Prices a Nkap Pay checkout on the server and builds its merchant reference.
 *
 * The generic /nkappay/initiate endpoint takes whatever amount the caller
 * sends, which is fine for ad-hoc use but not for selling plans: the webhook
 * grants a subscription from the reference alone, so a caller who chose both
 * would buy Enterprise for 100 XAF. Everything the customer-facing flows need
 * is derived here from the database instead, and verifyPaidAmount() lets the
 * webhook re-check the amount before it grants anything.
 */
@Injectable()
export class NkapPayCheckoutService {
  private readonly logger = new Logger(NkapPayCheckoutService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(MessageCredit)
    private readonly messageCreditRepository: Repository<MessageCredit>,
    private readonly nkapPayService: NkapPayService,
    private readonly currencyService: CurrencyService,
  ) {}

  /** Settlement currency for a country, defaulting to XAF. */
  private currencyFor(country?: string): string {
    return NATIVE_CURRENCIES[String(country || 'CM').toUpperCase()] || 'XAF';
  }

  /**
   * What a plan costs, in the currency the payment will settle in.
   *
   * XAF and XOF are pegged 1:1 to each other, so the stored XAF price is used
   * as-is for both; anything else goes through the USD price and the live rate.
   */
  async priceForPlan(
    planCode: PlanCode,
    billingPeriod: BillingPeriod,
    currency: string,
  ): Promise<number> {
    const plan = await this.planRepository.findOne({
      where: { code: planCode.toLowerCase() },
    });
    if (!plan) {
      throw new BadRequestException(`Plan ${planCode} introuvable`);
    }

    const upper = currency.toUpperCase();
    if (upper === 'XAF' || upper === 'XOF') {
      const price = billingPeriod === 'annually' ? plan.priceAnnualXAF : plan.priceMonthlyXAF;
      if (!price) {
        throw new BadRequestException(
          `Tarif ${upper} non configure pour le plan ${planCode} (${billingPeriod})`,
        );
      }
      return Math.round(price);
    }

    const usd = billingPeriod === 'annually' ? plan.priceAnnualUSD : plan.priceMonthlyUSD;
    if (!usd) {
      throw new BadRequestException(
        `Tarif USD non configure pour le plan ${planCode} (${billingPeriod})`,
      );
    }
    return Math.round(await this.currencyService.convertFromUSD(usd, upper));
  }

  /**
   * The reference the webhook parses back: WAZEAPP-{userId}-{PLAN}-{orgId}-{ts}.
   * The org segment is what makes the webhook upgrade the organisation rather
   * than the user alone, so it is always present for plan purchases.
   */
  private planReference(userId: string, planCode: PlanCode, organizationId: string): string {
    return `WAZEAPP-${userId}-${planCode}-${organizationId}-${Date.now()}`;
  }

  private async resolveOrganizationId(userId: string): Promise<string> {
    const org = await this.organizationRepository.findOne({ where: { ownerId: userId } });
    if (!org) {
      throw new BadRequestException("Aucune organisation trouvee pour cet utilisateur");
    }
    return org.id;
  }

  /**
   * Open a plan payment. The response carries paymentUrl for the hosted modes
   * and nothing to redirect to for DIRECT_API, where the customer approves on
   * their handset — callers must branch on paymentMode rather than assume.
   */
  async createSubscriptionPayment(
    user: { id: string; email?: string; firstName?: string; lastName?: string },
    planCode: PlanCode,
    billingPeriod: BillingPeriod,
    options: NkapPayCheckoutOptions = {},
  ): Promise<NkapPayCreateResponse & { planCode: PlanCode; billingPeriod: BillingPeriod }> {
    const organizationId = await this.resolveOrganizationId(user.id);
    const currency = this.currencyFor(options.country);
    const amount = await this.priceForPlan(planCode, billingPeriod, currency);

    const label = billingPeriod === 'annually' ? 'annuel' : 'mensuel';
    const result = await this.nkapPayService.createPayment({
      amount,
      currency,
      merchantReference: this.planReference(user.id, planCode, organizationId),
      description: `WazeApp ${planCode} - abonnement ${label}`,
      paymentMethod: options.paymentMethod,
      country: options.country,
      operator: options.operator,
      customerPhone: options.customerPhone,
      customerInfo: {
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        email: user.email,
        phone: options.customerPhone,
      },
      returnUrl: options.returnUrl,
      metadata: {
        userId: user.id,
        organizationId,
        planCode,
        billingPeriod,
        type: 'subscription',
      },
    });

    this.logger.log(
      `Nkap Pay ${planCode} ${billingPeriod} for org ${organizationId}: ${amount} ${currency} ` +
        `(${result.success ? result.reference : `refused: ${result.error}`})`,
    );

    return { ...result, planCode, billingPeriod };
  }

  /**
   * Open a message-credits payment. Credits are granted by the webhook, not
   * here — nothing is added to the balance until the money actually lands.
   */
  async createCreditsPayment(
    user: { id: string; email?: string; firstName?: string; lastName?: string },
    creditAmount: number,
    options: NkapPayCheckoutOptions = {},
  ): Promise<NkapPayCreateResponse & { creditAmount: number }> {
    if (!Number.isInteger(creditAmount) || creditAmount < MESSAGE_CREDIT_CONFIG.minimumPurchase) {
      throw new BadRequestException(
        `Achat minimum : ${MESSAGE_CREDIT_CONFIG.minimumPurchase} messages`,
      );
    }

    const organizationId = await this.resolveOrganizationId(user.id);
    const currency = this.currencyFor(options.country);
    const amount = await this.priceForCredits(creditAmount, currency);

    const result = await this.nkapPayService.createPayment({
      amount,
      currency,
      merchantReference: `WAZEAPP-${user.id}-CREDITS-${organizationId}-${creditAmount}-${Date.now()}`,
      description: `WazeApp - ${creditAmount.toLocaleString('fr-FR')} messages`,
      paymentMethod: options.paymentMethod,
      country: options.country,
      operator: options.operator,
      customerPhone: options.customerPhone,
      customerInfo: {
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        email: user.email,
        phone: options.customerPhone,
      },
      returnUrl: options.returnUrl,
      metadata: {
        userId: user.id,
        organizationId,
        creditAmount: String(creditAmount),
        type: 'message_credits',
      },
    });

    this.logger.log(
      `Nkap Pay ${creditAmount} credits for org ${organizationId}: ${amount} ${currency} ` +
        `(${result.success ? result.reference : `refused: ${result.error}`})`,
    );

    return { ...result, creditAmount };
  }

  async priceForCredits(creditAmount: number, currency: string): Promise<number> {
    const upper = currency.toUpperCase();
    if (upper === 'XAF' || upper === 'XOF') {
      return Math.round(creditAmount * MESSAGE_CREDIT_CONFIG.pricePerMessageXAF);
    }
    return Math.round(
      await this.currencyService.convertFromUSD(
        creditAmount * MESSAGE_CREDIT_CONFIG.pricePerMessageUSD,
        upper,
      ),
    );
  }

  /**
   * Guard the webhook: the reference says what was bought, the payload says
   * what was paid, and only the payload is beyond the buyer's reach.
   *
   * A 2% shortfall is tolerated because an FX rate can move between the moment
   * the payment is opened and the moment it settles.
   */
  async verifyPaidAmount(
    planCode: PlanCode,
    billingPeriod: BillingPeriod,
    paidAmount: number,
    currency: string,
  ): Promise<boolean> {
    try {
      const expected = await this.priceForPlan(planCode, billingPeriod, currency || 'XAF');
      return Number(paidAmount) >= expected * 0.98;
    } catch (error) {
      // An unpriceable currency is not proof of fraud; let the upgrade proceed
      // rather than strand a customer who has genuinely paid.
      this.logger.warn(
        `Could not verify paid amount for ${planCode}/${currency}: ${error.message}`,
      );
      return true;
    }
  }

  /**
   * Add message credits once a payment has completed. Keyed on the transaction
   * id so a webhook delivered twice does not credit twice.
   */
  async grantCredits(
    organizationId: string,
    creditAmount: number,
    transactionId: string,
    reference: string,
  ): Promise<void> {
    const existing = await this.messageCreditRepository.findOne({ where: { transactionId } });
    if (existing) {
      this.logger.log(`Credits already granted for ${transactionId}, skipping`);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MESSAGE_CREDIT_CONFIG.expirationDays);

    await this.messageCreditRepository.save(
      this.messageCreditRepository.create({
        organizationId,
        amount: creditAmount,
        remaining: creditAmount,
        used: 0,
        status: MessageCreditStatus.ACTIVE,
        expiresAt,
        pricePerMessageXAF: MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
        totalAmountXAF: creditAmount * MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
        transactionId,
        paymentMethod: 'nkappay',
        metadata: { paymentProvider: 'nkappay', notes: `Nkap Pay: ${reference}` },
      }),
    );

    this.logger.log(`Created ${creditAmount} message credits for org ${organizationId} via Nkap Pay`);
  }
}
