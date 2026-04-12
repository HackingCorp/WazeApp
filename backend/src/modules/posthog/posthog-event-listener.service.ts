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
    organizationId?: string;
    status: string;
  }) {
    if (!payload.userId) return;
    if (payload.status === 'open') {
      this.posthog.capture(payload.userId, 'whatsapp_session_connected', {
        sessionId: payload.sessionId,
        organizationId: payload.organizationId,
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
    if (!payload.userId) return;
    this.posthog.capture(payload.userId, 'whatsapp_session_status_changed', {
      sessionId: payload.sessionId,
      status: payload.status,
      organizationId: payload.organizationId,
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
    if (!payload.userId) return;
    this.posthog.capture(payload.userId, 'whatsapp_session_error', {
      sessionId: payload.sessionId,
      errorType: payload.errorType,
      requiresReauth: payload.requiresReauth,
      organizationId: payload.organizationId,
    });
  }

  // ==========================================
  // CONVERSATION EVENTS
  // ==========================================

  @OnEvent('message.processing.completed')
  handleMessageProcessingCompleted(payload: {
    userId?: string;
    organizationId?: string;
    conversationId: string;
    sessionId: string;
  }) {
    if (!payload.userId) return;
    this.posthog.capture(payload.userId, 'ai_conversation_completed', {
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('conversation.escalated')
  handleConversationEscalated(payload: {
    conversationId: string;
    agentId?: string;
    userId?: string;
    organizationId: string;
    clientPhoneNumber?: string;
    reason?: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'conversation_escalated', {
      conversationId: payload.conversationId,
      reason: payload.reason,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('conversation.released')
  handleConversationReleased(payload: {
    conversationId: string;
    userId?: string;
    organizationId: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'conversation_released', {
      conversationId: payload.conversationId,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('conversation.state.changed')
  handleConversationStateChanged(payload: {
    conversationId: string;
    userId?: string;
    organizationId?: string;
    previousState: string;
    newState: string;
    reason?: string;
  }) {
    const distinctId = payload.userId || (payload.organizationId ? `org:${payload.organizationId}` : null);
    if (!distinctId) return;
    this.posthog.capture(distinctId, 'conversation_state_changed', {
      conversationId: payload.conversationId,
      previousState: payload.previousState,
      newState: payload.newState,
      reason: payload.reason,
      organizationId: payload.organizationId,
    });
  }

  // ==========================================
  // BROADCAST & CAMPAIGN EVENTS
  // ==========================================

  @OnEvent('broadcast.campaign.started')
  handleCampaignStarted(payload: {
    userId?: string;
    organizationId: string;
    campaignId: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'broadcast_campaign_started', {
      campaignId: payload.campaignId,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('broadcast.campaign.completed')
  handleCampaignCompleted(payload: {
    userId?: string;
    organizationId: string;
    campaignId: string;
    stats?: Record<string, any>;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'broadcast_campaign_completed', {
      campaignId: payload.campaignId,
      totalSent: payload.stats?.sent,
      totalFailed: payload.stats?.failed,
      totalDelivered: payload.stats?.delivered,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('broadcast.message.sent')
  handleBroadcastMessageSent(payload: {
    userId?: string;
    organizationId: string;
    campaignId: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'broadcast_message_sent', {
      campaignId: payload.campaignId,
      organizationId: payload.organizationId,
    });
  }

  // ==========================================
  // ORDER & APPOINTMENT EVENTS
  // ==========================================

  @OnEvent('order.created')
  handleOrderCreated(payload: {
    order: any;
    userId?: string;
    organizationId: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'order_created', {
      orderId: payload.order?.id,
      totalAmount: payload.order?.totalAmount,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('order.updated')
  handleOrderUpdated(payload: {
    order: any;
    userId?: string;
    organizationId: string;
    previousStatus?: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'order_status_updated', {
      orderId: payload.order?.id,
      previousStatus: payload.previousStatus,
      newStatus: payload.order?.status,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('appointment.created')
  handleAppointmentCreated(payload: {
    appointment: any;
    userId?: string;
    organizationId: string;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'appointment_created', {
      appointmentId: payload.appointment?.id,
      organizationId: payload.organizationId,
    });
  }

  // ==========================================
  // ANALYTICS EVENTS
  // ==========================================

  @OnEvent('analytics.conversation.metric')
  handleConversationMetric(payload: {
    conversationId: string;
    agentId: string;
    userId?: string;
    organizationId: string;
    metrics: {
      responseTimeMs?: number;
      kbHit?: boolean;
      webSearchUsed?: boolean;
      tokensUsed?: number;
    };
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'ai_response_metrics', {
      agentId: payload.agentId,
      conversationId: payload.conversationId,
      responseTimeMs: payload.metrics.responseTimeMs,
      kbHit: payload.metrics.kbHit,
      webSearchUsed: payload.metrics.webSearchUsed,
      tokensUsed: payload.metrics.tokensUsed,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('analytics.kb.search')
  handleKBSearch(payload: {
    agentId: string;
    userId?: string;
    organizationId: string;
    resultsCount: number;
    kbHit: boolean;
    searchType?: string;
    topScore?: number;
  }) {
    const distinctId = payload.userId || `org:${payload.organizationId}`;
    this.posthog.capture(distinctId, 'knowledge_base_search', {
      agentId: payload.agentId,
      resultsCount: payload.resultsCount,
      kbHit: payload.kbHit,
      searchType: payload.searchType,
      topScore: payload.topScore,
      organizationId: payload.organizationId,
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
    if (!payload.userId) return;
    this.posthog.capture(payload.userId, 'whatsapp_sync_completed', {
      sessionId: payload.sessionId,
      messageCount: payload.messageCount,
      organizationId: payload.organizationId,
    });
  }

  @OnEvent('ecommerce.sync.completed')
  handleEcommerceSyncCompleted(payload: {
    storeId: string;
    productsCount: number;
    userId?: string;
    organizationId?: string;
  }) {
    const distinctId = payload.userId || (payload.organizationId ? `org:${payload.organizationId}` : null);
    if (!distinctId) return;
    this.posthog.capture(distinctId, 'ecommerce_sync_completed', {
      storeId: payload.storeId,
      productsCount: payload.productsCount,
      organizationId: payload.organizationId,
    });
  }
}
