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
      const quotaCheck = await this.quotaEnforcementService.checkFacebookCommentQuota(
        session.organizationId,
      );

      if (!quotaCheck.allowed) {
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
        conversation: { id: conversation.id },
        role: MessageRole.USER,
        content: commentEvent.message,
        status: MessageStatus.DELIVERED,
        sequenceNumber: 0,
        metadata: {
          fromWhatsApp: false,
        },
        externalMessageId: commentEvent.id,
      });

      await this.messageRepository.save(userMessage);

      // Get conversation history
      const conversationHistory = await this.messageRepository.find({
        where: { conversation: { id: conversation.id } },
        order: { createdAt: "ASC" },
        take: 10,
      });

      // Get or create conversation context
      const context = await this.conversationRepository
        .createQueryBuilder("conv")
        .leftJoinAndSelect("conv.context", "context")
        .where("conv.id = :id", { id: conversation.id })
        .getOne();

      // Generate AI response using ResponseGenerationService
      const aiResponse = await this.responseGenerationService.generateResponse({
        conversationId: conversation.id,
        agentId: session.agent.id,
        userMessage: commentEvent.message,
        context: context?.context as any || {} as any,
        conversationHistory,
        priority: "normal",
      });

      // Save AI message
      const aiMessage = this.messageRepository.create({
        conversation: { id: conversation.id },
        role: MessageRole.AGENT,
        content: aiResponse.content,
        status: MessageStatus.SENT,
        sequenceNumber: 1,
        metadata: {
          modelUsed: aiResponse.metadata?.model,
          tokenCount: aiResponse.metadata?.tokensUsed,
          processingTime: aiResponse.metadata?.processingTimeMs,
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
        aiMessage.externalMessageId = replyResult.id;
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
          error: { message: error.message, code: "FACEBOOK_REPLY_FAILED", timestamp: new Date() },
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
        agent: { id: session.agentId },
        channel: ConversationChannel.FACEBOOK,
        externalId: facebookUserId,
        status: ConversationStatus.ACTIVE,
      },
      order: { createdAt: "DESC" },
    });

    if (!conversation) {
      // Create new conversation
      conversation = this.conversationRepository.create({
        agent: { id: session.agentId },
        channel: ConversationChannel.FACEBOOK,
        externalId: facebookUserId,
        status: ConversationStatus.ACTIVE,
        sessionId: session.id,
        context: {
          sessionId: session.id,
          customData: {
            pageId: session.pageId,
            postId,
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
        organization: { id: session.organizationId },
        type: UsageMetricType.API_REQUESTS,
        value: 1,
        date: new Date().toISOString().split("T")[0],
        metadata: {
          sessionId: session.id,
          pageId: session.pageId,
          channel: "facebook",
          tokensUsed,
        },
      });

      await this.usageMetricRepository.save(metric);
    } catch (error) {
      this.logger.error(`Failed to track usage: ${error.message}`);
    }
  }
}
