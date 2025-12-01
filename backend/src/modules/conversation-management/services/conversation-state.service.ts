import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ConversationContext,
  AgentConversation,
  AgentMessage,
} from "../../../common/entities";
import {
  ConversationState,
  ConversationStatus,
  MessageRole,
} from "../../../common/enums";

@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);

  constructor(
    @InjectRepository(ConversationContext)
    private contextRepository: Repository<ConversationContext>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Initialize conversation context
   */
  async initializeContext(
    conversationId: string,
    initialData?: Partial<ConversationContext["sessionData"]>,
  ): Promise<ConversationContext> {
    this.logger.log(`Initializing context for conversation: ${conversationId}`);

    let context = await this.contextRepository.findOne({
      where: { conversationId },
    });

    if (!context) {
      context = this.contextRepository.create({
        conversationId,
        currentState: ConversationState.GREETING,
        sessionData: {
          userProfile: {},
          conversationHistory: {
            topics: [],
            keywords: [],
            sentiment: "neutral",
          },
          customFields: {},
          ...initialData,
        },
        stateHistory: [
          {
            from: ConversationState.GREETING,
            to: ConversationState.GREETING,
            timestamp: new Date(),
            reason: "Initial state",
          },
        ],
        lastActivity: new Date(),
        timeoutAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      });

      context = await this.contextRepository.save(context);
    }

    return context;
  }

  /**
   * Transition conversation state
   */
  async transitionState(
    conversationId: string,
    newState: ConversationState,
    reason?: string,
    metadata?: Record<string, any>,
  ): Promise<ConversationContext> {
    const context = await this.getContext(conversationId);
    const previousState = context.currentState;

    if (previousState === newState) {
      this.logger.debug(`State transition skipped: already in ${newState}`);
      return context;
    }

    // Validate state transition
    if (!this.isValidTransition(previousState, newState)) {
      throw new Error(
        `Invalid state transition from ${previousState} to ${newState}`,
      );
    }

    // Update context
    context.previousState = previousState;
    context.currentState = newState;
    context.lastActivity = new Date();

    // Update timeout based on state
    context.timeoutAt = this.calculateTimeout(newState);

    // Add to state history
    context.stateHistory.push({
      from: previousState,
      to: newState,
      timestamp: new Date(),
      reason,
      metadata,
    });

    const updatedContext = await this.contextRepository.save(context);

    // Emit state change event
    this.eventEmitter.emit("conversation.state.changed", {
      conversationId,
      previousState,
      newState,
      context: updatedContext,
      reason,
      metadata,
    });

    this.logger.log(
      `State transition: ${conversationId} ${previousState} -> ${newState}`,
    );

    return updatedContext;
  }

  /**
   * Update conversation context data
   */
  async updateContext(
    conversationId: string,
    updates: {
      sessionData?: Partial<ConversationContext["sessionData"]>;
      currentIntent?: string;
      detectedLanguage?: string;
      sentimentScore?: number;
      unresolvedCount?: number;
    },
  ): Promise<ConversationContext> {
    const context = await this.getContext(conversationId);

    // Merge session data
    if (updates.sessionData) {
      context.sessionData = {
        ...context.sessionData,
        ...updates.sessionData,
        userProfile: {
          ...context.sessionData?.userProfile,
          ...updates.sessionData.userProfile,
        },
        conversationHistory: {
          ...context.sessionData?.conversationHistory,
          ...updates.sessionData.conversationHistory,
        },
        customFields: {
          ...context.sessionData?.customFields,
          ...updates.sessionData.customFields,
        },
      };
    }

    // Update other fields
    if (updates.currentIntent !== undefined) {
      context.currentIntent = updates.currentIntent;
    }
    if (updates.detectedLanguage) {
      context.detectedLanguage = updates.detectedLanguage;
    }
    if (updates.sentimentScore !== undefined) {
      context.sentimentScore = updates.sentimentScore;
    }
    if (updates.unresolvedCount !== undefined) {
      context.unresolvedCount = updates.unresolvedCount;
    }

    context.lastActivity = new Date();
    return this.contextRepository.save(context);
  }

  /**
   * Get conversation context
   */
  async getContext(conversationId: string): Promise<ConversationContext> {
    const context = await this.contextRepository.findOne({
      where: { conversationId },
    });

    if (!context) {
      return this.initializeContext(conversationId);
    }

    return context;
  }

  /**
   * Check if conversation has timed out
   */
  async checkTimeout(conversationId: string): Promise<boolean> {
    const context = await this.getContext(conversationId);

    if (!context.timeoutAt) return false;

    const hasTimedOut = new Date() > context.timeoutAt;

    if (hasTimedOut && context.currentState !== ConversationState.CLOSED) {
      await this.transitionState(
        conversationId,
        ConversationState.CLOSED,
        "Timeout",
      );
    }

    return hasTimedOut;
  }

  /**
   * Handle message received event
   */
  async handleMessageReceived(
    conversationId: string,
    message: AgentMessage,
  ): Promise<void> {
    const context = await this.getContext(conversationId);

    // Update context based on message
    const updates: any = {
      sessionData: {
        conversationHistory: {
          ...context.sessionData?.conversationHistory,
        },
      },
    };

    // Extract topics and keywords from message
    if (message.content) {
      const keywords = this.extractKeywords(message.content);
      const topics = this.extractTopics(message.content);

      updates.sessionData.conversationHistory.keywords = [
        ...(context.sessionData?.conversationHistory?.keywords || []),
        ...keywords,
      ].slice(-20); // Keep last 20 keywords

      updates.sessionData.conversationHistory.topics = [
        ...(context.sessionData?.conversationHistory?.topics || []),
        ...topics,
      ].slice(-10); // Keep last 10 topics
    }

    // Analyze sentiment
    updates.sentimentScore = this.analyzeSentiment(message.content || "");

    await this.updateContext(conversationId, updates);

    // Determine next state based on current state and message
    await this.determineNextState(conversationId, message);
  }

  /**
   * Validate state transitions
   */
  private isValidTransition(
    from: ConversationState,
    to: ConversationState,
  ): boolean {
    const validTransitions: Record<ConversationState, ConversationState[]> = {
      [ConversationState.GREETING]: [
        ConversationState.PROCESSING,
        ConversationState.WAITING_INPUT,
        ConversationState.CLOSED,
      ],
      [ConversationState.PROCESSING]: [
        ConversationState.WAITING_INPUT,
        ConversationState.RESOLVED,
        ConversationState.ESCALATED,
        ConversationState.CLOSED,
      ],
      [ConversationState.WAITING_INPUT]: [
        ConversationState.PROCESSING,
        ConversationState.RESOLVED,
        ConversationState.ESCALATED,
        ConversationState.CLOSED,
      ],
      [ConversationState.RESOLVED]: [
        ConversationState.PROCESSING,
        ConversationState.CLOSED,
      ],
      [ConversationState.ESCALATED]: [
        ConversationState.PROCESSING,
        ConversationState.RESOLVED,
        ConversationState.CLOSED,
      ],
      [ConversationState.CLOSED]: [], // Terminal state
    };

    return validTransitions[from]?.includes(to) || false;
  }

  /**
   * Calculate timeout based on state
   */
  private calculateTimeout(state: ConversationState): Date {
    const timeouts = {
      [ConversationState.GREETING]: 5 * 60 * 1000, // 5 minutes
      [ConversationState.PROCESSING]: 2 * 60 * 1000, // 2 minutes
      [ConversationState.WAITING_INPUT]: 30 * 60 * 1000, // 30 minutes
      [ConversationState.RESOLVED]: 10 * 60 * 1000, // 10 minutes
      [ConversationState.ESCALATED]: 60 * 60 * 1000, // 1 hour
      [ConversationState.CLOSED]: 0, // No timeout
    };

    const timeout = timeouts[state];
    return timeout
      ? new Date(Date.now() + timeout)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  /**
   * Determine next state based on message
   */
  private async determineNextState(
    conversationId: string,
    message: AgentMessage,
  ): Promise<void> {
    const context = await this.getContext(conversationId);
    const currentState = context.currentState;

    if (message.role === MessageRole.USER) {
      switch (currentState) {
        case ConversationState.GREETING:
          await this.transitionState(
            conversationId,
            ConversationState.PROCESSING,
            "User message received",
          );
          break;

        case ConversationState.WAITING_INPUT:
          await this.transitionState(
            conversationId,
            ConversationState.PROCESSING,
            "User input received",
          );
          break;
      }
    }
  }

  /**
   * Extract keywords from text (simplified implementation)
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production use NLP libraries
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3);

    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Extract topics from text (simplified implementation)
   */
  private extractTopics(text: string): string[] {
    // Simple topic extraction - in production use topic modeling
    const topics = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes("price") || lowerText.includes("cost")) {
      topics.push("pricing");
    }
    if (lowerText.includes("support") || lowerText.includes("help")) {
      topics.push("support");
    }
    if (lowerText.includes("product") || lowerText.includes("service")) {
      topics.push("product");
    }

    return topics;
  }

  /**
   * Analyze sentiment (simplified implementation)
   */
  private analyzeSentiment(text: string): number {
    // Simple sentiment analysis - in production use ML models
    const positiveWords = [
      "good",
      "great",
      "excellent",
      "happy",
      "love",
      "amazing",
    ];
    const negativeWords = [
      "bad",
      "terrible",
      "hate",
      "awful",
      "horrible",
      "worst",
    ];

    const lowerText = text.toLowerCase();
    let score = 0;

    positiveWords.forEach((word) => {
      if (lowerText.includes(word)) score += 0.1;
    });

    negativeWords.forEach((word) => {
      if (lowerText.includes(word)) score -= 0.1;
    });

    return Math.max(-1, Math.min(1, score));
  }
}
