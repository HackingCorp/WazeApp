import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
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

/**
 * Settlement currency per country, as Nkap Pay publishes it. Kept as a
 * fallback for when the live list cannot be fetched; the live list wins.
 */
const FALLBACK_COUNTRY_CURRENCY: Record<string, string> = {
  CM: 'XAF', CG: 'XAF', GA: 'XAF',
  BJ: 'XOF', CI: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF',
  CD: 'CDF', GN: 'GNF', UG: 'UGX',
};

/** International dialling prefix → country, for profiles that only carry a phone. */
const PHONE_PREFIX_COUNTRY: Record<string, string> = {
  '237': 'CM', '242': 'CG', '241': 'GA',
  '229': 'BJ', '225': 'CI', '223': 'ML', '227': 'NE', '228': 'TG',
  '243': 'CD', '224': 'GN', '256': 'UG',
};

const COUNTRIES_CACHE_MS = 10 * 60 * 1000;

export interface PaymentCustomer {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  /** ISO 3166-1 alpha-2, when the profile has one. */
  country?: string;
  phone?: string;
}

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
 * Two things the caller is not trusted with:
 *
 * - The amount. The generic /nkappay/initiate endpoint takes whatever amount
 *   the caller sends; the webhook grants a subscription from the reference
 *   alone, so a caller choosing both would buy Enterprise for 100 XAF. Plans
 *   and credits are priced from the database here, and verifyPaidAmount()
 *   lets the webhook re-check before granting anything.
 *
 * - The currency. Nkap Pay never converts: a payment opened in XAF for an
 *   Ivorian customer is refused outright (CURRENCY_NOT_SUPPORTED), so the
 *   country has to be settled *before* the payment exists. It is taken from
 *   the request, else the profile, else the phone prefix — and if none of
 *   those know, the caller is told to ask rather than guess Cameroon.
 */
@Injectable()
export class NkapPayCheckoutService {
  private readonly logger = new Logger(NkapPayCheckoutService.name);
  private countriesCache: { at: number; byCode: Map<string, any> } | null = null;

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

  // ---------------------------------------------------------------------------
  // Country and currency
  // ---------------------------------------------------------------------------

  /** Live country list from Nkap Pay, refreshed every few minutes. */
  private async countries(): Promise<Map<string, any>> {
    if (this.countriesCache && Date.now() - this.countriesCache.at < COUNTRIES_CACHE_MS) {
      return this.countriesCache.byCode;
    }
    try {
      const list: any[] = await this.nkapPayService.getCountries();
      const byCode = new Map<string, any>();
      for (const c of list || []) {
        if (c?.code) byCode.set(String(c.code).toUpperCase(), c);
      }
      if (byCode.size) this.countriesCache = { at: Date.now(), byCode };
      return byCode;
    } catch (error) {
      this.logger.warn(`Nkap Pay country list unavailable, using fallback: ${error.message}`);
      return this.countriesCache?.byCode || new Map();
    }
  }

  /**
   * Work out where the customer pays from. Explicit choice first, then the
   * profile, then the phone's dialling prefix. Returns null when nothing knows.
   */
  async resolveCountry(
    requested: string | undefined,
    customer: PaymentCustomer,
  ): Promise<string | null> {
    const fromRequest = String(requested || '').trim().toUpperCase();
    if (fromRequest) return fromRequest;

    const fromProfile = String(customer.country || '').trim().toUpperCase();
    if (fromProfile) return fromProfile;

    const digits = String(customer.phone || '').replace(/\D/g, '');
    const prefix = Object.keys(PHONE_PREFIX_COUNTRY).find((p) => digits.startsWith(p));
    return prefix ? PHONE_PREFIX_COUNTRY[prefix] : null;
  }

  /** Whether Nkap Pay can collect from this country at all. */
  async isSupportedCountry(country: string): Promise<boolean> {
    const live = await this.countries();
    if (live.size) return live.has(country);
    return country in FALLBACK_COUNTRY_CURRENCY;
  }

  /** The currency Nkap Pay settles in for a country. */
  async currencyFor(country: string): Promise<string> {
    const live = (await this.countries()).get(country);
    const currency = live?.currency || FALLBACK_COUNTRY_CURRENCY[country];
    if (!currency) {
      throw new BadRequestException(`Pays ${country} non pris en charge par Nkap Pay`);
    }
    return String(currency).toUpperCase();
  }

