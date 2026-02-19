import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PostHogService } from './posthog.service';

@Injectable()
export class PostHogEventListenerService {
  private readonly logger = new Logger(PostHogEventListenerService.name);

  constructor(private posthog: PostHogService) {}

  @OnEvent('whatsapp.connection.update')
  handleWhatsAppConnectionUpdate(payload: {
    sessionId: string;
    userId?: string;
    status: string;
  }) {
    if (!payload.userId) return;
    if (payload.status === 'open') {
      this.posthog.capture(payload.userId, 'whatsapp_session_connected', {
        sessionId: payload.sessionId,
      });
    }
  }

  @OnEvent('message.processing.completed')
  handleMessageProcessingCompleted(payload: {
    userId?: string;
    conversationId: string;
    sessionId: string;
  }) {
    if (!payload.userId) return;
    this.posthog.capture(payload.userId, 'ai_conversation_completed', {
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
    });
  }
}
