import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageCredit, MessageCreditStatus, Invoice, Organization } from '../../common/entities';
import { InvoiceService } from './invoice.service';

// Pricing configuration
export const MESSAGE_CREDIT_CONFIG = {
  pricePerMessageXAF: 2,
  pricePerMessageUSD: 0.0032, // ~2 XAF at 625 XAF/USD
  minimumPurchase: 1000,
  expirationDays: 30,
};

export interface PurchaseCreditsDto {
  organizationId: string;
  amount: number;
  transactionId: string;
  ptn?: string;
  paymentMethod: string;
  phoneNumber?: string;
}

export interface CreditsSummary {
  totalAvailable: number;
  totalUsed: number;
  activeCredits: Array<{
    id: string;
    remaining: number;
    expiresAt: Date;
    purchasedAt: Date;
  }>;
  expiredCredits: number;
  nextExpiration?: {
    amount: number;
    date: Date;
  };
}

@Injectable()
export class MessageCreditsService {
  private readonly logger = new Logger(MessageCreditsService.name);

  constructor(
    @InjectRepository(MessageCredit)
    private readonly creditRepository: Repository<MessageCredit>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    private readonly invoiceService: InvoiceService,
  ) {}

  /**
   * Calculate price for a given number of messages
   */
  calculatePrice(amount: number): { xaf: number; usd: number } {
    return {
      xaf: amount * MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
      usd: amount * MESSAGE_CREDIT_CONFIG.pricePerMessageUSD,
    };
  }

  /**
   * Validate purchase amount
   */
  validatePurchaseAmount(amount: number): void {
    if (amount < MESSAGE_CREDIT_CONFIG.minimumPurchase) {
      throw new BadRequestException(
        `Minimum purchase is ${MESSAGE_CREDIT_CONFIG.minimumPurchase} messages`
      );
    }
    if (amount % 100 !== 0) {
      throw new BadRequestException('Amount must be a multiple of 100');
    }
  }

  /**
   * Create a new message credit purchase
   */
  async purchaseCredits(dto: PurchaseCreditsDto, skipValidation = false): Promise<MessageCredit> {
    if (!skipValidation) {
      this.validatePurchaseAmount(dto.amount);
    }

    const price = this.calculatePrice(dto.amount);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MESSAGE_CREDIT_CONFIG.expirationDays);

    const isAdminGrant = dto.paymentMethod === 'admin_grant';

    const credit = this.creditRepository.create({
      organizationId: dto.organizationId,
      amount: dto.amount,
      remaining: dto.amount,
      used: 0,
      status: MessageCreditStatus.ACTIVE,
      expiresAt,
      pricePerMessageXAF: isAdminGrant ? 0 : MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
      totalAmountXAF: isAdminGrant ? 0 : price.xaf,
      transactionId: dto.transactionId,
      ptn: dto.ptn,
      paymentMethod: dto.paymentMethod,
      metadata: {
        paymentProvider: isAdminGrant ? 'admin' : 's3p',
        phoneNumber: dto.phoneNumber,
      },
    });

    const savedCredit = await this.creditRepository.save(credit);

    // Don't create invoice for admin grants
    if (!isAdminGrant) {
      try {
        await this.createCreditPurchaseInvoice(savedCredit);
      } catch (error) {
        this.logger.error(`Failed to create invoice for credit purchase: ${error.message}`);
      }
    }

    this.logger.log(
      `${isAdminGrant ? 'Admin added' : 'Purchased'} ${dto.amount} message credits for org ${dto.organizationId}, expires ${expiresAt.toISOString()}`
    );

