import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  LlmProvider,
  Organization,
  UsageMetric,
  AuditLog,
} from "../../common/entities";
import { LlmProviderService } from "./llm-provider.service";
import { LLMRouterService } from "./llm-router.service";
import { LlmProviderController } from "./llm-provider.controller";
import { DeepSeekProvider } from "./providers/deepseek.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { AuditService } from "../audit/audit.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LlmProvider,
      Organization,
      UsageMetric,
      AuditLog,
    ]),
  ],
  controllers: [LlmProviderController],
  providers: [LlmProviderService, LLMRouterService, AuditService],
  exports: [LlmProviderService, LLMRouterService],
})
export class LlmProvidersModule {}
