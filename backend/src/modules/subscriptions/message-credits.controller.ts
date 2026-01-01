import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MessageCreditsService, MESSAGE_CREDIT_CONFIG } from './message-credits.service';

class CalculatePriceDto {
  amount: number;
}

class PurchaseCreditsDto {
  amount: number;
  transactionId: string;
  ptn?: string;
  paymentMethod: string;
  phoneNumber?: string;
}

class InitiatePurchaseDto {
  amount: number;
  phoneNumber: string;
  paymentMethod: 'orange_money' | 'mtn_mobile_money';
}

@ApiTags('Message Credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('message-credits')
export class MessageCreditsController {
  constructor(private readonly creditsService: MessageCreditsService) {}

  @Get('pricing')
  @ApiOperation({ summary: 'Get message credits pricing information' })
  getPricing() {
    return {
      success: true,
      data: this.creditsService.getPricingInfo(),
    };
  }

  @Get('calculate')
  @ApiOperation({ summary: 'Calculate price for a given number of messages' })
  @ApiQuery({ name: 'amount', type: Number, description: 'Number of messages to purchase' })
  calculatePrice(@Query('amount') amountStr: string) {
    const amount = parseInt(amountStr, 10);

    if (isNaN(amount) || amount < MESSAGE_CREDIT_CONFIG.minimumPurchase) {
      throw new BadRequestException(
        `Minimum purchase is ${MESSAGE_CREDIT_CONFIG.minimumPurchase} messages`
      );
    }

    const price = this.creditsService.calculatePrice(amount);

    return {
      success: true,
      data: {
        amount,
        price,
        expirationDays: MESSAGE_CREDIT_CONFIG.expirationDays,
      },
    };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get credits summary for current organization' })
  async getCreditsSummary(@Request() req: any) {
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return {
        success: true,
        data: {
          totalAvailable: 0,
          totalUsed: 0,
          activeCredits: [],
          expiredCredits: 0,
        },
      };
    }

    const summary = await this.creditsService.getCreditsSummary(organizationId);

    return {
      success: true,
      data: summary,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get purchase history for current organization' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'offset', type: Number, required: false })
  async getPurchaseHistory(
    @Request() req: any,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ) {
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      return {
        success: true,
        data: { credits: [], total: 0 },
      };
    }

    const limit = parseInt(limitStr || '10', 10);
    const offset = parseInt(offsetStr || '0', 10);

    const result = await this.creditsService.getPurchaseHistory(organizationId, limit, offset);

    return {
      success: true,
      data: result,
    };
  }

  @Post('purchase')
  @ApiOperation({ summary: 'Record a completed credit purchase (after payment verification)' })
  @ApiBody({ type: PurchaseCreditsDto })
  async purchaseCredits(@Request() req: any, @Body() dto: PurchaseCreditsDto) {
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    // Validate amount
    this.creditsService.validatePurchaseAmount(dto.amount);

    const credit = await this.creditsService.purchaseCredits({
      organizationId,
      amount: dto.amount,
      transactionId: dto.transactionId,
      ptn: dto.ptn,
      paymentMethod: dto.paymentMethod,
      phoneNumber: dto.phoneNumber,
    });

    return {
      success: true,
      message: `Successfully purchased ${dto.amount} message credits`,
      data: {
        creditId: credit.id,
        amount: credit.amount,
        expiresAt: credit.expiresAt,
        totalPaid: {
          xaf: credit.totalAmountXAF,
        },
      },
    };
  }

  @Post('initiate-purchase')
  @ApiOperation({ summary: 'Initiate a credit purchase with Mobile Money' })
  @ApiBody({ type: InitiatePurchaseDto })
  async initiatePurchase(@Request() req: any, @Body() dto: InitiatePurchaseDto) {
    const organizationId = req.user.organizationId;

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    // Validate amount
    this.creditsService.validatePurchaseAmount(dto.amount);

    // Calculate price
    const price = this.creditsService.calculatePrice(dto.amount);

    // Return payment initiation details
    // The actual S3P payment will be handled by the payments module
    return {
      success: true,
      data: {
        amount: dto.amount,
        price,
        paymentMethod: dto.paymentMethod,
        phoneNumber: dto.phoneNumber,
        expirationDays: MESSAGE_CREDIT_CONFIG.expirationDays,
        // This should be used to call the payment initiation endpoint
        paymentPayload: {
          type: 'message_credits',
          amount: dto.amount,
          totalXAF: price.xaf,
          organizationId,
          phoneNumber: dto.phoneNumber,
          paymentMethod: dto.paymentMethod,
        },
      },
    };
  }
}
