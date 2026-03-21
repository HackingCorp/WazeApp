import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PostHogService } from './posthog.service';

@Injectable()
export class PostHogEventListenerService {
  private readonly logger = new Logger(PostHogEventListenerService.name);

  constructor(private posthog: PostHogService) {}

  // ==========================================
  // WHATSAPP SESSION EVENTS
  // ==========================================

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

  @OnEvent('whatsapp.session.status')
  handleWhatsAppSessionStatus(payload: {
    sessionId: string;
    userId?: string;
    organizationId?: string;
    status: string;
    message?: string;
  }) {
    const distinctId = payload.userId || payload.organizationId;
    if (!distinctId) return;
    this.posthog.capture(distinctId, 'whatsapp_session_status_changed', {
      sessionId: payload.sessionId,
      status: payload.status,
    });
  }

  @OnEvent('whatsapp.session.error')
  handleWhatsAppSessionError(payload: {
    sessionId: string;
    userId?: string;
    organizationId?: string;
    errorType: string;
    message: string;
    requiresReauth?: boolean;
  }) {
    const distinctId = payload.userId || payload.organizationId;
    if (!distinctId) return;
    this.posthog.capture(distinctId, 'whatsapp_session_error', {
      sessionId: payload.sessionId,
      errorType: payload.errorType,
      requiresReauth: payload.requiresReauth,
    });
  }

  // ==========================================
  // CONVERSATION EVENTS
  // ==========================================

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

  @OnEvent('conversation.escalated')
  handleConversationEscalated(payload: {
    conversationId: string;
    agentId?: string;
    organizationId: string;
    clientPhoneNumber?: string;
    reason?: string;
  }) {
    this.posthog.capture(payload.organizationId, 'conversation_escalated', {
      conversationId: payload.conversationId,
      reason: payload.reason,
    });
  }

  @OnEvent('conversation.released')
  handleConversationReleased(payload: {
    conversationId: string;
    organizationId: string;
  }) {
    this.posthog.capture(payload.organizationId, 'conversation_released', {
      conversationId: payload.conversationId,
    });
  }

  @OnEvent('conversation.state.changed')
  handleConversationStateChanged(payload: {
    conversationId: string;
    previousState: string;
    newState: string;
    reason?: string;
  }) {
    // Use conversationId as fallback distinct ID
    this.posthog.capture(payload.conversationId, 'conversation_state_changed', {
      previousState: payload.previousState,
      newState: payload.newState,
      reason: payload.reason,
    });
  }

  // ==========================================
  // BROADCAST & CAMPAIGN EVENTS
  // ==========================================

  @OnEvent('broadcast.campaign.started')
  handleCampaignStarted(payload: {
    organizationId: string;
    campaignId: string;
  }) {
    this.posthog.capture(payload.organizationId, 'broadcast_campaign_started', {
      campaignId: payload.campaignId,
    });
  }

  @OnEvent('broadcast.campaign.completed')
  handleCampaignCompleted(payload: {
    organizationId: string;
    campaignId: string;
    stats?: Record<string, any>;
  }) {
    this.posthog.capture(payload.organizationId, 'broadcast_campaign_completed', {
      campaignId: payload.campaignId,
      totalSent: payload.stats?.sent,
      totalFailed: payload.stats?.failed,
      totalDelivered: payload.stats?.delivered,
    });
  }

  @OnEvent('broadcast.message.sent')
  handleBroadcastMessageSent(payload: {
    organizationId: string;
    campaignId: string;
  }) {
    this.posthog.capture(payload.organizationId, 'broadcast_message_sent', {
      campaignId: payload.campaignId,
    });
  }

  // ==========================================
  // ORDER & APPOINTMENT EVENTS
  // ==========================================

  @OnEvent('order.created')
  handleOrderCreated(payload: {
    order: any;
    organizationId: string;
  }) {
    this.posthog.capture(payload.organizationId, 'order_created', {
      orderId: payload.order?.id,
      totalAmount: payload.order?.totalAmount,
    });
  }

  @OnEvent('order.updated')
  handleOrderUpdated(payload: {
    order: any;
    organizationId: string;
    previousStatus?: string;
  }) {
    this.posthog.capture(payload.organizationId, 'order_status_updated', {
      orderId: payload.order?.id,
      previousStatus: payload.previousStatus,
      newStatus: payload.order?.status,
    });
  }

  @OnEvent('appointment.created')
  handleAppointmentCreated(payload: {
    appointment: any;
    organizationId: string;
  }) {
    this.posthog.capture(payload.organizationId, 'appointment_created', {
      appointmentId: payload.appointment?.id,
    });
  }

  // ==========================================
  // ANALYTICS EVENTS
  // ==========================================

  @OnEvent('analytics.conversation.metric')
  handleConversationMetric(payload: {
    conversationId: string;
    agentId: string;
    organizationId: string;
    metrics: {
      responseTimeMs?: number;
      kbHit?: boolean;
      webSearchUsed?: boolean;
      tokensUsed?: number;
    };
  }) {
    this.posthog.capture(payload.organizationId, 'ai_response_metrics', {
      agentId: payload.agentId,
      responseTimeMs: payload.metrics.responseTimeMs,
      kbHit: payload.metrics.kbHit,
      webSearchUsed: payload.metrics.webSearchUsed,
      tokensUsed: payload.metrics.tokensUsed,
    });
  }

  @OnEvent('analytics.kb.search')
  handleKBSearch(payload: {
    agentId: string;
    organizationId: string;
    resultsCount: number;
    kbHit: boolean;
    searchType?: string;
    topScore?: number;
  }) {
    this.posthog.capture(payload.organizationId, 'knowledge_base_search', {
      agentId: payload.agentId,
      resultsCount: payload.resultsCount,
      kbHit: payload.kbHit,
      searchType: payload.searchType,
      topScore: payload.topScore,
    });
  }

  // ==========================================
  // SYNC EVENTS
  // ==========================================

  @OnEvent('whatsapp.sync.completed')
  handleSyncCompleted(payload: {
    sessionId: string;
    userId?: string;
    organizationId?: string;
    messageCount?: number;
  }) {
    const distinctId = payload.userId || payload.organizationId;
    if (!distinctId) return;
    this.posthog.capture(distinctId, 'whatsapp_sync_completed', {
      sessionId: payload.sessionId,
      messageCount: payload.messageCount,
    });
  }

  @OnEvent('ecommerce.sync.completed')
  handleEcommerceSyncCompleted(payload: {
    storeId: string;
    productsCount: number;
    organizationId?: string;
  }) {
    if (!payload.organizationId) return;
    this.posthog.capture(payload.organizationId, 'ecommerce_sync_completed', {
      storeId: payload.storeId,
      productsCount: payload.productsCount,
    });
  }
}
