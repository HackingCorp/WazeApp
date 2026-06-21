import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Lead, Order, AgentConversation, AiAgent } from "@/common/entities";
import { LeadController } from "./controllers/lead.controller";
import { LeadService } from "./services/lead.service";
import { LeadScoringService } from "./services/lead-scoring.service";
import { LeadReportService } from "./services/lead-report.service";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Order, AgentConversation, AiAgent]),
    EmailModule,
  ],
  controllers: [LeadController],
  providers: [LeadService, LeadScoringService, LeadReportService],
  exports: [LeadService, LeadScoringService],
})
export class LeadsModule {}
