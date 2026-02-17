import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  Query,
  Logger,
  Headers,
  UnauthorizedException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import * as crypto from 'crypto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { S3PService, S3PPaymentRequest, S3PPaymentResponse } from './s3p.service';
import { EnkapService } from './enkap.service';
import { CurrencyService } from './currency.service';
import { SubscriptionUpgradeService, PaymentDetails } from './subscription-upgrade.service';
import { InvoiceService } from '../subscriptions/invoice.service';
import { User } from '../../common/entities';
import {
  S3PPaymentDto,
  EnkapPaymentDto,
  VerifyS3PPaymentDto,
  CheckEnkapStatusDto,
} from './dto/payment.dto';

export class MobileMoneyPaymentDto {
  @IsIn(['STANDARD', 'PRO', 'ENTERPRISE'])
  plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';

  @IsString()
  customerPhone: string;

  @IsString()
  customerEmail: string;

  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsString()
  serviceNumber: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['monthly', 'annually'])
  billingPeriod?: 'monthly' | 'annually';
}

export class PaymentVerificationDto {
  @IsOptional()
  @IsString()
  ptn?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsIn(['monthly', 'annually'])
  billingPeriod?: 'monthly' | 'annually';
}

@ApiTags('Payments')
@Controller('payments')
export class MobileMoneyController {
  private readonly logger = new Logger(MobileMoneyController.name);
  private readonly enkapWebhookSecret: string;

  constructor(
    private readonly s3pService: S3PService,
    private readonly enkapService: EnkapService,
    private readonly currencyService: CurrencyService,
    private readonly subscriptionUpgradeService: SubscriptionUpgradeService,
    private readonly invoiceService: InvoiceService,
    private readonly configService: ConfigService,
  ) {
    this.enkapWebhookSecret = this.configService.get('ENKAP_WEBHOOK_SECRET');

    if (!this.enkapWebhookSecret) {
      this.logger.warn(
        'ENKAP_WEBHOOK_SECRET not configured - E-nkap webhooks will reject all requests without valid signature'
      );
    }
  }

