import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { 
  User, 
  Organization,
  AiAgent,
  AgentConversation,
  AgentMessage,
  WhatsAppSession 
} from "@/common/entities";

@Module({
  imports: [TypeOrmModule.forFeature([
    User, 
    Organization,
    AiAgent,
    AgentConversation,
    AgentMessage,
    WhatsAppSession
  ])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
