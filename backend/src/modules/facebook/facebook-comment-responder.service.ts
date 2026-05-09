import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { ConfigService } from "@nestjs/config";
import {
  FacebookPageSession,
  FacebookContact,
  AiAgent,
  AgentConversation,
  AgentMessage,
  UsageMetric,
} from "@/common/entities";
import {
  ConversationStatus,
  ConversationChannel,
  MessageRole,
  MessageStatus,
  UsageMetricType,
} from "@/common/enums";
import { FacebookService } from "./facebook.service";
import { ResponseGenerationService } from "../conversation-management/services/response-generation.service";
import { QuotaEnforcementService } from "../subscriptions/quota-enforcement.service";
import { CommentEventDto } from "./dto/webhook-event.dto";

interface CommentProcessingJob {
  sessionId: string;
  commentEvent: CommentEventDto;
}

@Injectable()
export class FacebookCommentResponderService {
  private readonly logger = new Logger(FacebookCommentResponderService.name);
  private readonly processingComments = new Set<string>();

  constructor(
    @InjectRepository(FacebookPageSession)
    private sessionRepository: Repository<FacebookPageSession>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    private facebookService: FacebookService,
    private responseGenerationService: ResponseGenerationService,
    private quotaEnforcementService: QuotaEnforcementService,
    private configService: ConfigService,
    @InjectQueue("facebook-comments")
    private commentQueue: Queue,
  ) {}

  /**
   * Handle incoming comment event from webhook
   */
  async handleCommentEvent(
    session: FacebookPageSession,
    commentEvent: CommentEventDto,
  ): Promise<void> {
    const commentId = commentEvent.id;

    // Skip if already processing
    if (this.processingComments.has(commentId)) {
      this.logger.debug(`Comment ${commentId} is already being processed, skipping`);
      return;
    }

    // Check if session has AI responses enabled
    if (!session.aiResponsesEnabled || !session.commentAutoReplyEnabled) {
      this.logger.debug(
        `AI responses disabled for session ${session.id}, skipping comment`,
      );
      return;
    }

    // Check if comment is a reply (parent exists) and config excludes replies
    if (commentEvent.parent && session.config.excludeReplies) {
      this.logger.debug(`Skipping comment reply based on session config`);
      return;
    }

    // Check verb - only respond to new comments
    if (commentEvent.verb && commentEvent.verb !== "add") {
      this.logger.debug(`Skipping comment with verb: ${commentEvent.verb}`);
      return;
    }

    // Add to processing queue
    await this.commentQueue.add("process-comment", {
      sessionId: session.id,
      commentEvent,
    });
  }

  /**
   * Process comment from queue (called by Bull processor)
   */
  async processComment(job: CommentProcessingJob): Promise<void> {
    const { sessionId, commentEvent } = job;
    const commentId = commentEvent.id;

    this.processingComments.add(commentId);

    try {
      this.logger.log(
        `Processing Facebook comment ${commentId} from ${commentEvent.from.name}`,
      );

      // Get session with relations
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["agent", "organization"],
      });

      if (!session) {
        this.logger.error(`Session ${sessionId} not found`);
        return;
      }

      if (!session.agent) {
        this.logger.warn(`No AI agent configured for session ${session.id}`);
        return;
      }

      // Check quota
      const canProcess = await this.quotaEnforcementService.checkQuota(
        session.organizationId,
        "aiMessages",
      );

      if (!canProcess) {
        this.logger.warn(
          `Quota exceeded for organization ${session.organizationId}, skipping comment`,
        );
        return;
      }

      // Get or create contact
      const contact = await this.facebookService.getOrCreateContact(
        commentEvent.from.id,
        commentEvent.from.name,
        session.id,
        session.organizationId,
      );

      // Find or create conversation
      const conversation = await this.findOrCreateConversation(
        session,
        contact.facebookUserId,
        commentEvent.post_id,
      );

