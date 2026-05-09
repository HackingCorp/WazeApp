import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { BullModule } from "@nestjs/bull";
import { FacebookController } from "./facebook.controller";
import { FacebookService } from "./facebook.service";
import { FacebookCommentResponderService } from "./facebook-comment-responder.service";
import { FacebookCommentProcessor } from "./facebook-comment.processor";
import {
  FacebookPageSession,
  FacebookContact,
  User,
  Organization,
  AiAgent,
  AgentConversation,
  AgentMessage,
  UsageMetric,
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
  ConversationContext,
  LlmProvider,
} from "@/common/entities";
import { AuditModule } from "../audit/audit.module";
import { SubscriptionModule } from "../subscriptions/subscription.module";
import { ConversationManagementModule } from "../conversation-management/conversation-management.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacebookPageSession,
      FacebookContact,
      User,
      Organization,
      AiAgent,
      AgentConversation,
      AgentMessage,
      UsageMetric,
      KnowledgeBase,
      KnowledgeDocument,
      DocumentChunk,
      ConversationContext,
      LlmProvider,
    ]),
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    BullModule.registerQueue({
      name: "facebook-comments",
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    }),
    SubscriptionModule,
    ConversationManagementModule,
    AuditModule,
  ],
  controllers: [FacebookController],
  providers: [
    FacebookService,
    FacebookCommentResponderService,
    FacebookCommentProcessor,
  ],
  exports: [FacebookService, FacebookCommentResponderService],
})
export class FacebookModule {}
