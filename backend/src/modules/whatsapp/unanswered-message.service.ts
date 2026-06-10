import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import Redis from "ioredis";
import {
  WhatsAppSession,
  AgentConversation,
  AgentMessage,
} from "@/common/entities";

export interface CatchUpMessageJob {
  sessionId: string;
  conversationId: string;
  messageId: string;
  agentId: string;
  clientPhoneNumber: string;
  messageContent: string;
  allMessages: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Redis lock TTL for catch-up processing (2 minutes).
 * Prevents multiple instances from running catch-up for the same session.
 */
const LOCK_TTL_SECONDS = 120;
const LOCK_PREFIX = "lock:catchup:";

@Injectable()
export class UnansweredMessageService {
  private readonly logger = new Logger(UnansweredMessageService.name);
  private readonly redis: Redis;

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
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });
    this.logger.log("UnansweredMessageService initialized");
  }

  /**
   * Acquire a distributed lock for session catch-up processing.
   */
  private async acquireLock(sessionId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${sessionId}`;
    const result = await this.redis.set(key, Date.now().toString(), "EX", LOCK_TTL_SECONDS, "NX");
    return result === "OK";
  }

  /**
   * Release the distributed lock for a session.
   */
  private async releaseLock(sessionId: string): Promise<void> {
    const key = `${LOCK_PREFIX}${sessionId}`;
    await this.redis.del(key);
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
   * Main catch-up processing logic.
   * Uses Redis distributed lock to prevent duplicate processing across instances.
   */
  private async processCatchUp(sessionId: string): Promise<void> {
    // Acquire distributed lock (replaces in-memory Map + cooldown)
    const lockAcquired = await this.acquireLock(sessionId);
    if (!lockAcquired) {
      this.logger.log(
        `Skipping catch-up for session ${sessionId} - locked by another instance or cooldown active`,
      );
      return;
    }

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

      // Get configuration
      const timeWindowHours = this.configService.get<number>("CATCHUP_TIME_WINDOW_HOURS", 24);
      const delayMs = this.configService.get<number>("CATCHUP_DELAY_MS", 3000);

      // Calculate cutoff time
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - timeWindowHours);

      // Find unanswered messages
      const unansweredMessages = await this.findUnansweredMessages(
        sessionId,
        cutoffTime,
        100, // Get up to 100 messages to analyze
      );

      if (unansweredMessages.length === 0) {
        this.logger.log(`No unanswered messages found for session ${sessionId}`);
        return;
      }

      this.logger.log(`Found ${unansweredMessages.length} unanswered messages for session ${sessionId}`);

      // GROUP all messages by conversation — we send the full context to the AI
      const messagesByConversation = new Map<string, AgentMessage[]>();
      for (const msg of unansweredMessages) {
        const convId = msg.conversationId;
        if (!messagesByConversation.has(convId)) {
          messagesByConversation.set(convId, []);
        }
        messagesByConversation.get(convId)!.push(msg);
      }

      // Queue one job per conversation with ALL messages as combined context
      let jobIndex = 0;
      for (const [convId, messages] of messagesByConversation) {
        // Sort by createdAt ASC so context reads chronologically
        messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const lastMessage = messages[messages.length - 1];
        const allMessages = messages.map(m => ({
          id: m.id,
          content: m.content,
          createdAt: new Date(m.createdAt).toISOString(),
        }));

        this.logger.log(`Conversation ${convId}: will process ${messages.length} messages (combined context)`);

        const delay = jobIndex * delayMs;
        const jobId = `catchup-${sessionId}-${convId}`;

        // Check if job already exists to prevent duplicates
        const existingJob = await this.catchUpQueue.getJob(jobId);
        if (existingJob) {
          this.logger.debug(`Job ${jobId} already exists - skipping`);
          jobIndex++;
          continue;
        }

        await this.catchUpQueue.add(
          "process-catchup-message",
          {
            sessionId: sessionId,
            conversationId: convId,
            messageId: lastMessage.id,
            agentId: lastMessage.conversation?.agentId || session.agentId,
            clientPhoneNumber: lastMessage.conversation?.clientPhoneNumber || "",
            messageContent: lastMessage.content,
            allMessages,
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

        this.logger.debug(`Queued catch-up for conversation ${convId} (${messages.length} messages) with delay ${delay}ms`);
        jobIndex++;
      }

      this.logger.log(`Queued ${messagesByConversation.size} catch-up jobs for session ${sessionId} (${unansweredMessages.length} total messages)`);

    } catch (error) {
      this.logger.error(`Error during catch-up process for session ${sessionId}: ${error.message}`, error.stack);
    } finally {
      await this.releaseLock(sessionId);
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
    // SAFETY: Only catch-up messages that are at least 5 minutes old
    // This prevents catching up messages that were just handled by the real-time AI responder
    // (which saves responses in its own conversation record)
    const minAgeTime = new Date();
    minAgeTime.setMinutes(minAgeTime.getMinutes() - 5);

    // Use the earlier of cutoffTime and minAgeTime as the upper bound
    const effectiveMaxTime = minAgeTime;

    // Use raw SQL query for reliability - TypeORM query builder has issues with complex LEFT JOINs
    // CRITICAL FIX: Also check if the same phone number has been answered in ANY conversation
    // (not just the same conversation), to prevent duplicate AI responses when messages are
    // saved in multiple conversation records by different services
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
      WHERE (c."sessionId" = $1 OR (c."sessionId" IS NULL AND c.context->>'sessionId' = $1))
        AND c.status = 'active'
        AND m.role = 'user'
        AND m."createdAt" >= $2
        AND m."createdAt" <= $4
        AND (m.metadata->>'catchUpProcessed' IS NULL OR m.metadata->>'catchUpProcessed' = 'false')
        AND later_agent_msg.id IS NULL
        AND c."isHumanControlled" IS NOT TRUE
        AND NOT EXISTS (
          SELECT 1 FROM agent_messages cross_msg
          INNER JOIN agent_conversations cross_conv ON cross_conv.id = cross_msg."conversationId"
          WHERE cross_conv."clientPhoneNumber" = c."clientPhoneNumber"
            AND cross_conv."userId" = c."userId"
            AND cross_msg.role = 'agent'
            AND cross_msg."createdAt" >= m."createdAt"
        )
      ORDER BY m."createdAt" ASC
      LIMIT $3
      `,
      [sessionId, cutoffTime.toISOString(), maxMessages, effectiveMaxTime.toISOString()],
    );

    this.logger.log(`Raw SQL found ${rawResults.length} unanswered messages for session ${sessionId} (window: ${cutoffTime.toISOString()} to ${effectiveMaxTime.toISOString()})`);

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
   * Clear the processing lock for a session (called externally if needed)
   */
  clearProcessingSession(sessionId: string): void {
    this.releaseLock(sessionId).catch(() => {});
  }
}