      // Save user message
      const userMessage = this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: commentEvent.message,
        status: MessageStatus.DELIVERED,
        metadata: {
          commentId: commentEvent.id,
          createdTime: commentEvent.created_time,
          postId: commentEvent.post_id,
          isReply: !!commentEvent.parent,
          parentCommentId: commentEvent.parent?.id,
        },
      });

      await this.messageRepository.save(userMessage);

      // Get conversation history
      const conversationHistory = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: "ASC" },
        take: 10,
      });

      // Generate AI response using ResponseGenerationService
      const aiResponse = await this.responseGenerationService.generateResponse({
        conversationId: conversation.id,
        agentId: session.agent.id,
        userMessage: commentEvent.message,
        context: conversation.context || {},
        conversationHistory,
        priority: "normal",
      });

      // Save AI message
      const aiMessage = this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: aiResponse.content,
        status: MessageStatus.PENDING,
        metadata: {
          model: aiResponse.metadata.model,
          tokensUsed: aiResponse.metadata.tokensUsed,
          processingTimeMs: aiResponse.metadata.processingTimeMs,
          confidence: aiResponse.confidence,
          ragUsed: aiResponse.metadata.ragUsed,
        },
      });

      await this.messageRepository.save(aiMessage);

      // Send reply to Facebook
      try {
        const replyResult = await this.facebookService.replyToComment(
          commentId,
          aiResponse.content,
          session,
        );

        // Update message status
        aiMessage.status = MessageStatus.DELIVERED;
        aiMessage.metadata = {
          ...aiMessage.metadata,
          commentId: replyResult.id,
          sentAt: new Date(),
        };
        await this.messageRepository.save(aiMessage);

        this.logger.log(`Successfully replied to comment ${commentId}`);
      } catch (error) {
        this.logger.error(
          `Failed to send reply to Facebook: ${error.message}`,
          error.stack,
        );
        aiMessage.status = MessageStatus.FAILED;
        aiMessage.metadata = {
          ...aiMessage.metadata,
          error: error.message,
        };
        await this.messageRepository.save(aiMessage);
      }

      // Update conversation metrics
      conversation.metrics = {
        ...conversation.metrics,
        messageCount: (conversation.metrics?.messageCount || 0) + 2,
        userMessageCount: (conversation.metrics?.userMessageCount || 0) + 1,
        agentMessageCount: (conversation.metrics?.agentMessageCount || 0) + 1,
        lastActivity: new Date(),
      };
      await this.conversationRepository.save(conversation);

      // Track usage
      await this.trackUsage(session, aiResponse.metadata.tokensUsed);

      // Increment quota
      await this.quotaEnforcementService.incrementUsage(
        session.organizationId,
        "aiMessages",
        1,
      );
    } catch (error) {
      this.logger.error(
        `Error processing comment ${commentId}: ${error.message}`,
        error.stack,
      );
    } finally {
      this.processingComments.delete(commentId);
    }
  }

  /**
   * Find or create conversation for a Facebook user
   */
  private async findOrCreateConversation(
    session: FacebookPageSession,
    facebookUserId: string,
    postId?: string,
  ): Promise<AgentConversation> {
    // Try to find existing active conversation
    let conversation = await this.conversationRepository.findOne({
      where: {
        agentId: session.agentId,
        channel: ConversationChannel.FACEBOOK,
        externalId: facebookUserId,
        status: ConversationStatus.ACTIVE,
      },
      order: { createdAt: "DESC" },
    });

    if (!conversation) {
      // Create new conversation
      conversation = this.conversationRepository.create({
        agentId: session.agentId,
        channel: ConversationChannel.FACEBOOK,
        externalId: facebookUserId,
        status: ConversationStatus.ACTIVE,
        sessionId: session.id,
        context: {
          sessionId: session.id,
          pageId: session.pageId,
          postId,
          userProfile: {
            facebookUserId,
          },
        },
        metrics: {
          messageCount: 0,
          userMessageCount: 0,
          agentMessageCount: 0,
        },
      });

      conversation = await this.conversationRepository.save(conversation);
      this.logger.log(
        `Created new Facebook conversation ${conversation.id} for user ${facebookUserId}`,
      );
    }

    return conversation;
  }

  /**
   * Track usage metrics
   */
  private async trackUsage(
    session: FacebookPageSession,
    tokensUsed: number,
  ): Promise<void> {
    try {
      const metric = this.usageMetricRepository.create({
        organizationId: session.organizationId,
        userId: session.userId,
        type: UsageMetricType.AI_MESSAGE,
        value: 1,
        metadata: {
          sessionId: session.id,
          pageId: session.pageId,
          channel: ConversationChannel.FACEBOOK,
          tokensUsed,
        },
      });

      await this.usageMetricRepository.save(metric);
    } catch (error) {
      this.logger.error(`Failed to track usage: ${error.message}`);
    }
  }
}
