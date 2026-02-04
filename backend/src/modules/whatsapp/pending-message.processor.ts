import { Process, Processor, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BaileysService } from './baileys.service';
import { PendingMessage } from './pending-message-queue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Processor('pending-messages')
export class PendingMessageProcessor {
  private readonly logger = new Logger(PendingMessageProcessor.name);

  constructor(
    private baileysService: BaileysService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Process('send-pending')
  async handleSendPending(job: Job<PendingMessage>) {
    const { sessionId, to, message, type, mediaUrl, caption, source, id } = job.data;

    this.logger.log(
      `📤 Processing pending message ${id} (source: ${source}, to: ${to}, attempt: ${job.attemptsMade + 1})`,
    );

    try {
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
        type: type as any,
        mediaUrl,
        caption,
      });

      this.logger.log(
        `✅ Successfully sent pending message ${id} to ${to} (messageId: ${result.messageId})`,
      );

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
