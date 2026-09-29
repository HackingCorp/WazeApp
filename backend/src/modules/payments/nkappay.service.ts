import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * Nkap Pay (LtcPay) aggregator.
 *
 * Distinct from EnkapService, which talks to E-nkap directly over OAuth.
 * Nkap Pay fronts several providers (TouchPay, E-nkap, Stripe) behind one
 * key/secret API and picks the provider itself, per country.
 */

export type NkapPayMethod = 'MOBILE_MONEY' | 'BANK_CARD';
export type NkapPayMode = 'SDK' | 'DIRECT_API' | 'STRIPE' | 'REDIRECT';
export type NkapPayStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface NkapPayCustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
}

export interface NkapPayCreateRequest {
  /** Integer amount in the settlement currency. 5000 = 5 000 XAF. */
  amount: number;
  currency?: string;
  merchantReference?: string;
  description?: string;
  paymentMethod?: NkapPayMethod;
  paymentMode?: NkapPayMode;
  country?: string;
  operator?: string;
  customerPhone?: string;
  customerInfo?: NkapPayCustomerInfo;
  callbackUrl?: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
  /** Cosmetic amount shown under the real total; never debited. */
  displayAmount?: number;
  displayCurrency?: string;
}

export interface NkapPayCreateResponse {
  success: boolean;
  paymentId?: string;
  reference?: string;
  paymentToken?: string;
  amount?: string;
  fee?: string;
  feeBearer?: string;
  currency?: string;
  status?: NkapPayStatus;
  paymentMode?: NkapPayMode;
  country?: string;
  /** Where to send the customer. Unused in DIRECT_API. */
  paymentUrl?: string;
  stripeClientSecret?: string | null;
  createdAt?: string;
  error?: string;
  /** Stable failure code when the operator refused (HTTP 402). */
  failureCode?: string;
  operatorReference?: string;
  /** Seconds to wait before retrying, from Retry-After (HTTP 429). */
  retryAfter?: number;
  /** True only for a genuine provider outage (HTTP 502) — retrying makes sense. */
  retryable?: boolean;
  details?: any;
}

export interface NkapPayPayment {
  id: string;
  reference: string;
  merchant_reference?: string | null;
  amount: string;
  fee: string;
  fee_bearer: string;
  currency: string;
  method?: NkapPayMethod | null;
  status: NkapPayStatus;
  payment_mode: NkapPayMode;
  country?: string | null;
  provider?: string | null;
  operator?: string | null;
  operator_transaction_id?: string | null;
  operator_reference?: string | null;
  failure_code?: string | null;
  failure_reason?: string | null;
  customer_info?: NkapPayCustomerInfo | null;
  description?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NkapPayWebhookPayload {
  event: string;
  data: {
    payment_id: string;
    reference: string;
    merchant_reference?: string | null;
    provider_transaction_id?: string | null;
    amount: number;
    fee: number;
    currency: string;
    status: NkapPayStatus;
    method?: NkapPayMethod | null;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    description?: string | null;
    provider?: string | null;
    failure_code?: string | null;
    failure_reason?: string | null;
    operator_reference?: string | null;
    completed_at?: string | null;
    created_at: string;
  };
  timestamp: string;
}

/** Statuses the API documents as definitive. EXPIRED is deliberately absent. */
const TERMINAL_STATUSES: NkapPayStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

@Injectable()
export class NkapPayService {
  private readonly logger = new Logger(NkapPayService.name);

  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly webhookSecret: string;
  private readonly returnUrl: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiUrl = this.configService
      .get('NKAPPAY_BASE_URL', 'https://pay.ltcgroup.site/api/v1')
      .replace(/\/+$/, '');
    this.apiKey = this.configService.get('NKAPPAY_API_KEY', '');
    this.apiSecret = this.configService.get('NKAPPAY_API_SECRET', '');
    this.webhookSecret = this.configService.get('NKAPPAY_WEBHOOK_SECRET', '');
    this.returnUrl = this.configService.get(
      'NKAPPAY_RETURN_URL',
      'https://app.wazeapp.ai/billing?payment=success',
    );
    this.callbackUrl = this.configService.get(
      'NKAPPAY_CALLBACK_URL',
      'https://api.wazeapp.ai/api/v1/payments/nkappay/webhook',
    );

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn(
        'NKAPPAY_API_KEY / NKAPPAY_API_SECRET not configured — Nkap Pay is disabled',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret,
    };
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new HttpException(
        'Nkap Pay is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Create a payment and return where to send the customer.
   *
   * The caller must read paymentMode from the response rather than assume it:
   * the provider decides between REDIRECT (hosted page) and STRIPE.
   */
  async createPayment(request: NkapPayCreateRequest): Promise<NkapPayCreateResponse> {
    this.assertConfigured();

    const payload: Record<string, any> = {
      amount: request.amount,
      ...(request.currency ? { currency: request.currency.toUpperCase() } : {}),
      ...(request.merchantReference ? { merchant_reference: request.merchantReference } : {}),
      ...(request.description ? { description: request.description } : {}),
      ...(request.paymentMethod ? { payment_method: request.paymentMethod } : {}),
      ...(request.paymentMode ? { payment_mode: request.paymentMode } : {}),
      ...(request.country ? { country: request.country.toUpperCase() } : {}),
      ...(request.operator ? { operator: request.operator.toUpperCase() } : {}),
      ...(request.customerPhone ? { customer_phone: request.customerPhone } : {}),
      ...(request.customerInfo ? { customer_info: request.customerInfo } : {}),
      callback_url: request.callbackUrl || this.callbackUrl,
      return_url: request.returnUrl || this.returnUrl,
      ...(request.metadata ? { metadata: request.metadata } : {}),
      ...(request.displayAmount !== undefined ? { display_amount: request.displayAmount } : {}),
      ...(request.displayCurrency ? { display_currency: request.displayCurrency.toUpperCase() } : {}),
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/payments`, payload, {
          headers: this.headers(),
        }),
      );

      const data = response.data || {};
      this.logger.log(
        `Nkap Pay payment created: ${data.reference} (mode: ${data.payment_mode}, status: ${data.status})`,
      );

      return {
        success: true,
        paymentId: data.payment_id,
        reference: data.reference,
        paymentToken: data.payment_token,
        amount: data.amount,
        fee: data.fee,
        feeBearer: data.fee_bearer,
        currency: data.currency,
        status: data.status,
        paymentMode: data.payment_mode,
        country: data.country,
        paymentUrl: data.payment_url,
        stripeClientSecret: data.stripe_client_secret ?? null,
        createdAt: data.created_at,
      };
    } catch (error) {
      return this.toFailure(error, 'create payment');
    }
  }

  /**
   * Fetch a payment. For hosted payments the aggregator re-checks the provider
   * live on every call, so this is the authoritative status.
   */
  async getPayment(reference: string): Promise<NkapPayPayment> {
    this.assertConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/payments/${encodeURIComponent(reference)}`, {
          headers: this.headers(),
        }),
      );
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail || error.message;
      this.logger.error(`Nkap Pay status check failed for ${reference}: ${detail}`);
      throw new HttpException(
        typeof detail === 'string' ? detail : 'Nkap Pay status check failed',
        status && status >= 400 && status < 600 ? status : HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async listPayments(params: {
    page?: number;
    pageSize?: number;
    status?: NkapPayStatus;
  } = {}): Promise<any> {
    this.assertConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/payments`, {
          headers: this.headers(),
          params: {
            ...(params.page ? { page: params.page } : {}),
            ...(params.pageSize ? { page_size: params.pageSize } : {}),
            ...(params.status ? { status: params.status } : {}),
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Nkap Pay list failed: ${error.message}`);
      throw new HttpException('Nkap Pay list failed', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Countries, operators and limits. Refresh regularly rather than caching for
   * long: an operator in outage is disabled, then re-enabled, upstream.
   */
  async getCountries(includeUnavailable = false): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/payments/countries`, {
          // Works unauthenticated; with keys it filters to the merchant's countries.
          headers: this.isConfigured() ? this.headers() : { 'Content-Type': 'application/json' },
          params: includeUnavailable ? { include_unavailable: true } : {},
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Nkap Pay countries failed: ${error.message}`);
      throw new HttpException('Nkap Pay countries lookup failed', HttpStatus.BAD_GATEWAY);
    }
  }

