import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { S3PService, S3PPaymentRequest, S3PPaymentResponse } from './s3p.service';
import { EnkapService } from './enkap.service';
import { User } from '../../common/entities';
import {
  S3PPaymentDto,
  EnkapPaymentDto,
  VerifyS3PPaymentDto,
  CheckEnkapStatusDto,
} from './dto/payment.dto';

export class MobileMoneyPaymentDto {
  plan: 'STANDARD' | 'PRO' | 'ENTERPRISE';
  customerPhone: string;
  customerEmail: string;
  customerName: string;
  customerAddress?: string;
  serviceNumber: string;
}

export class PaymentVerificationDto {
  ptn?: string;
  transactionId?: string;
}

@ApiTags('Payments')
@Controller('payments')
export class MobileMoneyController {
  constructor(
    private readonly s3pService: S3PService,
    private readonly enkapService: EnkapService,
  ) {}

  @Post('initiate')
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
    // Tarifs en FCFA (1 EUR ≈ 655 FCFA)
    const pricing = {
      STANDARD: 6550, // ~10 EUR
      PRO: 19650,     // ~30 EUR  
      ENTERPRISE: 65500, // ~100 EUR
    };

    const amount = pricing[paymentDto.plan];
    if (!amount) {
      throw new Error(`Plan ${paymentDto.plan} not supported`);
    }

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

    return await this.s3pService.executePayment(paymentRequest);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify Mobile Money payment status' })
  @ApiBody({ type: PaymentVerificationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment status retrieved successfully',
  })
  async verifyPayment(
    @Body() verificationDto: PaymentVerificationDto,
  ): Promise<any> {
    return await this.s3pService.verifyPayment(
      verificationDto.ptn,
      verificationDto.transactionId,
    );
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
  @ApiOperation({ summary: 'Get subscription pricing in FCFA' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pricing information retrieved',
  })
  async getPricing(): Promise<any> {
    return {
      currency: 'FCFA',
      plans: {
        STANDARD: {
          price: 6550,
          description: 'Plan Standard - 1 agent, 2000 requêtes/mois',
          features: ['1 Agent WhatsApp', '2000 requêtes/mois', '500MB stockage', '3 bases de connaissances']
        },
        PRO: {
          price: 19650,
          description: 'Plan Pro - 3 agents, 8000 requêtes/mois',
          features: ['3 Agents WhatsApp', '8000 requêtes/mois', '5GB stockage', '10 bases de connaissances', 'Analytics avancés']
        },
        ENTERPRISE: {
          price: 65500,
          description: 'Plan Enterprise - 10 agents, 30000 requêtes/mois',
          features: ['10 Agents WhatsApp', '30000 requêtes/mois', '20GB stockage', '50 bases de connaissances', 'Support prioritaire', 'API complète']
        }
      },
      supportedOperators: [
        { name: 'MTN Mobile Money', code: 'MTNMOMO' },
        { name: 'Orange Money', code: 'ORANGE' },
        { name: 'Express Union', code: 'EU' }
      ]
    };
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
    return await this.s3pService.processPayment({
      amount: paymentDto.amount,
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
    return await this.enkapService.createPaymentOrder({
      merchantReference: paymentDto.merchantReference,
      customerName: paymentDto.customerName,
      customerEmail: paymentDto.customerEmail,
      customerPhone: paymentDto.customerPhone,
      totalAmount: paymentDto.totalAmount,
      currency: paymentDto.currency,
      description: paymentDto.description,
      items: paymentDto.items,
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
  @ApiOperation({ summary: 'E-nkap webhook endpoint' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook processed successfully',
  })
  async enkapWebhook(@Body() webhookData: any): Promise<any> {
    const result = this.enkapService.processWebhook(webhookData);

    // TODO: Implémenter la logique de traitement du paiement
    // Par exemple: mettre à jour le statut de la commande dans la base de données

    return {
      status: 'success',
      message: 'Webhook processed',
      result,
    };
  }

  @Get('enkap/test-token')
  @Public()
  @ApiOperation({ summary: 'Test E-nkap token generation' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token generation test result',
  })
  async testEnkapToken(): Promise<any> {
    try {
      const connected = await this.enkapService.testConnection();
      return {
        success: connected,
        message: connected
          ? 'E-nkap token generated successfully'
          : 'Failed to generate E-nkap token',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}