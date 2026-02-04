import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BullModule } from "@nestjs/bull";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { BaileysService } from "./baileys.service";
import { SimpleConversationService } from "./simple-conversation.service";
import { WhatsAppGateway } from "./whatsapp.gateway";
import { WhatsAppAIResponderService } from "./whatsapp-ai-responder.service";
import { WhatsAppSessionMonitorService } from "./whatsapp-session-monitor.service";
// import { WhatsAppAIResponderSimpleService } from "./whatsapp-ai-responder-simple.service"; // DISABLED: Causes duplicate AI responses
import { WebSearchService } from "./web-search.service";
import { MediaAnalysisService } from "./media-analysis.service";
import { VisionService } from "./vision.service";
import { OpenSourceVisionService } from "./open-source-vision.service";
import { AudioTranscriptionService } from "./audio-transcription.service";
import { UnansweredMessageService } from "./unanswered-message.service";
import { UnansweredMessageProcessor } from "./unanswered-message.processor";
import { PendingMessageQueueService } from "./pending-message-queue.service";
import { PendingMessageProcessor } from "./pending-message.processor";
import { EmailModule } from "../email/email.module";
import {
  WhatsAppSession,
  WhatsAppContact,
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
      WhatsAppContact,
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
    EmailModule,
    BullModule.registerQueue({
      name: "message-catchup",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
    BullModule.registerQueue({
      name: "pending-messages",
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    }),
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
    WhatsAppSessionMonitorService,
    UnansweredMessageService,
    UnansweredMessageProcessor,
    PendingMessageQueueService,
    PendingMessageProcessor,
  ],
  exports: [
    WhatsAppService,
    BaileysService,
    SimpleConversationService,
    WhatsAppGateway,
    WhatsAppSessionMonitorService,
    PendingMessageQueueService,
  ],
})
export class WhatsAppModule {}
