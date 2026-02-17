import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BaileysService } from './baileys.service';
import { PendingMessage } from './pending-message-queue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Processor('pending-messages')
export class PendingMessageProcessor {
  private readonly logger = new Logger(PendingMessageProcessor.name);

  // Track recently sent messages to prevent duplicates (recipient:messageHash -> timestamp)
  private readonly recentlySentMessages = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 30000; // 30 seconds deduplication window

  constructor(
    private baileysService: BaileysService,
    private eventEmitter: EventEmitter2,
  ) {
    // Clean up old entries every minute
    setInterval(() => this.cleanupRecentlySent(), 60000);
  }

  /**
   * Generate a hash for deduplication based on recipient and message content
   */
  private generateMessageHash(to: string, message: string, type: string): string {
    // Simple hash: combine recipient + first 100 chars of message + type
    const content = `${to}:${(message || '').substring(0, 100)}:${type}`;
    return content;
  }

  /**
   * Check if this message was recently sent (duplicate detection)
   */
  private isDuplicateMessage(to: string, message: string, type: string): boolean {
    const hash = this.generateMessageHash(to, message, type);
    const lastSent = this.recentlySentMessages.get(hash);
    if (lastSent && Date.now() - lastSent < this.DEDUP_WINDOW_MS) {
      return true;
    }
    return false;
  }

  /**
   * Mark a message as sent for deduplication
   */
  private markMessageSent(to: string, message: string, type: string): void {
    const hash = this.generateMessageHash(to, message, type);
    this.recentlySentMessages.set(hash, Date.now());
  }

  /**
   * Clean up old entries from the deduplication map
   */
  private cleanupRecentlySent(): void {
    const now = Date.now();
    for (const [hash, timestamp] of this.recentlySentMessages) {
      if (now - timestamp > this.DEDUP_WINDOW_MS * 2) {
        this.recentlySentMessages.delete(hash);
      }
    }
  }

  @Process('send-pending')
  async handleSendPending(job: Job<PendingMessage>) {
    const { sessionId, to, message, type, mediaUrl, caption, source, id } = job.data;

    this.logger.log(
      `📤 Processing pending message ${id} (source: ${source}, to: ${to}, attempt: ${job.attemptsMade + 1})`,
    );

    try {
      // Check for duplicate message (same recipient + content within 30 seconds)
      if (this.isDuplicateMessage(to, message, type)) {
        this.logger.warn(
          `⚠️ Duplicate message detected for ${to} - skipping to prevent spam (id: ${id})`,
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
          `⚠️ Session ${sessionId} is not connected (status: ${sessionStatus}). ` +
          `Re-queuing message ${id}...`,
        );
        // Throw error to trigger retry with backoff
        throw new Error(`Session ${sessionId} still disconnected`);
      }

      // Send the message
      const result = await this.baileysService.sendMessage(sessionId, {
        to,
        message,
        type: type,
        mediaUrl,
        caption,
      });

      this.logger.log(
        `✅ Successfully sent pending message ${id} to ${to} (messageId: ${result.messageId})`,
      );

      // Mark as sent for deduplication
      this.markMessageSent(to, message, type);

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
        `❌ Failed to send pending message ${id} (attempt ${job.attemptsMade + 1}): ${errorMessage}`,
      );

      // Check if error is due to disconnection
      if (
        errorMessage.includes('Connection Closed') ||
        errorMessage.includes('not connected') ||
        errorMessage.includes('still disconnected')
      ) {
        // This will trigger Bull's retry mechanism
        throw new Error(`Session disconnected: ${errorMessage}`);
      }

      // For other errors (invalid number, blocked, etc.), mark as permanent failure
      if (
        errorMessage.includes('invalid') ||
        errorMessage.includes('blocked') ||
        errorMessage.includes('not on WhatsApp')
      ) {
        this.logger.warn(`⚠️ Permanent failure for message ${id}: ${errorMessage}`);

        // Emit failure event
        this.eventEmitter.emit('pending-message.failed', {
          pendingMessageId: id,
          sessionId,
          to,
          source,
          error: errorMessage,
          permanent: true,
        });

        // Return to avoid retry
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
    if (result?.success) {
      this.logger.debug(
        `✅ Job ${job.id} completed: sent message ${job.data.id} to ${job.data.to}`,
      );
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<PendingMessage>, error: Error) {
    this.logger.error(
      `❌ Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
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
