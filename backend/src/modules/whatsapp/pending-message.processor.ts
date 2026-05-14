import { Process, Processor, OnQueueCompleted, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { BaileysService } from './baileys.service';
import { PendingMessage } from './pending-message-queue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Max times a job can be deferred due to session disconnection.
 * At 2-minute intervals, 30 deferrals = ~1 hour of waiting.
 * After that, the message is permanently failed.
 */
const MAX_DEFERRALS = 30;

/**
 * Absolute maximum age for a pending message (24 hours).
 * After this, the message is permanently failed regardless of deferral count.
 */
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Timeout for sendMessage calls (30 seconds).
 * Prevents jobs from hanging indefinitely if Baileys stalls.
 */
const SEND_TIMEOUT_MS = 30_000;

/**
 * Error patterns for classification.
 * Using case-insensitive regex for robustness against library changes.
 */
const DISCONNECTION_PATTERNS = [
  /connection\s*closed/i,
  /not\s*connected/i,
  /still\s*disconnected/i,
  /disconnected/i,
  /socket\s*closed/i,
  /websocket\s*(is\s*)?not\s*open/i,
  /timed?\s*out/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
];

const PERMANENT_FAILURE_PATTERNS = [
  /invalid/i,
  /blocked/i,
  /not\s*on\s*whatsapp/i,
  /number\s*does\s*not\s*exist/i,
  /jid\s*.*invalid/i,
];

function isDisconnectionError(message: string): boolean {
  return DISCONNECTION_PATTERNS.some(p => p.test(message));
}

function isPermanentError(message: string): boolean {
  return PERMANENT_FAILURE_PATTERNS.some(p => p.test(message));
}

@Processor('pending-messages')
export class PendingMessageProcessor {
  private readonly logger = new Logger(PendingMessageProcessor.name);
  private readonly redis: Redis;
  private readonly DEDUP_TTL_SECONDS = 300; // 5 minutes deduplication window (survives process restart)

  constructor(
    private baileysService: BaileysService,
    private eventEmitter: EventEmitter2,
    @InjectQueue('pending-messages')
    private pendingMessageQueue: Queue<PendingMessage>,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  /**
   * Check if this message was recently sent (Redis-based, survives process restarts)
   */
  private async isDuplicateMessage(to: string, message: string, type: string): Promise<boolean> {
    const hash = this.hashMessage(to, message, type);
    const exists = await this.redis.exists(`dedup:pending:${hash}`);
    return exists === 1;
  }

  /**
   * Mark a message as sent for deduplication using Redis with TTL
   */
  private async markMessageSent(to: string, message: string, type: string): Promise<void> {
    const hash = this.hashMessage(to, message, type);
    await this.redis.set(`dedup:pending:${hash}`, '1', 'EX', this.DEDUP_TTL_SECONDS);
  }

  /**
   * Hash full message content for deduplication (not truncated)
   */
  private hashMessage(to: string, message: string, type: string): string {
    const content = `${to}:${message || ''}:${type}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Defer a job instead of throwing (which wastes retry attempts).
   * Re-queues the message with a 2-minute delay so the session has time to reconnect.
   * After MAX_DEFERRALS (~1 hour) or MAX_MESSAGE_AGE (24h), the message is permanently failed.
   */
  private async deferJob(job: Job<PendingMessage>, reason: string): Promise<{ success: false; deferred: true; reason: string }> {
    const deferrals = (job.data.metadata?.deferrals || 0) + 1;

    // Check absolute age limit
    const messageAge = Date.now() - new Date(job.data.createdAt).getTime();
    if (messageAge > MAX_MESSAGE_AGE_MS) {
      this.logger.error(
        `Message ${job.data.id} exceeded max age (${Math.round(messageAge / 3600000)}h) - permanently failed`,
      );
      this.eventEmitter.emit('pending-message.failed', {
        pendingMessageId: job.data.id,
        sessionId: job.data.sessionId,
        to: job.data.to,
        source: job.data.source,
        error: `Exceeded max message age (24h): ${reason}`,
        permanent: true,
      });
      return { success: false, deferred: true, reason: 'max_age_exceeded' };
    }

    if (deferrals > MAX_DEFERRALS) {
      this.logger.error(
        `Message ${job.data.id} exceeded max deferrals (${MAX_DEFERRALS}) - permanently failed`,
      );
      this.eventEmitter.emit('pending-message.failed', {
        pendingMessageId: job.data.id,
        sessionId: job.data.sessionId,
        to: job.data.to,
        source: job.data.source,
        error: `Exceeded max deferrals (${MAX_DEFERRALS}): ${reason}`,
        permanent: true,
      });
      return { success: false, deferred: true, reason: 'max_deferrals_exceeded' };
    }

    // Re-queue with a new job ID and 2-minute delay
    const deferredJobId = `deferred-${job.data.id}-${deferrals}`;
    await this.pendingMessageQueue.add('send-pending', {
      ...job.data,
      metadata: {
        ...job.data.metadata,
        deferrals,
        lastDeferredAt: new Date().toISOString(),
        deferReason: reason,
      },
    }, {
      jobId: deferredJobId,
      delay: 120000, // 2 minutes
      attempts: 3, // Real retries for actual send errors
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.warn(
      `Deferred message ${job.data.id} (deferral ${deferrals}/${MAX_DEFERRALS}, ` +
      `age: ${Math.round(messageAge / 60000)}min, reason: ${reason}, next attempt in 2min)`,
    );

    return { success: false, deferred: true, reason: 'session_disconnected' };
  }

  /**
   * Send message with a timeout to prevent hanging jobs
   */
  private async sendWithTimeout(
    sessionId: string,
    params: { to: string; message: string; type: string; mediaUrl?: string; caption?: string },
  ): Promise<any> {
    return Promise.race([
      this.baileysService.sendMessage(sessionId, params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`sendMessage timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS),
      ),
    ]);
  }

  @Process('send-pending')
  async handleSendPending(job: Job<PendingMessage>) {
    const { sessionId, to, message, type, mediaUrl, caption, source, id } = job.data;

    this.logger.log(
      `Processing pending message ${id} (source: ${source}, to: ${to}, attempt: ${job.attemptsMade + 1})`,
    );

    try {
      // Check for duplicate message (Redis-based, survives process restarts)
      if (await this.isDuplicateMessage(to, message, type)) {
        this.logger.warn(
          `Duplicate message detected for ${to} - skipping to prevent spam (id: ${id})`,
        );
        return {
          success: true,
          skipped: true,
          reason: 'duplicate_detected',
          pendingMessageId: id,
        };
      }

      // Check if session is connected
      const sessionStatus = this.baileysService.getSessionStatus(sessionId);

      if (sessionStatus !== 'connected') {
        this.logger.warn(
          `Session ${sessionId} is not connected (status: ${sessionStatus}). ` +
          `Deferring message ${id}...`,
        );
        // Defer instead of throwing to preserve retry budget
        return this.deferJob(job, `Session ${sessionId} not connected (status: ${sessionStatus})`);
      }

      // Send the message with timeout protection
      const result = await this.sendWithTimeout(sessionId, {
        to,
        message,
        type: type,
        mediaUrl,
        caption,
      });

      this.logger.log(
        `Successfully sent pending message ${id} to ${to} (messageId: ${result.messageId})`,
      );

      // Mark as sent for deduplication (Redis)
      await this.markMessageSent(to, message, type);

      // Emit success event
      this.eventEmitter.emit('pending-message.sent', {
        pendingMessageId: id,
        sessionId,
        to,
        source,
        result,
        attempts: job.attemptsMade + 1,
      });

      return {
        success: true,
        messageId: result.messageId,
        pendingMessageId: id,
      };
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';

      this.logger.error(
        `Failed to send pending message ${id} (attempt ${job.attemptsMade + 1}): ${errorMessage}`,
      );

      // Check if error is due to disconnection - defer instead of throwing
      if (isDisconnectionError(errorMessage)) {
        return this.deferJob(job, errorMessage);
      }

      // For permanent errors (invalid number, blocked, etc.), mark as permanent failure
      if (isPermanentError(errorMessage)) {
        this.logger.warn(`Permanent failure for message ${id}: ${errorMessage}`);

        this.eventEmitter.emit('pending-message.failed', {
          pendingMessageId: id,
          sessionId,
          to,
          source,
          error: errorMessage,
          permanent: true,
        });

        return {
          success: false,
          error: errorMessage,
          permanent: true,
        };
      }

      // Re-throw for retry
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<PendingMessage>, result: any) {
    if (result?.deferred) {
      this.logger.debug(
        `Job ${job.id} deferred: message ${job.data.id} re-queued for later`,
      );
    } else if (result?.success) {
      this.logger.debug(
        `Job ${job.id} completed: sent message ${job.data.id} to ${job.data.to}`,
      );
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<PendingMessage>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    // Emit failure event after max retries
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      this.eventEmitter.emit('pending-message.failed', {
        pendingMessageId: job.data.id,
        sessionId: job.data.sessionId,
        to: job.data.to,
        source: job.data.source,
        error: error.message,
        permanent: false,
        maxRetriesReached: true,
      });
    }
  }
}
