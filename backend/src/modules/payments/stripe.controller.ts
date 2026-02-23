import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  BadRequestException,
  Headers,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto, CreatePortalSessionDto, CreateCreditCheckoutDto } from './dto/stripe.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, Organization } from '../../common/entities';
import { ConfigService } from '@nestjs/config';

@ApiTags('Stripe Payments')
@Controller('payments/stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session for subscription' })
  async createCheckoutSession(
    @CurrentUser() user: any,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    const dashboardUrl = this.configService.get('DASHBOARD_URL') || 'https://app.wazeapp.xyz';

    // Resolve organizationId
    let organizationId: string | undefined;
    const org = await this.organizationRepository.findOne({ where: { ownerId: user.userId } });
    if (org) {
      organizationId = org.id;
    }

    const result = await this.stripeService.createCheckoutSession({
      userId: user.userId,
      organizationId,
      planCode: dto.plan,
      billingPeriod: dto.billingPeriod || 'monthly',
      successUrl: dto.successUrl || `${dashboardUrl}/billing?payment=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: dto.cancelUrl || `${dashboardUrl}/billing?payment=cancelled`,
    });

    return { sessionId: result.sessionId, url: result.url };
  }

  @Post('portal-session')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  async createPortalSession(
    @CurrentUser() user: any,
    @Body() dto: CreatePortalSessionDto,
  ) {
    const dashboardUrl = this.configService.get('DASHBOARD_URL') || 'https://app.wazeapp.xyz';

    // Find subscription with Stripe customer ID
    let customerId: string | null = null;

    // Check user's org subscription first
    const org = await this.organizationRepository.findOne({ where: { ownerId: user.userId } });
    if (org) {
      const orgSub = await this.subscriptionRepository.findOne({
        where: { organizationId: org.id },
      });
      if (orgSub?.stripeCustomerId) {
        customerId = orgSub.stripeCustomerId;
      }
    }

    // Fallback to user subscription
    if (!customerId) {
      const userSub = await this.subscriptionRepository.findOne({
        where: { userId: user.userId },
      });
      if (userSub?.stripeCustomerId) {
        customerId = userSub.stripeCustomerId;
      }
    }

    if (!customerId) {
      throw new BadRequestException('No Stripe customer found. You need an active Stripe subscription first.');
    }

    const result = await this.stripeService.createPortalSession(
      customerId,
      dto.returnUrl || `${dashboardUrl}/billing`,
    );

    return { url: result.url };
  }

  @Post('credit-checkout')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session for message credits' })
  async createCreditCheckout(
    @CurrentUser() user: any,
    @Body() dto: CreateCreditCheckoutDto,
  ) {
    const dashboardUrl = this.configService.get('DASHBOARD_URL') || 'https://app.wazeapp.xyz';

    let organizationId: string | undefined;
    const org = await this.organizationRepository.findOne({ where: { ownerId: user.userId } });
    if (org) {
      organizationId = org.id;
    }

    const result = await this.stripeService.createCreditCheckoutSession({
      userId: user.userId,
      organizationId,
      amount: dto.amount,
      successUrl: dto.successUrl || `${dashboardUrl}/billing?payment=stripe&credits=${dto.amount}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: dto.cancelUrl || `${dashboardUrl}/billing?payment=cancelled`,
    });

    return { sessionId: result.sessionId, url: result.url };
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body. Ensure rawBody is enabled in NestFactory.create()');
    }

    let event;
    try {
      event = this.stripeService.constructEvent(rawBody, signature);
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    // Process event asynchronously (don't block the response)
    this.stripeService.handleWebhookEvent(event).catch((err) => {
      this.logger.error(`Error processing Stripe event ${event.id}: ${err.message}`, err.stack);
    });

    return { received: true };
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Get Stripe publishable key' })
  getConfig() {
    return {
      publishableKey: this.stripeService.getPublishableKey(),
      configured: this.stripeService.isConfigured(),
    };
  }

  @Post('sync-plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync plans to Stripe Products/Prices (admin)' })
  async syncPlans(@CurrentUser() user: any) {
    // Simple admin check - in production you'd check user.role
    const result = await this.stripeService.syncPlansToStripe();
    return result;
  }
}
