import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { BaileysService } from "./baileys.service";
import { SimpleConversationService } from "./simple-conversation.service";
import { WhatsAppGateway } from "./whatsapp.gateway";
import { WhatsAppAIResponderService } from "./whatsapp-ai-responder.service";
// import { WhatsAppAIResponderSimpleService } from "./whatsapp-ai-responder-simple.service"; // DISABLED: Causes duplicate AI responses
import { WebSearchService } from "./web-search.service";
import { MediaAnalysisService } from "./media-analysis.service";
import { VisionService } from "./vision.service";
import { OpenSourceVisionService } from "./open-source-vision.service";
import { AudioTranscriptionService } from "./audio-transcription.service";
import {
  WhatsAppSession,
  OrganizationMember,
  UsageMetric,
  AuditLog,
  AgentConversation,
  AgentMessage,
  User,
  AiAgent,
  Organization,
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
} from "@/common/entities";
import { AuditService } from "../audit/audit.service";
import { SubscriptionModule } from "../subscriptions/subscription.module";
import { LlmProvidersModule } from "../llm-providers/llm-providers.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppSession,
      OrganizationMember,
      UsageMetric,
      AuditLog,
      AgentConversation,
      AgentMessage,
      User,
      AiAgent,
      Organization,
      KnowledgeBase,
      KnowledgeDocument,
      DocumentChunk,
    ]),
    ConfigModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: "15m" },
      }),
    }),
    SubscriptionModule,
    LlmProvidersModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    BaileysService,
    SimpleConversationService,
    AuditService,
    WhatsAppGateway,
    WhatsAppAIResponderService,
    // WhatsAppAIResponderSimpleService, // DISABLED: Causes duplicate AI responses
    WebSearchService,
    MediaAnalysisService,
    VisionService,
    OpenSourceVisionService,
    AudioTranscriptionService,
  ],
  exports: [WhatsAppService, SimpleConversationService, WhatsAppGateway],
})
export class WhatsAppModule {}
