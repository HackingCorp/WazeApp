import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Repository } from "typeorm";
import { Queue } from "bull";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  WebhookEvent,
  AgentConversation,
  AgentMessage,
  AiAgent,
  ConversationContext,
  WhatsAppSession,
  UsageMetric,
} from "../../../common/entities";
import {
  WebhookEventType,
  MessageRole,
  MessageStatus,
  ConversationState,
  ConversationStatus,
  ConversationChannel,
  MessagePriority,
  ProcessingStatus,
  UsageMetricType,
  WhatsAppSessionStatus,
  AgentStatus,
} from "../../../common/enums";
import { ConversationStateService } from "./conversation-state.service";
import { MessageProcessingService } from "./message-processing.service";

export interface WhatsAppWebhookPayload {
  type: WebhookEventType;
  timestamp: number;
  from: string;
  to: string;
  message?: {
    id: string;
    type: "text" | "image" | "video" | "audio" | "document";
    text?: string;
    media?: {
      url: string;
      mimetype: string;
      filename?: string;
    };
  };
  status?: {
    id: string;
    status: "sent" | "delivered" | "read";
    timestamp: number;
  };
  presence?: {
    from: string;
    status: "typing" | "online" | "offline";
  };
}

export interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  conversationId?: string;
  messageId?: string;
  actions?: string[];
  error?: string;
  metrics?: {
    processingTimeMs: number;
    agentsTriggered: number;
    messagesGenerated: number;
  };
}

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private webhookRepository: Repository<WebhookEvent>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    @InjectQueue("webhook-processing")
    private webhookQueue: Queue,
    @InjectQueue("message-processing")
    private messageQueue: Queue,
    private conversationStateService: ConversationStateService,
    private messageProcessingService: MessageProcessingService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process incoming WhatsApp webhook
   */
  async processWebhook(
    payload: WhatsAppWebhookPayload,
    organizationId: string,
    sessionId?: string,
  ): Promise<WebhookProcessingResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Processing webhook: ${payload.type} from ${payload.from}`,
      );

      // Create webhook event record
      const webhookEvent = await this.createWebhookEvent(
        payload,
        organizationId,
      );

      // Queue for async processing
      const job = await this.webhookQueue.add(
        "process-webhook",
        {
          eventId: webhookEvent.id,
          payload,
          organizationId,
          sessionId,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          priority: this.getEventPriority(payload.type),
        },
      );

      // Handle immediate synchronous processing for certain events
      let result: WebhookProcessingResult;

      switch (payload.type) {
        case WebhookEventType.MESSAGE_RECEIVED:
          result = await this.handleMessageReceived(
            webhookEvent,
            payload,
            organizationId,
          );
          break;
        case WebhookEventType.MESSAGE_STATUS:
          result = await this.handleMessageStatus(webhookEvent, payload);
          break;
        case WebhookEventType.TYPING_START:
        case WebhookEventType.TYPING_STOP:
          result = await this.handlePresenceUpdate(webhookEvent, payload);
          break;
        case WebhookEventType.CONNECTION_UPDATE:
          result = await this.handleConnectionUpdate(
            webhookEvent,
            payload,
            organizationId,
          );
          break;
        default:
          result = await this.handleGenericEvent(webhookEvent, payload);
      }

      const processingTime = Date.now() - startTime;
      result.metrics = {
        ...result.metrics,
        processingTimeMs: processingTime,
      };

      // Update webhook event with result
      await this.webhookRepository.update(webhookEvent.id, {
        processingStatus: result.success
          ? ProcessingStatus.COMPLETED
          : ProcessingStatus.FAILED,
        processedData: result as any,
        processingError: result.error,
        processingCompletedAt: new Date(),
      });

      // Emit processed event
      this.eventEmitter.emit("webhook.processed", {
        event: webhookEvent,
        result,
        payload,
      });

      // Record usage metrics
      await this.recordWebhookMetrics(
        organizationId,
        payload.type,
        processingTime,
      );

      this.logger.log(
        `Webhook processed in ${processingTime}ms: ${webhookEvent.id}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Webhook processing failed: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        eventId: "unknown",
        error: error.message,
        metrics: {
          processingTimeMs: Date.now() - startTime,
          agentsTriggered: 0,
          messagesGenerated: 0,
        },
      };
    }
  }

  /**
   * Handle incoming message from WhatsApp
   */
  private async handleMessageReceived(
    webhookEvent: WebhookEvent,
    payload: WhatsAppWebhookPayload,
    organizationId: string,
  ): Promise<WebhookProcessingResult> {
    const { message } = payload;
    if (!message) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: "No message data in payload",
      };
    }

    try {
      // Find or create conversation
      const conversation = await this.findOrCreateConversation(
        payload.from,
        organizationId,
      );

      // Save incoming message
      const incomingMessage = await this.saveIncomingMessage(
        conversation.id,
        message,
        payload,
      );

      // Find appropriate agent to handle the conversation
      const agent = await this.findAgentForConversation(conversation);
      if (!agent) {
        throw new Error("No available agent found for conversation");
      }

      // Queue message for AI processing
      await this.messageProcessingService.queueMessage({
        messageId: incomingMessage.id,
        conversationId: conversation.id,
        agentId: agent.id,
        content: message.text || "[Media message]",
        mediaUrls: message.media ? [message.media.url] : undefined,
        priority: MessagePriority.NORMAL,
        organizationId,
        metadata: {
          whatsappMessageId: message.id,
          from: payload.from,
          to: payload.to,
          timestamp: payload.timestamp,
        },
      });

      // Emit message received event
      this.eventEmitter.emit("message.received", {
        conversationId: conversation.id,
        message: incomingMessage,
        organizationId,
      });

      return {
        success: true,
        eventId: webhookEvent.id,
        conversationId: conversation.id,
        messageId: incomingMessage.id,
        actions: ["message_saved", "ai_processing_queued"],
        metrics: {
          processingTimeMs: 0, // Will be set by caller
          agentsTriggered: 1,
          messagesGenerated: 0,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to handle message: ${error.message}`);
      return {
        success: false,
        eventId: webhookEvent.id,
        error: error.message,
      };
    }
  }

  /**
   * Handle message status updates (sent, delivered, read)
   */
  private async handleMessageStatus(
    webhookEvent: WebhookEvent,
    payload: WhatsAppWebhookPayload,
  ): Promise<WebhookProcessingResult> {
    const { status } = payload;
    if (!status) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: "No status data in payload",
      };
    }

    try {
      // Find message by WhatsApp message ID
      const message = await this.messageRepository.findOne({
        where: {
          metadata: {
            whatsappMessageId: status.id,
          } as any,
        },
      });

      if (message) {
        // Update message status
        await this.messageRepository.update(message.id, {
          status: status.status as MessageStatus,
          metadata: {
            ...message.metadata,
            error: {
              message: `Status updated to ${status.status}`,
              code: "STATUS_UPDATE",
              timestamp: new Date(status.timestamp * 1000),
            },
          },
        });

        // Emit status update event
        this.eventEmitter.emit("message.status.updated", {
          messageId: message.id,
          conversationId: message.conversationId,
          status: status.status,
          timestamp: new Date(status.timestamp * 1000),
        });
      }

      return {
        success: true,
        eventId: webhookEvent.id,
        messageId: message?.id,
        actions: ["message_status_updated"],
        metrics: {
          processingTimeMs: 0,
          agentsTriggered: 0,
          messagesGenerated: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: error.message,
      };
    }
  }

  /**
   * Handle presence updates (typing, online, offline)
   */
  private async handlePresenceUpdate(
    webhookEvent: WebhookEvent,
    payload: WhatsAppWebhookPayload,
  ): Promise<WebhookProcessingResult> {
    const { presence } = payload;
    if (!presence) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: "No presence data in payload",
      };
    }

    try {
      // Find conversation
      const conversation = await this.conversationRepository.findOne({
        where: {
          externalId: presence.from,
        },
      });

      if (conversation) {
        // Emit presence update event for real-time updates
        this.eventEmitter.emit("presence.updated", {
          conversationId: conversation.id,
          from: presence.from,
          status: presence.status,
          timestamp: new Date(),
        });

        // Update conversation context with presence info
        await this.conversationStateService.updateContext(conversation.id, {
          sessionData: {
            customFields: {
              lastPresence: {
                status: presence.status,
                timestamp: new Date().toISOString(),
              },
            },
          },
        });
      }

      return {
        success: true,
        eventId: webhookEvent.id,
        conversationId: conversation?.id,
        actions: ["presence_updated"],
        metrics: {
          processingTimeMs: 0,
          agentsTriggered: 0,
          messagesGenerated: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: error.message,
      };
    }
  }

  /**
   * Handle WhatsApp connection updates
   */
  private async handleConnectionUpdate(
    webhookEvent: WebhookEvent,
    payload: WhatsAppWebhookPayload,
    organizationId: string,
  ): Promise<WebhookProcessingResult> {
    try {
      // Update session status
      if (payload.to) {
        await this.sessionRepository.update(
          { organizationId, phoneNumber: payload.to },
          {
            status:
              payload.type === WebhookEventType.CONNECTION_UPDATE
                ? WhatsAppSessionStatus.CONNECTED
                : WhatsAppSessionStatus.DISCONNECTED,
            lastSeenAt: new Date(),
            metadata: {},
          },
        );
      }

      // Emit connection update event
      this.eventEmitter.emit("whatsapp.connection.updated", {
        organizationId,
        phoneNumber: payload.to,
        status:
          payload.type === WebhookEventType.CONNECTION_UPDATE
            ? "connected"
            : "disconnected",
        timestamp: new Date(),
      });

      return {
        success: true,
        eventId: webhookEvent.id,
        actions: ["session_status_updated"],
        metrics: {
          processingTimeMs: 0,
          agentsTriggered: 0,
          messagesGenerated: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        eventId: webhookEvent.id,
        error: error.message,
      };
    }
  }

  /**
   * Handle generic webhook events
   */
  private async handleGenericEvent(
    webhookEvent: WebhookEvent,
    payload: WhatsAppWebhookPayload,
  ): Promise<WebhookProcessingResult> {
    // Log the event for monitoring
    this.logger.log(`Received webhook event: ${payload.type}`);

    // Emit generic event
    this.eventEmitter.emit("webhook.event.received", {
      eventId: webhookEvent.id,
      type: payload.type,
      payload,
    });

    return {
      success: true,
      eventId: webhookEvent.id,
      actions: ["event_logged"],
      metrics: {
        processingTimeMs: 0,
        agentsTriggered: 0,
        messagesGenerated: 0,
      },
    };
  }

  /**
   * Find or create conversation for WhatsApp number
   */
  private async findOrCreateConversation(
    whatsappNumber: string,
    organizationId: string,
  ): Promise<AgentConversation> {
    // Try to find existing conversation
    let conversation = await this.conversationRepository.findOne({
      where: {
        externalId: whatsappNumber,
        agent: {
          organizationId,
        },
        status: ConversationStatus.ACTIVE,
      },
      relations: ["agent"],
    });

    if (!conversation) {
      // Find default agent for organization
      const defaultAgent = await this.agentRepository.findOne({
        where: {
          organizationId,
          status: AgentStatus.ACTIVE,
        },
      });

      if (!defaultAgent) {
        throw new Error("No default agent found for organization");
      }

      // Create new conversation
      conversation = this.conversationRepository.create({
        externalId: whatsappNumber,
        agentId: defaultAgent.id,
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.ACTIVE,
        startedAt: new Date(),
        context: {
          sessionId: whatsappNumber,
          userProfile: { phone: whatsappNumber },
          customData: {
            source: "whatsapp_webhook",
            createdAt: new Date().toISOString(),
          },
        },
      });

      conversation = await this.conversationRepository.save(conversation);

      // Initialize conversation context
      await this.conversationStateService.initializeContext(conversation.id, {
        userProfile: { phone: whatsappNumber },
      });

      this.logger.log(
        `Created new conversation: ${conversation.id} for ${whatsappNumber}`,
      );
    }

    return conversation;
  }

  /**
   * Save incoming WhatsApp message
   */
  private async saveIncomingMessage(
    conversationId: string,
    message: WhatsAppWebhookPayload["message"],
    payload: WhatsAppWebhookPayload,
  ): Promise<AgentMessage> {
    const agentMessage = this.messageRepository.create({
      conversationId,
      role: MessageRole.USER,
      content: message.text || "[Media message]",
      status: MessageStatus.DELIVERED,
      sequenceNumber: 1, // Will be updated by conversation service
      externalMessageId: message.id,
      metadata: {
        attachments: message.media
          ? [
              {
                type: message.media.mimetype?.startsWith("image/")
                  ? ("image" as const)
                  : message.media.mimetype?.startsWith("video/")
                    ? ("video" as const)
                    : message.media.mimetype?.startsWith("audio/")
                      ? ("audio" as const)
                      : ("document" as const),
                url: message.media.url,
                name: message.media.filename || "attachment",
                size: (message.media as any).filesize || 0,
              },
            ]
          : [],
      },
    });

    return this.messageRepository.save(agentMessage);
  }

  /**
   * Find appropriate agent for conversation
   */
  private async findAgentForConversation(
    conversation: AgentConversation,
  ): Promise<AiAgent | null> {
    // If conversation already has an agent, use it
    if (conversation.agent) {
      return conversation.agent;
    }

    // Otherwise, find default agent
    return this.agentRepository.findOne({
      where: {
        // organizationId: conversation.organizationId, // TODO: Get from agent relation
        status: AgentStatus.ACTIVE,
      },
    });
  }

  /**
   * Create webhook event record
   */
  private async createWebhookEvent(
    payload: WhatsAppWebhookPayload,
    organizationId: string,
  ): Promise<WebhookEvent> {
    const webhookEvent = this.webhookRepository.create({
      eventType: payload.type,
      organizationId,
      payload: payload,
      processingStatus: ProcessingStatus.PENDING,
      sourcePhone: payload.from,
      targetPhone: payload.to,
    });

    return this.webhookRepository.save(webhookEvent);
  }

  /**
   * Get event processing priority
   */
  private getEventPriority(eventType: WebhookEventType): number {
    const priorities = {
      [WebhookEventType.MESSAGE_RECEIVED]: 10, // Highest priority
      [WebhookEventType.MESSAGE_STATUS]: 5,
      [WebhookEventType.TYPING_START]: 3,
      [WebhookEventType.TYPING_STOP]: 3,
      [WebhookEventType.CONNECTION_UPDATE]: 7,
      [WebhookEventType.GROUP_UPDATE]: 4,
      [WebhookEventType.CONTACT_UPDATE]: 2,
    };

    return priorities[eventType] || 1;
  }

  /**
   * Record webhook processing metrics
   */
  private async recordWebhookMetrics(
    organizationId: string,
    eventType: WebhookEventType,
    processingTimeMs: number,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Record webhook event metric
    await this.usageMetricRepository.upsert(
      {
        organizationId,
        type: UsageMetricType.WEBHOOK_EVENTS,
        date: today,
        value: 1,
        metadata: {},
      },
      ["organizationId", "type", "date"],
    );
  }

  /**
   * Get webhook processing statistics
   */
  async getWebhookStats(
    organizationId: string,
    timeframe: "day" | "week" | "month" = "day",
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<WebhookEventType, number>;
    avgProcessingTime: number;
    errorRate: number;
  }> {
    const days = timeframe === "day" ? 1 : timeframe === "week" ? 7 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await this.webhookRepository.find({
      where: {
        organizationId,
        createdAt: since,
      },
    });

    const stats = {
      totalEvents: events.length,
      eventsByType: {} as Record<WebhookEventType, number>,
      avgProcessingTime: 0,
      errorRate: 0,
    };

    if (events.length === 0) {
      return stats;
    }

    // Count events by type
    const eventCounts = events.reduce(
      (acc, event) => {
        acc[event.eventType] = (acc[event.eventType] || 0) + 1;
        return acc;
      },
      {} as Record<WebhookEventType, number>,
    );

    stats.eventsByType = eventCounts;

    // Calculate processing times and errors
    const completedEvents = events.filter((e) => e.processingCompletedAt);
    if (completedEvents.length > 0) {
      const totalProcessingTime = completedEvents.reduce((sum, event) => {
        const processingTime =
          event.processingCompletedAt.getTime() - event.createdAt.getTime();
        return sum + processingTime;
      }, 0);
      stats.avgProcessingTime = totalProcessingTime / completedEvents.length;
    }

    const failedEvents = events.filter(
      (e) => e.processingStatus === ProcessingStatus.FAILED,
    );
    stats.errorRate = failedEvents.length / events.length;

    return stats;
  }
}
