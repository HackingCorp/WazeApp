import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { LLMRouterService } from '@/modules/llm-providers/llm-router.service';
import { getSupportChatSystemPrompt } from '../constants/support-chat-prompt';

class ConversationHistoryItem {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(5000)
  content: string;
}

class SupportChatRequestDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationHistoryItem)
  conversationHistory?: ConversationHistoryItem[];
}

interface SupportChatResponse {
  success: boolean;
  data: {
    response: string;
    timestamp: string;
    responseTime: number;
  };
}

@ApiTags('Support')
@Controller('support-chat')
export class SupportChatController {
  private readonly logger = new Logger(SupportChatController.name);

  constructor(private readonly llmRouterService: LLMRouterService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(@Body() dto: SupportChatRequestDto): Promise<SupportChatResponse> {
    const startTime = Date.now();

    try {
      const language = dto.language || 'en';
      const systemPrompt = getSupportChatSystemPrompt(language);

      // Build messages array with history (capped at last 20 messages)
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemPrompt },
      ];

      if (dto.conversationHistory?.length) {
        const recentHistory = dto.conversationHistory.slice(-20);
        for (const msg of recentHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      messages.push({ role: 'user', content: dto.message });

      const response = await this.llmRouterService.generateResponse({
        messages,
        temperature: 0.4,
        maxTokens: 800,
        organizationId: null,
      });

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          response: this.stripMarkdown(response.content),
          timestamp: new Date().toISOString(),
          responseTime,
        },
      };
    } catch (error) {
      this.logger.error(`Support chat error: ${error.message}`);

      const language = dto.language || 'en';
      const fallback =
        language === 'fr'
          ? "Desole, je rencontre un probleme technique. Veuillez reessayer dans quelques instants ou contactez support@wazeapp.ai."
          : 'Sorry, I encountered a technical issue. Please try again in a moment or contact support@wazeapp.ai.';

      return {
        success: true,
        data: {
          response: fallback,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        },
      };
    }
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/>\s/g, '')
      .replace(/\n\s*[-*+]\s/g, '\n')
      .trim();
  }
}