    return savedCredit;
  }

  /**
   * Get available credits for an organization (sorted by expiration, oldest first - FIFO)
   */
  async getActiveCredits(organizationId: string): Promise<MessageCredit[]> {
    const now = new Date();
    return this.creditRepository.find({
      where: {
        organizationId,
        status: MessageCreditStatus.ACTIVE,
        expiresAt: MoreThan(now),
      },
      order: {
        expiresAt: 'ASC', // Use oldest credits first (FIFO)
      },
    });
  }

  /**
   * Get total available bonus messages for an organization
   */
  async getTotalAvailableCredits(organizationId: string): Promise<number> {
    const activeCredits = await this.getActiveCredits(organizationId);
    return activeCredits.reduce((sum, credit) => sum + credit.remaining, 0);
  }

  /**
   * Consume bonus credits (call this BEFORE using subscription quota)
   * Returns the number of messages consumed from bonus credits
   * Uses a transaction with pessimistic write lock to prevent concurrent deductions
   */
  async consumeCredits(organizationId: string, count: number = 1): Promise<number> {
    return this.creditRepository.manager.transaction(async (em) => {
      const now = new Date();

      const activeCredits = await em.find(
        this.creditRepository.target,
        {
          where: {
            organizationId,
            status: MessageCreditStatus.ACTIVE,
            expiresAt: MoreThan(now),
          },
          order: {
            expiresAt: 'ASC',
          },
          lock: { mode: 'pessimistic_write' },
        },
      );

      let remaining = count;
      let consumed = 0;

      for (const credit of activeCredits) {
        if (remaining <= 0) break;

        const toConsume = Math.min(remaining, credit.remaining);
        credit.remaining -= toConsume;
        credit.used += toConsume;
        consumed += toConsume;
        remaining -= toConsume;

        // Update status if exhausted
        if (credit.remaining <= 0) {
          credit.status = MessageCreditStatus.EXHAUSTED;
        }

        await em.save(credit);
      }

      if (consumed > 0) {
        this.logger.debug(`Consumed ${consumed} bonus credits for org ${organizationId}`);
      }

      return consumed;
    });
  }

  /**
   * Get credits summary for an organization
   */
  async getCreditsSummary(organizationId: string): Promise<CreditsSummary> {
    const now = new Date();

    // Get active credits
    const activeCredits = await this.getActiveCredits(organizationId);

    // Get total expired credits
    const expiredCredits = await this.creditRepository
      .createQueryBuilder('credit')
      .select('COALESCE(SUM(credit.remaining), 0)', 'total')
      .where('credit.organizationId = :organizationId', { organizationId })
      .andWhere('credit.status = :status OR credit.expiresAt < :now', {
        status: MessageCreditStatus.EXPIRED,
        now,
      })
      .getRawOne();

    const totalAvailable = activeCredits.reduce((sum, c) => sum + c.remaining, 0);
    const totalUsed = activeCredits.reduce((sum, c) => sum + c.used, 0);

    // Find next expiration
    const nextExpiring = activeCredits.find(c => c.remaining > 0);

    return {
      totalAvailable,
      totalUsed,
      activeCredits: activeCredits.map(c => ({
        id: c.id,
        remaining: c.remaining,
        expiresAt: c.expiresAt,
        purchasedAt: c.createdAt,
      })),
      expiredCredits: parseInt(expiredCredits?.total || '0', 10),
      nextExpiration: nextExpiring
        ? {
            amount: nextExpiring.remaining,
            date: nextExpiring.expiresAt,
          }
        : undefined,
    };
  }

  /**
   * Get purchase history for an organization
   */
  async getPurchaseHistory(
    organizationId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<{ credits: MessageCredit[]; total: number }> {
    const [credits, total] = await this.creditRepository.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { credits, total };
  }

  /**
   * Create invoice for credit purchase
   */
  private async createCreditPurchaseInvoice(credit: MessageCredit): Promise<Invoice> {
    return this.invoiceService.createCreditInvoice({
      organizationId: credit.organizationId,
      amount: credit.totalAmountXAF,
      currency: 'XAF',
      description: `Achat de ${credit.amount} messages supplementaires`,
      lineItems: [
        {
          description: `${credit.amount} messages WhatsApp supplementaires`,
          quantity: credit.amount,
          unitPrice: credit.pricePerMessageXAF,
          total: credit.totalAmountXAF,
        },
      ],
      paymentReference: credit.transactionId,
      metadata: {
        type: 'message_credits',
        creditId: credit.id,
        ptn: credit.ptn,
        expiresAt: credit.expiresAt.toISOString(),
      },
    });
  }

  /**
   * Cron job to expire credits that have passed their expiration date
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireCredits(): Promise<void> {
    const now = new Date();

    const result = await this.creditRepository.update(
      {
        status: MessageCreditStatus.ACTIVE,
        expiresAt: LessThan(now),
      },
      {
        status: MessageCreditStatus.EXPIRED,
      }
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} message credit packs`);
    }
  }

  /**
   * Get pricing information for display
   */
  getPricingInfo() {
    return {
      pricePerMessage: {
        xaf: MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
        usd: MESSAGE_CREDIT_CONFIG.pricePerMessageUSD,
      },
      minimumPurchase: MESSAGE_CREDIT_CONFIG.minimumPurchase,
      minimumPrice: {
        xaf: MESSAGE_CREDIT_CONFIG.minimumPurchase * MESSAGE_CREDIT_CONFIG.pricePerMessageXAF,
        usd: MESSAGE_CREDIT_CONFIG.minimumPurchase * MESSAGE_CREDIT_CONFIG.pricePerMessageUSD,
      },
      expirationDays: MESSAGE_CREDIT_CONFIG.expirationDays,
    };
  }
}
