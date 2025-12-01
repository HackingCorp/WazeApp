import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpStatus,
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
import { S3PService, S3PPaymentRequest, S3PPaymentResponse } from './s3p.service';
import { User } from '../../common/entities';

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

@ApiTags('Mobile Money Payments')
@Controller('payments/mobile-money')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MobileMoneyController {
  constructor(private readonly s3pService: S3PService) {}

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
}