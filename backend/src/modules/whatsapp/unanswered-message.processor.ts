import { Process, Processor, OnQueueCompleted, OnQueueFailed } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  WhatsAppSession,
  AgentConversation,
  AgentMessage,
} from "@/common/entities";
import { MessageRole } from "@/common/enums";
import { BaileysService } from "./baileys.service";
import { UnansweredMessageService, CatchUpMessageJob } from "./unanswered-message.service";

@Processor("message-catchup")
export class UnansweredMessageProcessor {
  private readonly logger = new Logger(UnansweredMessageProcessor.name);

  constructor(
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    private baileysService: BaileysService,
    private eventEmitter: EventEmitter2,
    private unansweredMessageService: UnansweredMessageService,
  ) {
    this.logger.log("UnansweredMessageProcessor initialized");
  }

  @Process("process-catchup-message")
  async handleCatchUpMessage(job: Job<CatchUpMessageJob>): Promise<void> {
    const {
      sessionId,
      conversationId,
      messageId,
      agentId,
      clientPhoneNumber,
      messageContent,
    } = job.data;

    this.logger.log(`Processing catch-up message: ${messageId} for session ${sessionId}`);

    try {
      // 1. Verify session is still connected
      const isActive = await this.baileysService.isSessionActive(sessionId);
      if (!isActive) {
        this.logger.warn(`Session ${sessionId} is no longer active - skipping message ${messageId}`);
        // Mark as processed to avoid reprocessing
        await this.unansweredMessageService.markMessageAsProcessed(messageId);
        return;
      }

      // 2. Re-verify the message hasn't been responded to in the meantime
      const hasResponse = await this.checkIfMessageHasResponse(conversationId, messageId);
      if (hasResponse) {
        this.logger.log(`Message ${messageId} already has a response - skipping`);
        await this.unansweredMessageService.markMessageAsProcessed(messageId);
        return;
      }

      // 3. Get the original message
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
        relations: ["conversation"],
      });

      if (!message) {
        this.logger.warn(`Message ${messageId} not found - skipping`);
        return;
      }

      // 4. Get session with agent details
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: [
          "user",
          "organization",
          "agent",
          "agent.knowledgeBases",
          "knowledgeBase",
        ],
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found - skipping`);
        return;
      }

      // 5. Check AI responses are still enabled
      if (session.aiResponsesEnabled === false) {
        this.logger.log(`AI responses disabled for session ${sessionId} - skipping`);
        await this.unansweredMessageService.markMessageAsProcessed(messageId);
        return;
      }

      // 6. Emit catch-up message event for AI responder to handle
      this.logger.log(`Emitting catch-up message event for message ${messageId}`);

      this.eventEmitter.emit("whatsapp.catchup.message", {
        sessionId,
        conversationId,
        messageId,
        agentId: agentId || session.agentId,
        clientPhoneNumber: clientPhoneNumber || message.conversation?.clientPhoneNumber,
        messageContent: messageContent || message.content,
        session,
        conversation: message.conversation,
        originalMessage: message,
        isCatchUp: true,
      });

      // 7. Mark message as processed
      await this.unansweredMessageService.markMessageAsProcessed(messageId);

      this.logger.log(`Catch-up completed for message ${messageId}`);

    } catch (error) {
      this.logger.error(`Error processing catch-up message ${messageId}: ${error.message}`, error.stack);
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Check if a message has already received an agent response
   */
  private async checkIfMessageHasResponse(
    conversationId: string,
    messageId: string,
  ): Promise<boolean> {
    // Get the original message's sequence number
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      return false;
    }

    // Check if there's any AGENT message after this one in the conversation
    const agentResponse = await this.messageRepository.findOne({
      where: {
        conversationId,
        role: MessageRole.AGENT,
        sequenceNumber: MoreThan(message.sequenceNumber),
      },
    });

    return !!agentResponse;
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<CatchUpMessageJob>): Promise<void> {
    this.logger.debug(`Catch-up job ${job.id} completed for message ${job.data.messageId}`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<CatchUpMessageJob>, error: Error): Promise<void> {
    this.logger.error(
      `Catch-up job ${job.id} failed for message ${job.data.messageId}: ${error.message}`,
    );

    // After max retries, mark as processed to prevent infinite retries
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.warn(`Max retries reached for message ${job.data.messageId} - marking as processed`);
      await this.unansweredMessageService.markMessageAsProcessed(job.data.messageId);
    }
  }
}