  async getMerchantInfo(): Promise<any> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/payments/me`, { headers: this.headers() }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Nkap Pay merchant info failed: ${error.message}`);
      throw new HttpException('Nkap Pay merchant info failed', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Exact fee percentage per country and operator. Mobile Money rates are not
   * uniform, so this is what to quote the customer — not fee_rates.MOBILE_MONEY.
   */
  async getFees(): Promise<any> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/payments/fees`, { headers: this.headers() }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Nkap Pay fees failed: ${error.message}`);
      throw new HttpException('Nkap Pay fees lookup failed', HttpStatus.BAD_GATEWAY);
    }
  }

  /** Total the customer actually pays, given who bears the fee. */
  computeCustomerTotal(amount: number, feeRatePercent: number, feeBearer: string): {
    amount: number;
    fee: number;
    total: number;
  } {
    const fee = Math.round((amount * feeRatePercent) / 100);
    return {
      amount,
      fee,
      total: feeBearer === 'CLIENT' ? amount + fee : amount,
    };
  }

  /** Constant-time HMAC-SHA256 check of the raw webhook body. */
  verifyWebhookSignature(rawBody: Buffer | string, signature?: string): boolean {
    if (!signature || !this.webhookSecret) return false;

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  isTerminalStatus(status: NkapPayStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  /**
   * Map an HTTP error onto the documented contract so callers know whether a
   * retry is pointless (402 — the customer must act), delayed (429) or
   * worthwhile (502 — the provider itself is down).
   */
  private toFailure(error: any, action: string): NkapPayCreateResponse {
    const status = error?.response?.status;
    const body = error?.response?.data || {};
    const detail =
      typeof body.detail === 'string' ? body.detail : error.message || 'Unknown error';

    if (status === 402) {
      this.logger.warn(
        `Nkap Pay refused (${body.failure_code || 'unknown'}): ${detail}`,
      );
      return {
        success: false,
        error: detail,
        failureCode: body.failure_code,
        operatorReference: body.operator_reference,
        retryable: false,
        details: body,
      };
    }

    if (status === 429) {
      const retryAfter = Number(error?.response?.headers?.['retry-after']) || undefined;
      this.logger.warn(`Nkap Pay rate limited on ${action}, retry after ${retryAfter ?? '?'}s`);
      return {
        success: false,
        error: detail,
        failureCode: body.failure_code,
        retryAfter,
        retryable: true,
        details: body,
      };
    }

    if (status === 502) {
      this.logger.error(`Nkap Pay provider outage on ${action}: ${detail}`);
      return { success: false, error: detail, retryable: true, details: body };
    }

    this.logger.error(`Nkap Pay ${action} failed (${status || 'network'}): ${detail}`);
    return {
      success: false,
      error: detail,
      failureCode: body.failure_code,
      retryable: false,
      details: body,
    };
  }
}
