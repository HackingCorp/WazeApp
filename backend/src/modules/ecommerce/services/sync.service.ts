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

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconciliationSync() {
    const stores = await this.storeRepository.find({
      where: { status: StoreConnectionStatus.CONNECTED },
    });

    for (const store of stores) {
      if (store.syncConfig?.autoSync) {
        const lastSync = store.syncConfig?.lastSyncAt
          ? new Date(store.syncConfig.lastSyncAt)
          : null;
        const interval = (store.syncConfig?.syncIntervalMinutes || 30) * 60 * 1000;

        if (!lastSync || Date.now() - lastSync.getTime() > interval) {
          this.logger.log(`Auto-sync triggered for store ${store.id} (${store.name})`);
          await this.triggerIncrementalSync(store.id);
        }
      }
    }
  }
}
