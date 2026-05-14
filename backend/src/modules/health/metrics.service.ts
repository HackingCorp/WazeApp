import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { DataSource } from "typeorm";

interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue("pending-messages") private pendingMessagesQueue: Queue,
    @InjectQueue("broadcast") private broadcastQueue: Queue,
    @InjectQueue("facebook-comments") private facebookCommentsQueue: Queue,
    @InjectQueue("document-processing")
    private documentProcessingQueue: Queue,
  ) {}

  async collectMetrics() {
    const [process_metrics, db, queues] = await Promise.all([
      this.getProcessMetrics(),
      this.getDatabaseMetrics(),
      this.getQueueMetrics(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      workerId: process.env.WORKER_ID || "0",
      process: process_metrics,
      database: db,
      queues,
    };
  }

  private getProcessMetrics() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    // Measure event loop lag
    const start = process.hrtime.bigint();
    const lagMs = Number(process.hrtime.bigint() - start) / 1e6;

    return {
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system,
      },
      eventLoopLagMs: lagMs,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async getDatabaseMetrics() {
    try {
      const result = await this.dataSource.query(`
        SELECT
          count(*) FILTER (WHERE state = 'active') AS active,
          count(*) FILTER (WHERE state = 'idle') AS idle,
          count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
          count(*) AS total
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      const row = result[0];
      return {
        connections: {
          active: parseInt(row.active, 10),
          idle: parseInt(row.idle, 10),
          idleInTransaction: parseInt(row.idle_in_transaction, 10),
          total: parseInt(row.total, 10),
        },
      };
    } catch (error) {
      return { connections: null, error: error.message };
    }
  }

  private async getQueueMetrics(): Promise<Record<string, QueueMetrics>> {
    const queues = {
      "pending-messages": this.pendingMessagesQueue,
      broadcast: this.broadcastQueue,
      "facebook-comments": this.facebookCommentsQueue,
      "document-processing": this.documentProcessingQueue,
    };

    const results: Record<string, QueueMetrics> = {};

    for (const [name, queue] of Object.entries(queues)) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ],
        );
        results[name] = { waiting, active, completed, failed, delayed };
      } catch {
        results[name] = {
          waiting: -1,
          active: -1,
          completed: -1,
          failed: -1,
          delayed: -1,
        };
      }
    }

    return results;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async logMetrics() {
    const metrics = await this.collectMetrics();
    this.logger.log(`METRICS ${JSON.stringify(metrics)}`);
  }
}
