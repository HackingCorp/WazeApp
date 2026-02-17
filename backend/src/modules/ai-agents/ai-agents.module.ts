import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AiAgent,
  AgentConversation,
  AgentMessage,
  KnowledgeBase,
  KnowledgeDocument,
  Organization,
  User,
  AuditLog,
  Subscription,
} from "../../common/entities";
import { AiAgentService } from "./ai-agent.service";
import { ConversationService } from "./conversation.service";
import { AiAgentController } from "./ai-agent.controller";
import { ConversationController } from "./conversation.controller";
import { AuditModule } from "../audit/audit.module";
import { LlmProvidersModule } from "../llm-providers/llm-providers.module";
import { VectorSearchModule } from "../vector-search/vector-search.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiAgent,
      AgentConversation,
      AgentMessage,
      KnowledgeBase,
      KnowledgeDocument,
      Organization,
      User,
      AuditLog,
      Subscription,
    ]),
    AuditModule,
    forwardRef(() => LlmProvidersModule),
    forwardRef(() => VectorSearchModule),
  ],
  controllers: [AiAgentController, ConversationController],
  providers: [AiAgentService, ConversationService],
  exports: [AiAgentService, ConversationService],
})
export class AiAgentsModule {}