  @Post('initiate')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 payment initiations per minute
  @ApiOperation({ summary: 'Initiate Mobile Money payment for subscription' })
  @ApiBody({ type: MobileMoneyPaymentDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment initiated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid payment request',
  })
  async initiatePayment(
    @CurrentUser() user: User,
    @Body() paymentDto: MobileMoneyPaymentDto,
  ): Promise<S3PPaymentResponse> {
    // Get dynamic pricing from CurrencyService
    const currency = paymentDto.currency || 'XAF';
    const billingPeriod = paymentDto.billingPeriod || 'monthly';

    const priceInfo = await this.currencyService.getPlanPrice(
      paymentDto.plan,
      currency,
      billingPeriod,
    );

    const amount = priceInfo.amount;

    this.logger.log(`Initiating payment for plan ${paymentDto.plan}: ${priceInfo.symbol}${amount}`);

    const transactionId = `WZ-${Date.now()}-${user.id.substring(0, 8)}`;

    const paymentRequest: S3PPaymentRequest = {
      amount,
      customerPhone: paymentDto.customerPhone,
      customerEmail: paymentDto.customerEmail || user.email,
      customerName: paymentDto.customerName || `${user.firstName} ${user.lastName}`,
      customerAddress: paymentDto.customerAddress,
      serviceNumber: paymentDto.serviceNumber,
      transactionId,
      plan: paymentDto.plan,
    };

    // Store payment metadata for later upgrade
    const paymentResult = await this.s3pService.executePayment(paymentRequest);

    // Add metadata to track the payment for subscription upgrade
    return {
      ...paymentResult,
      metadata: {
        userId: user.id,
        plan: paymentDto.plan,
        amount,
        currency,
        billingPeriod,
      },
    } as typeof paymentResult & { metadata: Record<string, unknown> };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify Mobile Money payment status and upgrade subscription' })
  @ApiBody({ type: PaymentVerificationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved and subscription upgraded if successful',
  })
  async verifyPayment(
    @CurrentUser() user: User,
    @Body() verificationDto: PaymentVerificationDto,
  ): Promise<any> {
    const paymentStatus = await this.s3pService.verifyPayment(
      verificationDto.ptn,
      verificationDto.transactionId,
    );

    // If payment is successful, upgrade subscription
    if (paymentStatus.status === 'SUCCESS' || paymentStatus.status === 'SUCCESSFUL') {
      // SECURITY: Always use the authenticated user's ID, never trust caller-supplied userId
      const userId = user?.id;
      const organizationId = user?.currentOrganizationId;

      // Use plan from frontend request (not from S3P response which doesn't have it)
      const plan = verificationDto.plan;
      const amount = verificationDto.amount || paymentStatus.amount || 0;
      const billingPeriod = verificationDto.billingPeriod || 'monthly';
      const txId = verificationDto.transactionId || paymentStatus.ptn;

      this.logger.log(`Payment verified successfully for user ${userId}, org: ${organizationId}, plan: ${plan}, amount: ${amount}`);

      // Handle invoice payments (plan starts with 'INVOICE-')
      if (plan && plan.toUpperCase().startsWith('INVOICE-')) {
        try {
          const invoiceId = plan.substring(8); // Remove 'INVOICE-' prefix
          this.logger.log(`Processing invoice payment for invoice ${invoiceId}`);

          const paidInvoice = await this.invoiceService.markAsPaid(
            invoiceId,
            'mobile_money',
            txId || '',
          );

          this.logger.log(`Invoice ${invoiceId} marked as paid`);

          return {
            ...paymentStatus,
            invoicePaid: paidInvoice,
          };
        } catch (invoiceError) {
          this.logger.error(`Failed to mark invoice as paid: ${invoiceError.message}`);
          return {
            ...paymentStatus,
            invoicePaymentError: invoiceError.message,
          };
        }
      }
      // Handle subscription upgrades with atomic idempotency check
      else if (plan && ['STANDARD', 'PRO', 'ENTERPRISE'].includes(plan.toUpperCase())) {
        try {
          const validPlan = plan.toUpperCase() as 'STANDARD' | 'PRO' | 'ENTERPRISE';
          const paymentDetails: PaymentDetails = {
            transactionId: txId,
            ptn: verificationDto.ptn,
            plan: validPlan,
            amount: amount,
            currency: 'XAF',
            billingPeriod: billingPeriod,
            paymentMethod: 'mobile_money',
            paymentProvider: 's3p',
          };

          if (!userId && !organizationId) {
            this.logger.warn(`Cannot upgrade subscription: no userId or organizationId`);
            return paymentStatus;
          }

          // Atomic idempotency check + upgrade in a single database transaction
          const upgradeType = organizationId ? 'organization' : 'user';
          this.logger.log(`Upgrading ${upgradeType.toUpperCase()} subscription for ${organizationId ? `org ${organizationId}` : `user ${userId}`}`);

          const atomicResult = await this.subscriptionUpgradeService.atomicCheckAndUpgrade(
            userId,
            organizationId,
            txId,
            paymentDetails,
            upgradeType,
          );

          if (atomicResult.alreadyProcessed) {
            this.logger.warn(`Duplicate payment detected for transaction ${txId}`);
            return { ...paymentStatus, subscription: atomicResult.subscription, message: 'Payment already processed' };
          }

          this.logger.log(`Subscription upgraded successfully: ${JSON.stringify(atomicResult.result)}`);

          return {
            ...paymentStatus,
            subscriptionUpgrade: atomicResult.result,
          };
        } catch (upgradeError) {
          this.logger.error(`Failed to upgrade subscription: ${upgradeError.message}`);
          return {
            ...paymentStatus,
            subscriptionUpgradeError: upgradeError.message,
          };
        }
      } else {
        this.logger.warn(`Cannot process payment: unrecognized plan type: ${plan}`);
      }
    }

    return paymentStatus;
  }

  @Get('ping')
  @ApiOperation({ summary: 'Test S3P API connectivity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API connectivity status',
  })
  async pingService(): Promise<{ connected: boolean }> {
    const connected = await this.s3pService.ping();
    return { connected };
  }

  @Get('pricing')
  @Public()
  @ApiOperation({ summary: 'Get subscription pricing with currency conversion' })
  @ApiQuery({ name: 'currency', required: false, description: 'Currency code (default: XAF)' })
  @ApiQuery({ name: 'billing', required: false, enum: ['monthly', 'annually'] })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pricing information retrieved',
  })
  async getPricing(
    @Query('currency') currency: string = 'XAF',
    @Query('billing') billing: 'monthly' | 'annually' = 'monthly',
  ): Promise<any> {
    // Ensure plans are loaded from database
    await this.currencyService.ensurePlansLoaded();

    const plans = {};

    for (const planId of ['STANDARD', 'PRO', 'ENTERPRISE']) {
      const plan = this.currencyService.getPlan(planId);
      if (!plan) {
        this.logger.warn(`Plan ${planId} not found in pricing cache`);
        continue;
      }

      const price = await this.currencyService.getPlanPrice(planId, currency, billing);

      plans[planId] = {
        price: price.amount,
        priceFormatted: `${price.symbol}${price.amount.toLocaleString()}`,
        priceUSD: billing === 'monthly' ? plan.priceUSD : plan.priceAnnualUSD,
        description: `Plan ${plan.name} - ${plan.agents} agent(s), ${plan.messages.toLocaleString()} messages/mois`,
        features: this.getPlanFeatures(planId),
      };
    }

    return {
      currency: currency.toUpperCase(),
      symbol: this.currencyService.getCurrencySymbol(currency),
      billingPeriod: billing,
      plans,
      supportedOperators: [
        { name: 'MTN Mobile Money', code: 'MTNMOMO' },
        { name: 'Orange Money', code: 'ORANGE' },
        { name: 'Express Union', code: 'EU' },
      ],
      supportedCurrencies: this.currencyService.getSupportedCurrencies(),
    };
  }

  private getPlanFeatures(planId: string): string[] {
    const features = {
      STANDARD: [
        '1 Agent WhatsApp',
        '2,000 messages/mois',
        '500MB stockage',
        '3 bases de connaissances',
        'Analytics avancés',
        'Support e-mail prioritaire',
      ],
      PRO: [
        '3 Agents WhatsApp',
        '8,000 messages/mois',
        '5GB stockage',
        '10 bases de connaissances',
        'Analytics avancés',
        'Support chat 24h/24',
        'Intégrations personnalisées',
      ],
      ENTERPRISE: [
        '10 Agents WhatsApp',
        '30,000 messages/mois',
        '20GB stockage',
        '50 bases de connaissances',
        'Analyses personnalisées',
        'Support dédié',
        'API complète',
        'White Label',
      ],
    };

    return features[planId] || [];
  }

  // ============================================
  // NOUVEAUX ENDPOINTS S3P - MOBILE MONEY
  // ============================================

  @Post('s3p/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate S3P Mobile Money payment' })
  @ApiBody({ type: S3PPaymentDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'S3P payment initiated successfully',
  })
  async initiateS3PPayment(
    @Body() paymentDto: S3PPaymentDto,
  ): Promise<any> {
    // S3P only accepts XAF - convert if necessary
    let amountXAF = paymentDto.amount;
    const clientCurrency = (paymentDto.currency || 'XAF').toUpperCase();

    if (clientCurrency !== 'XAF' && clientCurrency !== 'XOF') {
      // Convert from client currency to XAF
      const clientRate = await this.currencyService.getExchangeRate(clientCurrency);
      const xafRate = await this.currencyService.getExchangeRate('XAF');

      // Convert: clientAmount → USD → XAF
      const amountInUSD = paymentDto.amount / clientRate;
      amountXAF = Math.round(amountInUSD * xafRate * 1.1); // 10% margin

      // Round to nearest 100 for XAF
      amountXAF = Math.ceil(amountXAF / 100) * 100;

      // Ensure minimum 100 XAF
      if (amountXAF < 100) {
        amountXAF = 100;
      }

      this.logger.log(`Converting ${paymentDto.amount} ${clientCurrency} to ${amountXAF} XAF for S3P`);
    }

    return await this.s3pService.processPayment({
      amount: amountXAF,
      customerPhone: paymentDto.customerPhone,
      paymentType: paymentDto.paymentType as 'orange' | 'mtn',
      customerName: paymentDto.customerName,
      description: paymentDto.description,
    });
  }

  @Post('s3p/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify S3P payment status' })
  @ApiBody({ type: VerifyS3PPaymentDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved',
  })
  async verifyS3PPayment(
    @Body() verifyDto: VerifyS3PPaymentDto,
  ): Promise<any> {
    return await this.s3pService.verifyTransaction(verifyDto.transactionRef);
  }

  @Get('s3p/ping')
  @Public()
  @ApiOperation({ summary: 'Test S3P API connectivity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'S3P API connectivity status',
  })
  async pingS3P(): Promise<any> {
    try {
      const result = await this.s3pService.ping();
      return { success: true, connected: true, result };
    } catch (error) {
      return { success: false, connected: false, error: error.message };
    }
  }

  // ============================================
  // NOUVEAUX ENDPOINTS E-NKAP - MULTI-CANAUX
  // ============================================

  @Post('enkap/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate E-nkap multi-channel payment' })
  @ApiBody({ type: EnkapPaymentDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'E-nkap payment order created successfully',
  })
  async initiateEnkapPayment(
    @Body() paymentDto: EnkapPaymentDto,
  ): Promise<any> {
    // E-nkap only accepts XAF - convert if necessary
    let amountXAF = paymentDto.totalAmount;
    const clientCurrency = (paymentDto.currency || 'XAF').toUpperCase();

    if (clientCurrency !== 'XAF' && clientCurrency !== 'XOF') {
      // Convert from client currency to XAF
      // First get the exchange rate for the client currency (vs USD)
      const clientRate = await this.currencyService.getExchangeRate(clientCurrency);
      // Get XAF rate
      const xafRate = await this.currencyService.getExchangeRate('XAF');

      // Convert: clientAmount → USD → XAF
      // clientAmount / clientRate = USD amount
      // USD amount * xafRate * 1.1 (margin) = XAF amount
      const amountInUSD = paymentDto.totalAmount / clientRate;
      amountXAF = Math.round(amountInUSD * xafRate * 1.1);

      // Round to nearest 100 for XAF
      amountXAF = Math.ceil(amountXAF / 100) * 100;

      this.logger.log(`Converting ${paymentDto.totalAmount} ${clientCurrency} to ${amountXAF} XAF for E-nkap`);
    }

    // Update items with XAF prices
    const conversionRatio = amountXAF / paymentDto.totalAmount;
    const itemsXAF = paymentDto.items.map(item => ({
      ...item,
      price: clientCurrency !== 'XAF' && clientCurrency !== 'XOF'
        ? Math.round(item.price * conversionRatio)
        : item.price,
    }));

    return await this.enkapService.createPaymentOrder({
      merchantReference: paymentDto.merchantReference,
      customerName: paymentDto.customerName,
      customerEmail: paymentDto.customerEmail,
      customerPhone: paymentDto.customerPhone,
      totalAmount: amountXAF,
      currency: 'XAF', // Always XAF for E-nkap
      description: paymentDto.description,
      items: itemsXAF,
      returnUrl: paymentDto.returnUrl,
      notificationUrl: paymentDto.notificationUrl,
    });
  }

  @Get('enkap/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check E-nkap payment status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved',
  })
  async checkEnkapStatus(
    @Query('txid') txid: string,
  ): Promise<any> {
    return await this.enkapService.checkOrderStatus(txid, 'txid');
  }

  @Post('enkap/webhook')
  @Public()
  @ApiOperation({ summary: 'E-nkap webhook endpoint - processes payment and upgrades subscription' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook processed and subscription upgraded if payment successful',
  })
  async enkapWebhook(
    @Body() webhookData: any,
    @Headers('x-enkap-signature') signature?: string,
    @Headers('x-signature') altSignature?: string,
  ): Promise<any> {
    this.logger.log(`E-nkap webhook received: ${JSON.stringify(webhookData)}`);

    // Verify webhook signature - MANDATORY for security
    const webhookSignature = signature || altSignature;

    if (!webhookSignature) {
      this.logger.warn('E-nkap webhook rejected: missing signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!this.enkapWebhookSecret) {
      this.logger.error('E-nkap webhook rejected: ENKAP_WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', this.enkapWebhookSecret)
      .update(JSON.stringify(webhookData), 'utf8')
      .digest('hex');

    // Support both plain hex and sha256= prefix formats
    const normalizedSignature = webhookSignature.startsWith('sha256=')
      ? webhookSignature.slice(7)
      : webhookSignature;

    const sigBuffer = Buffer.from(normalizedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn('E-nkap webhook rejected: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log('E-nkap webhook signature verified successfully');

    const result = this.enkapService.processWebhook(webhookData);

    // Extract the transactionId early for idempotency check
    const webhookTransactionId = webhookData.transactionId || webhookData.txid || webhookData.merchantReference;

    // Process subscription upgrade if payment is successful
    if (result.status === 'SUCCESS' || webhookData.status === 'COMPLETED') {
      this.logger.log(`E-nkap payment successful, processing subscription upgrade`);

      // Extract metadata from webhook (merchantReference contains user info)
      // Format expected: WAZEAPP-{userId}-{plan}-{timestamp}
      const merchantRef = webhookData.merchantReference || result.merchantReference;

      if (merchantRef) {
        const parts = merchantRef.split('-');
        // Format: WAZEAPP-{userId}-{plan/INVOICE}-{invoiceId?/timestamp}
        if (parts.length >= 3 && parts[0] === 'WAZEAPP') {
          const userId = parts[1];
          const planOrInvoice = parts[2].toUpperCase();

          // Idempotency check: verify this transaction hasn't already been processed
          const existingSubscription = await this.subscriptionUpgradeService.getSubscription(userId);
          if (existingSubscription?.metadata?.lastPayment?.transactionId === webhookTransactionId) {
            this.logger.warn(`E-nkap webhook duplicate detected for transaction ${webhookTransactionId}, skipping`);
            return {
              status: 'success',
              message: 'Payment already processed',
              webhookResult: result,
              subscription: existingSubscription,
            };
          }

          // Handle invoice payments: WAZEAPP-{userId}-INVOICE-{invoiceId}-{timestamp}
          if (planOrInvoice === 'INVOICE' && parts.length >= 4) {
            const invoiceId = parts[3];
            this.logger.log(`Processing invoice payment for invoice ${invoiceId}`);

            try {
              const paidInvoice = await this.invoiceService.markAsPaid(
                invoiceId,
                'card',
                webhookTransactionId || merchantRef,
              );

              this.logger.log(`Invoice ${invoiceId} marked as paid via E-nkap`);

              return {
                status: 'success',
                message: 'Payment processed and invoice marked as paid',
                webhookResult: result,
                invoicePaid: paidInvoice,
              };
            } catch (invoiceError) {
              this.logger.error(`Failed to mark invoice as paid: ${invoiceError.message}`);
              return {
                status: 'error',
                message: 'Payment successful but failed to mark invoice as paid',
                webhookResult: result,
                error: invoiceError.message,
              };
            }
          }
          // Handle subscription upgrades: WAZEAPP-{userId}-{plan}-{timestamp}
          else if (['STANDARD', 'PRO', 'ENTERPRISE'].includes(planOrInvoice)) {
            const upgradeResult = await this.subscriptionUpgradeService.upgradeUserSubscription(
              userId,
              {
                transactionId: webhookTransactionId || merchantRef,
                ptn: webhookData.txid || result.txid,
                plan: planOrInvoice as 'STANDARD' | 'PRO' | 'ENTERPRISE',
                amount: webhookData.amount || webhookData.totalAmount || 0,
                currency: webhookData.currency || 'XAF',
                billingPeriod: 'monthly',
                paymentMethod: 'mobile_money',
                paymentProvider: 'enkap',
              },
            );

            this.logger.log(`Subscription upgrade result: ${JSON.stringify(upgradeResult)}`);

            return {
              status: 'success',
              message: 'Payment processed and subscription upgraded',
              webhookResult: result,
              subscriptionUpgrade: upgradeResult,
            };
          }
        }
      }

      this.logger.warn(`Could not extract user info from merchantReference: ${merchantRef}`);
    }

    return {
      status: 'success',
      message: 'Webhook processed',
      result,
    };
  }

  @Get('enkap/test-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test E-nkap token generation (Admin only)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token generation test result',
  })
  async testEnkapToken(): Promise<any> {
    try {
      const result = await this.enkapService.testConnection();
      return {
        success: result.success,
        message: result.success
          ? 'E-nkap token generated successfully'
          : 'Failed to generate E-nkap token',
        details: result.details,
        error: result.error,
      };
    } catch (error) {
      this.logger.error(`E-nkap token test failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}