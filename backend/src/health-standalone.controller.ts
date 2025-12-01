import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthStandaloneController {
  @Get()
  check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "WizeApp Standalone",
      version: "1.0.0",
      mode: "standalone (no database)",
      features: [
        "Health checks",
        "Basic authentication (mock)",
        "Swagger documentation",
      ],
    };
  }

  @Get("live")
  live() {
    return {
      status: "alive",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get("ready")
  ready() {
    return {
      status: "ready",
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
    };
  }
}
