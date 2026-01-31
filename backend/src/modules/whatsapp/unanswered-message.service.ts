import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import {
  WhatsAppSession,
  AgentConversation,
  AgentMessage,
} from "@/common/entities";
import { ConversationStatus, MessageRole } from "@/common/enums";

export interface CatchUpMessageJob {
  sessionId: string;
  conversationId: string;
  messageId: string;
  agentId: string;
  clientPhoneNumber: string;
  messageContent: string;
}

@Injectable()
export class UnansweredMessageService {
  private readonly logger = new Logger(UnansweredMessageService.name);

  // Track sessions currently being processed to prevent parallel catch-up
  private readonly processingSessionsMap = new Map<string, Date>();

  // Cooldown period after catch-up completion (1 minute)
  private readonly CATCHUP_COOLDOWN_MS = 60000;

  constructor(
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectQueue("message-catchup")
    private catchUpQueue: Queue<CatchUpMessageJob>,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.logger.log("UnansweredMessageService initialized");
  }

  /**
   * Handle session ready event (connection established/restored)
   */
  @OnEvent("whatsapp.session.ready")
  async handleSessionReady(event: { sessionId: string; status: string }) {
    this.logger.log(`Session ready event received for session ${event.sessionId}`);
    await this.processCatchUp(event.sessionId);
  }

  /**
   * Handle successful reconnection event
   */
  @OnEvent("whatsapp.reconnect.success")
  async handleReconnectSuccess(event: { sessionId: string; attempt: number }) {
    this.logger.log(`Reconnect success event received for session ${event.sessionId} (attempt ${event.attempt})`);
    await this.processCatchUp(event.sessionId);
  }