  /**
   * Resolve country + currency for a checkout, refusing to guess.
   * COUNTRY_REQUIRED is what the dashboard keys on to show its selector.
   */
  private async settleCountry(
    requested: string | undefined,
    customer: PaymentCustomer,
  ): Promise<{ country: string; currency: string }> {
    const country = await this.resolveCountry(requested, customer);
    if (!country) {
      throw new HttpException(
        {
          message: 'Pays de paiement requis : indiquez le pays depuis lequel vous payez.',
          failureCode: 'COUNTRY_REQUIRED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!(await this.isSupportedCountry(country))) {
      throw new HttpException(
        {
          message: `Nkap Pay n'est pas disponible pour le pays ${country}. Utilisez un autre moyen de paiement.`,
          failureCode: 'COUNTRY_NOT_SUPPORTED',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { country, currency: await this.currencyFor(country) };
  }

  // ---------------------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Checkouts
  // ---------------------------------------------------------------------------

  /**
   * The reference the webhook parses back: WAZEAPP-{userId}-{PLAN}-{orgId}-{ts}.
   * The org segment is what makes the webhook upgrade the organisation rather
   * than the user alone, so it is always present for plan purchases.
   */
  private planReference(userId: string, planCode: PlanCode, organizationId: string): string {
    return `WAZEAPP-${userId}-${planCode}-${organizationId}-${Date.now()}`;
  }

  private async resolveOrganizationId(userId: string): Promise<string> {
    if (!userId) {
      throw new BadRequestException('Utilisateur non identifie');
    }
    const org = await this.organizationRepository.findOne({ where: { ownerId: userId } });
    if (!org) {
      throw new BadRequestException("Aucune organisation trouvee pour cet utilisateur");
    }
    return org.id;
  }

  private customerInfo(customer: PaymentCustomer, phone?: string) {
    return {
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined,
      email: customer.email,
      phone: phone || customer.phone,
    };
  }

  /**
   * Open a plan payment. The response carries paymentUrl for the hosted modes
   * and nothing to redirect to for DIRECT_API, where the customer approves on
   * their handset — callers must branch on paymentMode rather than assume.
   */
  async createSubscriptionPayment(
    customer: PaymentCustomer,
    planCode: PlanCode,
    billingPeriod: BillingPeriod,
    options: NkapPayCheckoutOptions = {},
  ): Promise<NkapPayCreateResponse & { planCode: PlanCode; billingPeriod: BillingPeriod }> {
    const organizationId = await this.resolveOrganizationId(customer.id);
    const { country, currency } = await this.settleCountry(options.country, customer);
    const amount = await this.priceForPlan(planCode, billingPeriod, currency);

    const label = billingPeriod === 'annually' ? 'annuel' : 'mensuel';
    const result = await this.nkapPayService.createPayment({
      amount,
      currency,
      country,
      merchantReference: this.planReference(customer.id, planCode, organizationId),
      description: `WazeApp ${planCode} - abonnement ${label}`,
      paymentMethod: options.paymentMethod,
      operator: options.operator,
      customerPhone: options.customerPhone,
      customerInfo: this.customerInfo(customer, options.customerPhone),
      returnUrl: options.returnUrl,
      metadata: {
        userId: customer.id,
        organizationId,
        planCode,
        billingPeriod,
        type: 'subscription',
      },
    });

    this.logger.log(
      `Nkap Pay ${planCode} ${billingPeriod} for org ${organizationId} (${country}): ${amount} ${currency} ` +
        `(${result.success ? result.reference : `refused: ${result.error}`})`,
    );

    return { ...result, planCode, billingPeriod };
  }

  /**
   * Open a message-credits payment. Credits are granted by the webhook, not
   * here — nothing is added to the balance until the money actually lands.
   */
  async createCreditsPayment(
    customer: PaymentCustomer,
    creditAmount: number,
    options: NkapPayCheckoutOptions = {},
  ): Promise<NkapPayCreateResponse & { creditAmount: number }> {
    if (!Number.isInteger(creditAmount) || creditAmount < MESSAGE_CREDIT_CONFIG.minimumPurchase) {
      throw new BadRequestException(
        `Achat minimum : ${MESSAGE_CREDIT_CONFIG.minimumPurchase} messages`,
      );
    }

    const organizationId = await this.resolveOrganizationId(customer.id);
    const { country, currency } = await this.settleCountry(options.country, customer);
    const amount = await this.priceForCredits(creditAmount, currency);

    const result = await this.nkapPayService.createPayment({
      amount,
      currency,
      country,
      merchantReference: `WAZEAPP-${customer.id}-CREDITS-${organizationId}-${creditAmount}-${Date.now()}`,
      description: `WazeApp - ${creditAmount.toLocaleString('fr-FR')} messages`,
      paymentMethod: options.paymentMethod,
      operator: options.operator,
      customerPhone: options.customerPhone,
      customerInfo: this.customerInfo(customer, options.customerPhone),
      returnUrl: options.returnUrl,
      metadata: {
        userId: customer.id,
        organizationId,
        creditAmount: String(creditAmount),
        type: 'message_credits',
      },
    });

    this.logger.log(
      `Nkap Pay ${creditAmount} credits for org ${organizationId} (${country}): ${amount} ${currency} ` +
        `(${result.success ? result.reference : `refused: ${result.error}`})`,
    );

    return { ...result, creditAmount };
  }

  // ---------------------------------------------------------------------------
  // Webhook side
  // ---------------------------------------------------------------------------

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
