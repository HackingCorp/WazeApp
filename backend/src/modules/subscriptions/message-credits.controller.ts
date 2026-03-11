import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedRequest } from '../../common/decorators/current-user.decorator';
import { OrganizationMember } from '../../common/entities';
import { MessageCreditsService, MESSAGE_CREDIT_CONFIG } from './message-credits.service';
import { QuotaEnforcementService } from './quota-enforcement.service';
import { Subscription } from '../../common/entities';
import { SubscriptionStatus, UserRole } from '../../common/enums';

class CalculatePriceDto {
  @IsNumber()
  @Min(1000)
  amount: number;
}

class PurchaseCreditsDto {
  @IsNumber()
  @Min(1000)
  amount: number;

  @IsString()
  transactionId: string;

  @IsOptional()
  @IsString()
  ptn?: string;

  @IsString()
  paymentMethod: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

class InitiatePurchaseDto {
  amount: number;
  phoneNumber: string;
  paymentMethod: 'orange_money' | 'mtn_mobile_money';
}

class AdminAddCreditsDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Message Credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('message-credits')
export class MessageCreditsController {
  private readonly logger = new Logger(MessageCreditsController.name);

  constructor(
    private readonly creditsService: MessageCreditsService,
    private readonly quotaService: QuotaEnforcementService,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  /**
   * Helper to get organizationId from user - checks JWT first, then membership table
   */
  private async getOrganizationId(user: AuthenticatedRequest): Promise<string | null> {
    // First check if organizationId is in JWT
    if (user.organizationId) {
      return user.organizationId;
    }

    // Get userId from various possible sources
    const userId = user.userId || (user as unknown as { user?: { id?: string } }).user?.id;

    if (!userId) {
      return null;
    }

    // Look it up from organization_members table
    const membership = await this.memberRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (membership) {
      return membership.organizationId;
    }

    return null;
  }

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
  async getCreditsSummary(@CurrentUser() user: AuthenticatedRequest) {
    const organizationId = await this.getOrganizationId(user);

    if (!organizationId) {
      this.logger.warn(`getCreditsSummary: No organizationId found for user ${user?.userId}`);
      return {
        totalAvailable: 0,
        totalUsed: 0,
        activeCredits: [],
        expiredCredits: 0,
      };
    }

    this.logger.debug(`getCreditsSummary: Fetching credits for org ${organizationId}`);

    // Get base summary from service (for credit details)
    const baseSummary = await this.creditsService.getCreditsSummary(organizationId);

    // Use the quota service's bonusCredits data which is computed from actual DB records
    // quotaCheck.bonusCredits has the authoritative used/available values
    try {
      const quotaCheck = await this.quotaService.checkWhatsAppMessageQuota(organizationId);

      if (quotaCheck.bonusCredits) {
        this.logger.debug(`getCreditsSummary: bonusUsed=${quotaCheck.bonusCredits.used}, bonusAvailable=${quotaCheck.bonusCredits.available}`);

        return {
          ...baseSummary,
          totalAvailable: quotaCheck.bonusCredits.available,
          totalUsed: quotaCheck.bonusCredits.used,
        };
      }
    } catch (error) {
      this.logger.error(`getCreditsSummary: Error calculating actual usage: ${error.message}`);
    }

    return baseSummary;
  }

  @Get('history')
  @ApiOperation({ summary: 'Get purchase history for current organization' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'offset', type: Number, required: false })
  async getPurchaseHistory(
    @CurrentUser() user: AuthenticatedRequest,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string
  ) {
    const organizationId = await this.getOrganizationId(user);

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
  async purchaseCredits(@CurrentUser() user: AuthenticatedRequest, @Body() dto: PurchaseCreditsDto) {
    const organizationId = await this.getOrganizationId(user);

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

    // Clear quota cache so new credits are visible immediately
    await this.quotaService.clearOrganizationCaches(organizationId);

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
  async initiatePurchase(@CurrentUser() user: AuthenticatedRequest, @Body() dto: InitiatePurchaseDto) {
    const organizationId = await this.getOrganizationId(user);

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

  @Post('admin/add')
  @ApiOperation({ summary: 'Admin: Add credits manually to an organization' })
  @ApiBody({ type: AdminAddCreditsDto })
  async adminAddCredits(@CurrentUser() user: AuthenticatedRequest, @Body() dto: AdminAddCreditsDto) {
    // Enforce admin role - only OWNER or ADMIN can grant free credits
    if (!user.role || ![UserRole.OWNER, UserRole.ADMIN].includes(user.role as UserRole)) {
      throw new ForbiddenException('Only organization owners or admins can add credits manually');
    }

    const organizationId = await this.getOrganizationId(user);

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required');
    }

    // Create credits without payment (admin grant) - skip purchase minimum validation
    const credit = await this.creditsService.purchaseCredits({
      organizationId,
      amount: dto.amount,
      transactionId: `ADMIN-${Date.now()}`,
      paymentMethod: 'admin_grant',
      phoneNumber: undefined,
    }, true);

    // Clear quota cache so new credits are visible immediately
    await this.quotaService.clearOrganizationCaches(organizationId);

    return {
      success: true,
      message: `Successfully added ${dto.amount} message credits`,
      data: {
        creditId: credit.id,
        amount: credit.amount,
        remaining: credit.remaining,
        expiresAt: credit.expiresAt,
        reason: dto.reason || 'Admin grant',
      },
    };
  }
}
