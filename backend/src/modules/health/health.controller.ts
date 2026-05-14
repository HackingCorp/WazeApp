import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from "@nestjs/terminus";
import { Public } from "@/common/decorators/public.decorator";
import { MetricsService } from "./metrics.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private metricsService: MetricsService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "Health check endpoint" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  @ApiResponse({ status: 503, description: "Service is unhealthy" })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck("database", { timeout: 10000 }),
      // Heap memory threshold: 2 GB (for AI/LLM processing + E-Market sync + WhatsApp sessions)
      () => this.memory.checkHeap("memory_heap", 2048 * 1024 * 1024),
      // RSS memory threshold: 3 GB (for WhatsApp sessions + Node.js overhead + sync operations)
      () => this.memory.checkRSS("memory_rss", 3072 * 1024 * 1024),
      () =>
        this.disk.checkStorage("storage", {
          path: "/",
          thresholdPercent: 0.9,
        }),
    ]);
  }

  @Get("ready")
  @Public()
  @ApiOperation({ summary: "Readiness probe" })
  @ApiResponse({ status: 200, description: "Service is ready" })
  ready() {
    return { status: "ready", timestamp: new Date().toISOString() };
  }

  @Get("live")
  @Public()
  @ApiOperation({ summary: "Liveness probe" })
  @ApiResponse({ status: 200, description: "Service is alive" })
  live() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

  @Get("metrics")
  @Public()
  @ApiOperation({ summary: "Application metrics" })
  @ApiResponse({ status: 200, description: "Returns process, DB, and queue metrics" })
  metrics() {
    return this.metricsService.collectMetrics();
  }
}
