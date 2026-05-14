import * as cluster from "cluster";
import { Logger } from "@nestjs/common";

const logger = new Logger("Cluster");

const numWorkers = parseInt(process.env.CLUSTER_WORKERS || "1", 10);

if (numWorkers <= 1) {
  // Single-worker mode: just run main.ts directly (equivalent to current behavior)
  process.env.WORKER_ID = "0";
  require("./main");
} else if ((cluster as any).isPrimary) {
  logger.log(`Primary process ${process.pid} starting ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = (cluster as any).fork({ WORKER_ID: String(i) });
    logger.log(`Forked worker ${i} (pid: ${worker.process.pid})`);
  }

  (cluster as any).on("exit", (worker: any, code: number, signal: string) => {
    const workerId = worker.process.env?.WORKER_ID || "?";
    logger.warn(
      `Worker ${workerId} (pid: ${worker.process.pid}) exited with code ${code} signal ${signal}`,
    );

    // Restart crashed workers after a brief delay
    setTimeout(() => {
      const newWorker = (cluster as any).fork({
        WORKER_ID: workerId,
      });
      logger.log(
        `Restarted worker ${workerId} (new pid: ${newWorker.process.pid})`,
      );
    }, 2000);
  });
} else {
  // Worker process
  process.env.WORKER_ID = process.env.WORKER_ID || "0";
  logger.log(
    `Worker ${process.env.WORKER_ID} (pid: ${process.pid}) starting`,
  );
  require("./main");
}
