import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { S3PService } from './s3p.service';
import { SubscriptionUpgradeService, PaymentDetails } from './subscription-upgrade.service';

export interface PendingS3PTransaction {
  trid: string;
  ptn?: string;
  userId: string;
  organizationId?: string;
  plan: string;
  amount: number;
  currency: string;
  billingPeriod: 'monthly' | 'annually';
  createdAt: string;
}

@Injectable()
export class S3PReconciliationService {
  private readonly logger = new Logger(S3PReconciliationService.name);
  private readonly PENDING_KEY_PREFIX = 's3p:pending:';
  private readonly PENDING_LIST_KEY = 's3p:pending:list';
  private readonly MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly s3pService: S3PService,
    private readonly upgradeService: SubscriptionUpgradeService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Track a pending S3P transaction for later reconciliation.
   * Called when the verify endpoint returns PENDING status.
   */
  async trackPendingTransaction(tx: PendingS3PTransaction): Promise<void> {
    const key = `${this.PENDING_KEY_PREFIX}${tx.trid}`;
    await this.cacheManager.set(key, tx, 3600); // 1 hour TTL in seconds
    // Add TRID to the tracking list
    const list = await this.cacheManager.get<string[]>(this.PENDING_LIST_KEY) || [];
    if (!list.includes(tx.trid)) {
      list.push(tx.trid);
      await this.cacheManager.set(this.PENDING_LIST_KEY, list, 3600);
    }
  }

  /**
   * Remove a resolved (SUCCESS/FAILED/expired) transaction from tracking.
   */
  async removePendingTransaction(trid: string): Promise<void> {
    await this.cacheManager.del(`${this.PENDING_KEY_PREFIX}${trid}`);
    const list = await this.cacheManager.get<string[]>(this.PENDING_LIST_KEY) || [];
    const filtered = list.filter(t => t !== trid);
    if (filtered.length > 0) {
      await this.cacheManager.set(this.PENDING_LIST_KEY, filtered, 3600);
    } else {
      await this.cacheManager.del(this.PENDING_LIST_KEY);
    }
  }

  /**
   * Cron job: every 5 minutes, re-verify pending S3P transactions.
   * If SUCCESS → trigger subscription upgrade.
   * If FAILED/expired → remove from tracking.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingPayments(): Promise<void> {
    const list = await this.cacheManager.get<string[]>(this.PENDING_LIST_KEY);
    if (!list || list.length === 0) return;

    this.logger.log(`Reconciling ${list.length} pending S3P transaction(s)...`);

    for (const trid of list) {
      const tx = await this.cacheManager.get<PendingS3PTransaction>(
        `${this.PENDING_KEY_PREFIX}${trid}`,
      );
      if (!tx) {
        await this.removePendingTransaction(trid);
        continue;
      }

      // Remove if too old (1 hour)
      if (Date.now() - new Date(tx.createdAt).getTime() > this.MAX_AGE_MS) {
        this.logger.warn(`S3P transaction ${trid} expired after 1 hour, removing`);
        await this.removePendingTransaction(trid);
        continue;
      }

      try {
        const result = await this.s3pService.verifyPayment(tx.ptn, tx.trid);

        if (result.status === 'SUCCESS') {
          this.logger.log(`S3P cron: transaction ${trid} confirmed SUCCESS, upgrading subscription`);

          const paymentDetails: PaymentDetails = {
            transactionId: tx.trid,
            ptn: tx.ptn,
            plan: tx.plan as 'STANDARD' | 'PRO' | 'ENTERPRISE',
            amount: tx.amount,
            currency: tx.currency,
            billingPeriod: tx.billingPeriod,
            paymentMethod: 'mobile_money',
            paymentProvider: 's3p',
          };

          const upgradeType = tx.organizationId ? 'organization' : 'user';
          await this.upgradeService.atomicCheckAndUpgrade(
            tx.userId,
            tx.organizationId,
            tx.trid,
            paymentDetails,
            upgradeType,
          );

          await this.removePendingTransaction(trid);
        } else if (result.status === 'FAILED' || result.status === 'ERROR') {
          this.logger.log(`S3P cron: transaction ${trid} FAILED, removing from tracking`);
          await this.removePendingTransaction(trid);
        }
        // PENDING: leave for next cron cycle
      } catch (error) {
        this.logger.error(`Error reconciling S3P transaction ${trid}: ${error.message}`);
      }
    }
  }
}
