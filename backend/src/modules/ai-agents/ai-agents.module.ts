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
  EcommerceStore,
} from "../../common/entities";
import { AiAgentService } from "./ai-agent.service";
import { ConversationService } from "./conversation.service";
import { AiAgentController } from "./ai-agent.controller";
import { ConversationController } from "./conversation.controller";
import { AuditModule } from "../audit/audit.module";
import { LlmProvidersModule } from "../llm-providers/llm-providers.module";
import { VectorSearchModule } from "../vector-search/vector-search.module";
import { EcommerceModule } from "../ecommerce/ecommerce.module";
import { OrdersModule } from "../orders/orders.module";

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
      EcommerceStore,
    ]),
    AuditModule,
    forwardRef(() => LlmProvidersModule),
    forwardRef(() => VectorSearchModule),
    forwardRef(() => EcommerceModule),
    OrdersModule,
  ],
  controllers: [AiAgentController, ConversationController],
  providers: [AiAgentService, ConversationService],
  exports: [AiAgentService, ConversationService],
})
export class AiAgentsModule {}
