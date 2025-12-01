import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Repository } from "typeorm";
import { Queue } from "bull";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  MessageQueue,
  AgentMessage,
  AgentConversation,
  AiAgent,
  ConversationContext,
  UsageMetric,
} from "../../../common/entities";
import {
  MessagePriority,
  ProcessingStatus,
  MessageRole,
  MessageStatus,
  ConversationState,
  UsageMetricType,
} from "../../../common/enums";
import { ConversationStateService } from "./conversation-state.service";

export interface MessageProcessingJob {
  messageId: string;
  conversationId: string;
  agentId: string;
  content: string;
  mediaUrls?: string[];
  metadata?: Record<string, any>;
  priority: MessagePriority;
  organizationId: string;
  userId?: string;
}

export interface ProcessingResult {
  success: boolean;
  messageId: string;
  response?: {
    content: string;
    mediaUrls?: string[];
    metadata?: Record<string, any>;
  };
  error?: string;
  metrics?: {
    processingTimeMs: number;
    tokensUsed: number;
    contextLength: number;
  };
}

@Injectable()
export class MessageProcessingService {
  private readonly logger = new Logger(MessageProcessingService.name);

  constructor(
    @InjectRepository(MessageQueue)
    private queueRepository: Repository<MessageQueue>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    @InjectQueue("message-processing")
    private messageQueue: Queue,
    private conversationStateService: ConversationStateService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Queue message for processing
   */
  async queueMessage(job: MessageProcessingJob): Promise<MessageQueue> {
    this.logger.log(`Queueing message for processing: ${job.messageId}`);

    // Create queue entry
    const queueEntry = this.queueRepository.create({
      jobType: "process-message",
      priority: job.priority,
      payload: job,
      organizationId: job.organizationId,
      conversationId: job.conversationId,
      scheduledAt: new Date(),
    });

    const saved = await this.queueRepository.save(queueEntry);

    // Add to BullMQ
    await this.messageQueue.add(
      "process-message",
      {
        queueId: saved.id,
        ...job,
      },
      {
        priority: this.getPriorityWeight(job.priority),
        delay: this.getProcessingDelay(job.priority),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    );

    // Update conversation state to processing
    if (job.conversationId) {
      const context = await this.conversationStateService.getContext(
        job.conversationId,
      );
      if (
        context.currentState === ConversationState.WAITING_INPUT ||
        context.currentState === ConversationState.GREETING
      ) {
        await this.conversationStateService.transitionState(
          job.conversationId,
          ConversationState.PROCESSING,
          "Message queued for processing",
          { messageId: job.messageId },
        );
      }
    }

    return saved;
  }

  /**
   * Process message (called by queue processor)
   */
  async processMessage(
    queueId: string,
    job: MessageProcessingJob,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing message: ${job.messageId}`);

      // Update queue status
      await this.updateQueueStatus(queueId, ProcessingStatus.PROCESSING, {
        processingStartedAt: new Date(),
      });

      // Get conversation and agent
      const [conversation, agent] = await Promise.all([
        this.conversationRepository.findOne({
          where: { id: job.conversationId },
          relations: ["agent"],
        }),
        this.agentRepository.findOne({
          where: { id: job.agentId },
        }),
      ]);

      if (!conversation || !agent) {
        throw new Error("Conversation or agent not found");
      }

      // Get conversation history for context
      const recentMessages = await this.getConversationHistory(
        job.conversationId,
        10, // Last 10 messages
      );

      // Get conversation context
      const context = await this.conversationStateService.getContext(
        job.conversationId,
      );

      // Process the message based on type
      let response: ProcessingResult["response"];
      let tokensUsed = 0;

      if (job.mediaUrls && job.mediaUrls.length > 0) {
        // Process multimedia message
        response = await this.processMultimediaMessage(
          job,
          conversation,
          agent,
          context,
          recentMessages,
        );
      } else {
        // Process text message
        response = await this.processTextMessage(
          job,
          conversation,
          agent,
          context,
          recentMessages,
        );
      }

      const processingTime = Date.now() - startTime;

      // Save response as agent message
      if (response) {
        await this.saveResponseMessage(job, response);
      }

      // Update conversation context
      await this.conversationStateService.updateContext(job.conversationId, {
        currentIntent: this.extractIntent(job.content),
        sessionData: {
          conversationHistory: {
            topics: [],
            keywords: [],
            sentiment: "neutral" as const,
            lastIntent: this.extractIntent(job.content),
          },
        },
      });

      // Transition to waiting input state
      await this.conversationStateService.transitionState(
        job.conversationId,
        ConversationState.WAITING_INPUT,
        "Response generated",
        {
          messageId: job.messageId,
          processingTimeMs: processingTime,
          tokensUsed,
        },
      );

      // Record usage metrics
      await this.recordUsageMetrics(job.organizationId, {
        processingTimeMs: processingTime,
        tokensUsed,
        messagesProcessed: 1,
      });

      // Update queue status to completed
      await this.updateQueueStatus(queueId, ProcessingStatus.COMPLETED, {
        processingCompletedAt: new Date(),
        result: { success: true, processingTime, tokensUsed },
      });

      const result: ProcessingResult = {
        success: true,
        messageId: job.messageId,
        response,
        metrics: {
          processingTimeMs: processingTime,
          tokensUsed,
          contextLength: recentMessages.length,
        },
      };

      // Emit processing completed event
      this.eventEmitter.emit("message.processing.completed", {
        job,
        result,
        queueId,
      });

      this.logger.log(`Message processed successfully: ${job.messageId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Message processing failed: ${error.message}`,
        error.stack,
      );

      // Update queue status to failed
      await this.updateQueueStatus(queueId, ProcessingStatus.FAILED, {
        processingCompletedAt: new Date(),
        lastError: error.message,
      });

      // Transition conversation to appropriate state
      await this.conversationStateService.transitionState(
        job.conversationId,
        ConversationState.ESCALATED,
        "Processing failed",
        { error: error.message, messageId: job.messageId },
      );

      const result: ProcessingResult = {
        success: false,
        messageId: job.messageId,
        error: error.message,
      };

      // Emit processing failed event
      this.eventEmitter.emit("message.processing.failed", {
        job,
        result,
        error,
        queueId,
      });

      return result;
    }
  }

  /**
   * Process text message
   */
  private async processTextMessage(
    job: MessageProcessingJob,
    conversation: AgentConversation,
    agent: AiAgent,
    context: ConversationContext,
    recentMessages: AgentMessage[],
  ): Promise<ProcessingResult["response"]> {
    // Build context for AI response
    const systemPrompt = this.buildSystemPrompt(agent, context);
    const conversationHistory = this.formatConversationHistory(recentMessages);

    // Simulate AI response generation (replace with actual LLM call)
    const aiResponse = await this.generateAIResponse(
      systemPrompt,
      conversationHistory,
      job.content,
      agent,
    );

    return {
      content: aiResponse.content,
      metadata: {
        model: aiResponse.model,
        temperature: aiResponse.temperature,
        tokensUsed: aiResponse.tokensUsed,
        confidence: aiResponse.confidence,
      },
    };
  }

  /**
   * Process multimedia message
   */
  private async processMultimediaMessage(
    job: MessageProcessingJob,
    conversation: AgentConversation,
    agent: AiAgent,
    context: ConversationContext,
    recentMessages: AgentMessage[],
  ): Promise<ProcessingResult["response"]> {
    // For multimedia messages, we need to analyze the media content
    // and provide appropriate responses

    let mediaAnalysis = "";
    if (job.mediaUrls) {
      for (const mediaUrl of job.mediaUrls) {
        const analysis = await this.analyzeMedia(mediaUrl);
        mediaAnalysis += analysis + "\n";
      }
    }

    const systemPrompt = this.buildSystemPrompt(agent, context, {
      hasMedia: true,
      mediaAnalysis,
    });

    const conversationHistory = this.formatConversationHistory(recentMessages);

    const aiResponse = await this.generateAIResponse(
      systemPrompt,
      conversationHistory,
      `${job.content}\n[Media Analysis: ${mediaAnalysis}]`,
      agent,
    );

    return {
      content: aiResponse.content,
      metadata: {
        model: aiResponse.model,
        hasMediaAnalysis: true,
        mediaAnalysis,
        tokensUsed: aiResponse.tokensUsed,
      },
    };
  }

  /**
   * Save response message
   */
  private async saveResponseMessage(
    job: MessageProcessingJob,
    response: ProcessingResult["response"],
  ): Promise<AgentMessage> {
    const message = this.messageRepository.create({
      conversationId: job.conversationId,
      role: MessageRole.AGENT,
      content: response.content,
      status: MessageStatus.SENT,
      sequenceNumber: 1, // Will be updated by conversation service
      metadata: response.metadata || {},
    });

    return await this.messageRepository.save(message);
  }

  /**
   * Get conversation history
   */
  private async getConversationHistory(
    conversationId: string,
    limit: number = 10,
  ): Promise<AgentMessage[]> {
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(
    agent: AiAgent,
    context: ConversationContext,
    options?: { hasMedia?: boolean; mediaAnalysis?: string },
  ): string {
    let prompt = `You are ${agent.name}, ${agent.description}\n`;
    prompt += `Language: ${context.detectedLanguage}\n`;
    prompt += `Tone: ${agent.tone}\n`;
    prompt += `Current State: ${context.currentState}\n`;

    if (context.currentIntent) {
      prompt += `Current Intent: ${context.currentIntent}\n`;
    }

    if (options?.hasMedia) {
      prompt += `The user has sent media content. Analysis: ${options.mediaAnalysis}\n`;
    }

    prompt += `\nInstructions: ${agent.systemPrompt || "Be helpful and professional."}\n`;

    return prompt;
  }

  /**
   * Format conversation history
   */
  private formatConversationHistory(messages: AgentMessage[]): string {
    return messages
      .reverse()
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Generate AI response (mock implementation)
   */
  private async generateAIResponse(
    systemPrompt: string,
    conversationHistory: string,
    userMessage: string,
    agent: AiAgent,
  ): Promise<{
    content: string;
    model: string;
    temperature: number;
    tokensUsed: number;
    confidence: number;
  }> {
    // Mock implementation - replace with actual LLM API call
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate processing time

    return {
      content: `I understand your message: "${userMessage}". How can I help you further?`,
      model: "gpt-4",
      temperature: 0.7,
      tokensUsed: 50,
      confidence: 0.85,
    };
  }

  /**
   * Analyze media content (mock implementation)
   */
  private async analyzeMedia(mediaUrl: string): Promise<string> {
    // Mock implementation - replace with actual media analysis
    return `Media analysis for ${mediaUrl}: This appears to be a user-uploaded file.`;
  }

  /**
   * Extract intent from message (simplified)
   */
  private extractIntent(content: string): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes("help") || lowerContent.includes("support")) {
      return "support_request";
    }
    if (lowerContent.includes("price") || lowerContent.includes("cost")) {
      return "pricing_inquiry";
    }
    if (lowerContent.includes("product") || lowerContent.includes("service")) {
      return "product_inquiry";
    }

    return "general_inquiry";
  }

  /**
   * Get priority weight for BullMQ
   */
  private getPriorityWeight(priority: MessagePriority): number {
    const weights = {
      [MessagePriority.URGENT]: 10,
      [MessagePriority.HIGH]: 7,
      [MessagePriority.NORMAL]: 5,
      [MessagePriority.LOW]: 1,
    };
    return weights[priority];
  }

  /**
   * Get processing delay based on priority
   */
  private getProcessingDelay(priority: MessagePriority): number {
    const delays = {
      [MessagePriority.URGENT]: 0,
      [MessagePriority.HIGH]: 1000, // 1 second
      [MessagePriority.NORMAL]: 2000, // 2 seconds
      [MessagePriority.LOW]: 5000, // 5 seconds
    };
    return delays[priority];
  }

  /**
   * Update queue status
   */
  private async updateQueueStatus(
    queueId: string,
    status: ProcessingStatus,
    updates?: Partial<MessageQueue>,
  ): Promise<void> {
    await this.queueRepository.update(queueId, {
      status,
      ...updates,
    });
  }

  /**
   * Record usage metrics
   */
  private async recordUsageMetrics(
    organizationId: string,
    metrics: {
      processingTimeMs: number;
      tokensUsed: number;
      messagesProcessed: number;
    },
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Record API requests metric
    await this.usageMetricRepository.upsert(
      {
        organizationId,
        type: UsageMetricType.API_REQUESTS,
        date: today,
        value: metrics.messagesProcessed,
        metadata: {},
      },
      ["organizationId", "type", "date"],
    );

    // Record LLM tokens metric
    await this.usageMetricRepository.upsert(
      {
        organizationId,
        type: UsageMetricType.LLM_TOKENS,
        date: today,
        value: metrics.tokensUsed,
        metadata: {},
      },
      ["organizationId", "type", "date"],
    );
  }
}
