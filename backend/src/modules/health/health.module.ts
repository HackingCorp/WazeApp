import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { BullModule } from "@nestjs/bull";
import { HealthController } from "./health.controller";
import { MetricsService } from "./metrics.service";

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue(
      { name: "pending-messages" },
      { name: "broadcast" },
      { name: "facebook-comments" },
      { name: "document-processing" },
    ),
  ],
  controllers: [HealthController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
