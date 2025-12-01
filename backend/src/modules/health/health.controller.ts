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

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "Health check endpoint" })
  @ApiResponse({ status: 200, description: "Service is healthy" })
  @ApiResponse({ status: 503, description: "Service is unhealthy" })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck("database"),
      () => this.memory.checkHeap("memory_heap", 512 * 1024 * 1024),
      () => this.memory.checkRSS("memory_rss", 256 * 1024 * 1024),
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
}
