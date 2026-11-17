import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EcommerceStore } from "@/common/entities";
import { StoreConnectionStatus } from "@/common/enums";

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectQueue("ecommerce-sync")
    private readonly syncQueue: Queue,
    @InjectRepository(EcommerceStore)
    private readonly storeRepository: Repository<EcommerceStore>,
  ) {}

  async triggerFullSync(storeId: string): Promise<{ jobId: string }> {
    const job = await this.syncQueue.add("full-sync", { storeId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });

    this.logger.log(`Triggered full sync for store ${storeId}, job ${job.id}`);
    return { jobId: String(job.id) };
  }

  async triggerIncrementalSync(storeId: string): Promise<{ jobId: string }> {
    const job = await this.syncQueue.add("incremental-sync", { storeId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
    });

    this.logger.log(`Triggered incremental sync for store ${storeId}, job ${job.id}`);
    return { jobId: String(job.id) };
  }

  async getSyncStatus(storeId: string): Promise<{
    status: StoreConnectionStatus;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    totalProductsSynced: number;
  }> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });

    return {
      status: store?.status || StoreConnectionStatus.DISCONNECTED,
      lastSyncAt: store?.syncConfig?.lastSyncAt || null,
      lastSyncStatus: store?.syncConfig?.lastSyncStatus || null,
      totalProductsSynced: store?.syncConfig?.totalProductsSynced || 0,
    };
  }

  /** Back-off before retrying a store whose last sync errored. */
  private static readonly ERROR_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconciliationSync() {
    // A store that errors is left in ERROR, and this job used to look only at
    // CONNECTED stores — so a transient upstream outage parked it forever. One
    // 502 on 2026-03-09 froze a 36-product catalogue for eight months. Errored
    // stores are retried too, just less often.
    const stores = await this.storeRepository.find({
      where: [
        { status: StoreConnectionStatus.CONNECTED },
        { status: StoreConnectionStatus.ERROR },
      ],
    });

    for (const store of stores) {
      if (!store.syncConfig?.autoSync) continue;

      const lastSync = store.syncConfig?.lastSyncAt
        ? new Date(store.syncConfig.lastSyncAt)
        : null;
      const isErrored = store.status === StoreConnectionStatus.ERROR;
      const interval = isErrored
        ? SyncService.ERROR_RETRY_INTERVAL_MS
        : (store.syncConfig?.syncIntervalMinutes || 30) * 60 * 1000;

      if (!lastSync || Date.now() - lastSync.getTime() > interval) {
        this.logger.log(
          `Auto-sync triggered for store ${store.id} (${store.name})` +
            (isErrored ? " — retrying after a previous error" : ""),
        );
        await this.triggerIncrementalSync(store.id);
      }
    }
  }
}