  /**
   * Main catch-up processing logic
   */
  private async processCatchUp(sessionId: string): Promise<void> {
    // Check if session is already being processed
    const lastProcessed = this.processingSessionsMap.get(sessionId);
    if (lastProcessed) {
      const timeSinceLastProcess = Date.now() - lastProcessed.getTime();
      if (timeSinceLastProcess < this.CATCHUP_COOLDOWN_MS) {
        this.logger.log(
          `Skipping catch-up for session ${sessionId} - cooldown active (${Math.round((this.CATCHUP_COOLDOWN_MS - timeSinceLastProcess) / 1000)}s remaining)`,
        );
        return;
      }
    }

    // Mark session as being processed
    this.processingSessionsMap.set(sessionId, new Date());

    try {
      this.logger.log(`Starting catch-up process for session ${sessionId}`);

      // Get session details to check if AI responses are enabled
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["agent"],
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found - skipping catch-up`);
        return;
      }

      // Check if AI responses are enabled
      if (session.aiResponsesEnabled === false) {
        this.logger.log(`AI responses disabled for session ${sessionId} - skipping catch-up`);
        return;
      }

      // Check if an agent is linked
      if (!session.agent && !session.agentId) {
        this.logger.log(`No agent linked to session ${sessionId} - skipping catch-up`);
        return;
      }

      // Get configuration - increased defaults for better catch-up coverage
      const timeWindowHours = this.configService.get<number>("CATCHUP_TIME_WINDOW_HOURS", 72);
      const delayMs = this.configService.get<number>("CATCHUP_DELAY_MS", 2000);
      const maxMessages = this.configService.get<number>("MAX_CATCHUP_MESSAGES", 200);

      // Calculate cutoff time
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - timeWindowHours);

      // Find unanswered messages
      const unansweredMessages = await this.findUnansweredMessages(
        sessionId,
        cutoffTime,
        maxMessages,
      );

      if (unansweredMessages.length === 0) {
        this.logger.log(`No unanswered messages found for session ${sessionId}`);
        return;
      }

      this.logger.log(`Found ${unansweredMessages.length} unanswered messages for session ${sessionId}`);

      // Queue messages with progressive delays
      for (let i = 0; i < unansweredMessages.length; i++) {
        const msg = unansweredMessages[i];
        const delay = i * delayMs;

        const jobId = `catchup-${sessionId}-${msg.id}`;

        // Check if job already exists to prevent duplicates
        const existingJob = await this.catchUpQueue.getJob(jobId);
        if (existingJob) {
          this.logger.debug(`Job ${jobId} already exists - skipping`);
          continue;
        }

        await this.catchUpQueue.add(
          "process-catchup-message",
          {
            sessionId: sessionId,
            conversationId: msg.conversationId,
            messageId: msg.id,
            agentId: msg.conversation?.agentId || session.agentId,
            clientPhoneNumber: msg.conversation?.clientPhoneNumber || "",
            messageContent: msg.content,
          },
          {
            jobId,
            delay,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: 50,
          },
        );

        this.logger.debug(`Queued catch-up message ${msg.id} with delay ${delay}ms`);
      }

      this.logger.log(`Queued ${unansweredMessages.length} catch-up messages for session ${sessionId}`);

    } catch (error) {
      this.logger.error(`Error during catch-up process for session ${sessionId}: ${error.message}`, error.stack);
    }
  }

  /**
   * Find messages that haven't been responded to
   * Uses raw SQL for reliability
   */
  private async findUnansweredMessages(
    sessionId: string,
    cutoffTime: Date,
    maxMessages: number,
  ): Promise<AgentMessage[]> {
    // Use raw SQL query for reliability - TypeORM query builder has issues with complex LEFT JOINs
    const rawResults = await this.messageRepository.query(
      `
      SELECT
        m.id as message_id,
        m.content as message_content,
        m."conversationId" as message_conversationId,
        m."createdAt" as message_createdAt,
        m."sequenceNumber" as message_sequenceNumber,
        m.metadata as message_metadata,
        c."agentId" as conversation_agentId,
        c."clientPhoneNumber" as conversation_clientPhoneNumber
      FROM agent_messages m
      INNER JOIN agent_conversations c ON c.id = m."conversationId"
      LEFT JOIN agent_messages later_agent_msg ON
        later_agent_msg."conversationId" = m."conversationId"
        AND later_agent_msg.role = 'agent'
        AND later_agent_msg."sequenceNumber" > m."sequenceNumber"
      WHERE (c."sessionId" = $1 OR c.context->>'sessionId' = $1)
        AND c.status = 'active'
        AND m.role = 'user'
        AND m."createdAt" >= $2
        AND (m.metadata->>'catchUpProcessed' IS NULL OR m.metadata->>'catchUpProcessed' = 'false')
        AND later_agent_msg.id IS NULL
      ORDER BY m."createdAt" ASC
      LIMIT $3
      `,
      [sessionId, cutoffTime.toISOString(), maxMessages],
    );

    this.logger.log(`Raw SQL found ${rawResults.length} unanswered messages for session ${sessionId}`);

    // Map raw results to message objects with conversation info
    const messages: AgentMessage[] = rawResults.map((raw: any) => {
      const message = new AgentMessage();
      message.id = raw.message_id;
      message.content = raw.message_content;
      message.conversationId = raw.message_conversationid;
      message.createdAt = raw.message_createdat;
      message.sequenceNumber = raw.message_sequencenumber;
      message.metadata = raw.message_metadata || {};

      // Attach conversation info
      message.conversation = {
        agentId: raw.conversation_agentid,
        clientPhoneNumber: raw.conversation_clientphonenumber,
      } as AgentConversation;

      return message;
    });

    this.logger.debug(`Mapped ${messages.length} unanswered messages for session ${sessionId}`);

    return messages;
  }

  /**
   * Mark a message as processed for catch-up
   */
  async markMessageAsProcessed(messageId: string): Promise<void> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (message) {
        message.metadata = {
          ...message.metadata,
          catchUpProcessed: true,
          catchUpProcessedAt: new Date().toISOString(),
        };
        await this.messageRepository.save(message);
        this.logger.debug(`Marked message ${messageId} as catch-up processed`);
      }
    } catch (error) {
      this.logger.error(`Failed to mark message ${messageId} as processed: ${error.message}`);
    }
  }

  /**
   * Clear the processing map for a session (called after catch-up completion)
   */
  clearProcessingSession(sessionId: string): void {
    // Don't delete - just update timestamp for cooldown
    this.processingSessionsMap.set(sessionId, new Date());
  }
}
