import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface PendingMessage {
  id: string;
  sessionId: string;
  organizationId?: string;
  to: string;
  message: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  caption?: string;
  source: 'external-api' | 'ai-responder' | 'broadcast' | 'manual' | 'catch-up';
  originalError?: string;
  createdAt: Date;
  reconnectedAt?: Date;
  attempts: number;
  metadata?: Record<string, any>;
}

/**
 * Redis lock TTL for session catch-up processing.
 * Prevents multiple instances/workers from processing the same session.
 */
const LOCK_TTL_SECONDS = 120;
const LOCK_PREFIX = 'lock:pending-catchup:';

@Injectable()
export class PendingMessageQueueService {
  private readonly logger = new Logger(PendingMessageQueueService.name);
  private readonly redis: Redis;

  constructor(
    @InjectQueue('pending-messages')
    private pendingMessageQueue: Queue<PendingMessage>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
    });
  }

  /**
   * Acquire a distributed lock for session catch-up processing.
   * Returns true if lock was acquired, false if another instance holds it.
   */
  private async acquireLock(sessionId: string): Promise<boolean> {
    const key = `${LOCK_PREFIX}${sessionId}`;
    // SET NX EX is atomic — only one caller can acquire
    const result = await this.redis.set(key, Date.now().toString(), 'EX', LOCK_TTL_SECONDS, 'NX');
    return result === 'OK';
  }

  /**
   * Release the distributed lock for a session.
   */
  private async releaseLock(sessionId: string): Promise<void> {
    const key = `${LOCK_PREFIX}${sessionId}`;
    await this.redis.del(key);
  }

  /**
   * Queue a message for retry when session reconnects
   */
  async queueMessage(data: {
    sessionId: string;
    organizationId?: string;
    to: string;
    message: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'document';
    mediaUrl?: string;
    caption?: string;
    source: PendingMessage['source'];
    originalError?: string;
    metadata?: Record<string, any>;
  }): Promise<{ queued: true; messageId: string; position: number }> {
    const messageId = `pending-${data.source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const pendingMessage: PendingMessage = {
      id: messageId,
      sessionId: data.sessionId,
      organizationId: data.organizationId,
      to: data.to,
      message: data.message,
      type: data.type || 'text',
      mediaUrl: data.mediaUrl,
      caption: data.caption,
      source: data.source,
      originalError: data.originalError,
      createdAt: new Date(),
      attempts: 0,
      metadata: data.metadata,
    };

    await this.pendingMessageQueue.add('send-pending', pendingMessage, {
      // Messages stay in queue until session reconnects
      delay: 0,
      attempts: 15, // Max retry attempts over time
      backoff: {
        type: 'exponential',
        delay: 10000, // 10 seconds base delay between retries
      },
      removeOnComplete: 200,
      removeOnFail: 1000,
      jobId: messageId,
    });

    // Get queue position for this session
    const sessionJobs = await this.getPendingMessages(data.sessionId);
    const position = sessionJobs.length;

    this.logger.log(
      `Queued ${data.source} message ${messageId} for session ${data.sessionId} ` +
      `(to: ${data.to}). Queue position: ${position}`,
    );

    return {
      queued: true,
      messageId,
      position,
    };
  }

  /**
   * Get all pending messages for a session
   */
  async getPendingMessages(sessionId: string): Promise<Job<PendingMessage>[]> {
    const jobs = await this.pendingMessageQueue.getJobs(['waiting', 'delayed', 'paused']);
    return jobs.filter((job) => job.data.sessionId === sessionId);
  }

  /**
   * Get all pending messages by source
   */
  async getPendingMessagesBySource(source: PendingMessage['source']): Promise<Job<PendingMessage>[]> {
    const jobs = await this.pendingMessageQueue.getJobs(['waiting', 'delayed', 'paused']);
    return jobs.filter((job) => job.data.source === source);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
    bySession: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      this.pendingMessageQueue.getWaitingCount(),
      this.pendingMessageQueue.getActiveCount(),
      this.pendingMessageQueue.getDelayedCount(),
      this.pendingMessageQueue.getFailedCount(),
      this.pendingMessageQueue.getCompletedCount(),
    ]);

    // Get breakdown by session and source
    const allJobs = await this.pendingMessageQueue.getJobs(['waiting', 'delayed']);
    const bySession: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const job of allJobs) {
      bySession[job.data.sessionId] = (bySession[job.data.sessionId] || 0) + 1;
      bySource[job.data.source] = (bySource[job.data.source] || 0) + 1;
    }

    return { waiting, active, delayed, failed, completed, bySession, bySource };
  }

  /**
   * Handle session reconnect - process queued messages.
   * Uses Redis distributed lock to prevent duplicate processing across instances.
   */
  @OnEvent('whatsapp.session.ready')
  async handleSessionReady(payload: { sessionId: string; phoneNumber?: string }) {
    const { sessionId } = payload;

    // Acquire distributed lock (replaces in-memory Set)
    const lockAcquired = await this.acquireLock(sessionId);
    if (!lockAcquired) {
      this.logger.debug(`Session ${sessionId} catch-up already locked by another instance, skipping`);
      return;
    }

    try {
      this.logger.log(`Session ${sessionId} reconnected - checking pending messages queue`);

      // Recover failed jobs for this session first
      await this.recoverFailedJobs(sessionId);

      // Get all pending messages for this session
      const pendingJobs = await this.getPendingMessages(sessionId);

      if (pendingJobs.length === 0) {
        this.logger.debug(`No pending messages for session ${sessionId}`);
        return;
      }

      this.logger.log(`Found ${pendingJobs.length} pending messages for session ${sessionId}`);

      // Sort by creation date (oldest first)
      pendingJobs.sort((a, b) =>
        new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
      );

      // A freshly (re)connected device that immediately blasts its whole
      // backlog looks like a spam bot to WhatsApp — the server answers with a
      // 503 stream error then a 403 that unlinks the device, and on the next
      // reconnect the same burst re-triggers the block (self-reinforcing loop).
      // So let the connection settle before the first send, and space the
      // backlog out generously with jitter instead of a tight 3s cadence.
      const graceMs = Number(
        this.configService.get('PENDING_RECONNECT_GRACE_MS', 45000),
      );
      const staggerMs = Number(
        this.configService.get('PENDING_RECONNECT_STAGGER_MS', 8000),
      );

      // Promote all jobs with a settling grace + staggered, jittered delays
      let scheduledCount = 0;
      for (let i = 0; i < pendingJobs.length; i++) {
        const job = pendingJobs[i];
        try {
          // Check job state - skip if already being processed or completed
          const jobState = await job.getState();
          if (jobState === 'active' || jobState === 'completed') {
            this.logger.debug(
              `Skipping job ${job.id} - already ${jobState} (to: ${job.data.to})`,
            );
            continue;
          }

          // Use job ID to ensure we don't create duplicates
          const newJobId = `reconnect-${job.data.id}`;

          // Check if reconnect job already exists
          const existingReconnectJob = await this.pendingMessageQueue.getJob(newJobId);
          if (existingReconnectJob) {
            this.logger.debug(
              `Reconnect job ${newJobId} already exists - skipping duplicate`,
            );
            // Remove the original job safely
            await job.remove().catch(() => {});
            continue;
          }

          // Remove original job first, catch error if already claimed
          try {
            await job.remove();
          } catch {
            // Job was already claimed/removed by another processor - skip
            this.logger.debug(`Job ${job.id} already removed by another processor`);
            continue;
          }

          // Settling grace before the first send, then spaced sends with a
          // small random jitter so the cadence never looks mechanical.
          const jitter = Math.floor(Math.random() * 2000);
          const delay = graceMs + scheduledCount * staggerMs + jitter;

          // Add with new job ID to prevent duplicates
          await this.pendingMessageQueue.add('send-pending', {
            ...job.data,
            reconnectedAt: new Date(),
          }, {
            jobId: newJobId,
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false,
          });

          scheduledCount++;
          this.logger.debug(
            `Scheduled pending message ${job.data.id} for sending in ${delay}ms ` +
            `(source: ${job.data.source}, to: ${job.data.to})`,
          );
        } catch (error) {
          this.logger.error(`Failed to process job ${job.id}: ${error.message}`);
        }
      }

      this.logger.log(
        `Scheduled ${scheduledCount}/${pendingJobs.length} pending messages for session ${sessionId}`,
      );
    } finally {
      // Release lock after processing (with a short delay for safety)
      setTimeout(() => {
        this.releaseLock(sessionId).catch(() => {});
      }, 5000);
    }
  }

  /**
   * Handle reconnect success - also process queued messages
   */
  @OnEvent('whatsapp.reconnect.success')
  async handleReconnectSuccess(payload: { sessionId: string }) {
    await this.handleSessionReady(payload);
  }

  /**
   * Recover failed jobs for a session by re-queuing them.
   * This handles cases where messages exhausted retries during disconnection.
   */
  private async recoverFailedJobs(sessionId: string): Promise<number> {
    try {
      const failedJobs = await this.pendingMessageQueue.getJobs(['failed']);
      const sessionFailedJobs = failedJobs.filter(
        (job) => job.data.sessionId === sessionId,
      );

      if (sessionFailedJobs.length === 0) return 0;

      this.logger.log(
        `Found ${sessionFailedJobs.length} failed jobs for session ${sessionId} - recovering...`,
      );

      let recovered = 0;
      for (const job of sessionFailedJobs) {
        try {
          const recoveredJobId = `recovered-${job.data.id}-${Date.now()}`;

          // Remove the failed job safely
          try {
            await job.remove();
          } catch {
            // Already removed by another processor
            continue;
          }

          // Re-queue with fresh attempts and staggered delay
          await this.pendingMessageQueue.add('send-pending', {
            ...job.data,
            metadata: {
              ...job.data.metadata,
              recoveredAt: new Date().toISOString(),
              deferrals: 0, // Reset deferral count
            },
          }, {
            jobId: recoveredJobId,
            delay: recovered * 3000, // 3 seconds apart
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false,
          });

          recovered++;
        } catch (error) {
          this.logger.error(`Failed to recover job ${job.id}: ${error.message}`);
        }
      }

      if (recovered > 0) {
        this.logger.log(
          `Recovered ${recovered}/${sessionFailedJobs.length} failed jobs for session ${sessionId}`,
        );
      }

      return recovered;
    } catch (error) {
      this.logger.error(`Error recovering failed jobs for session ${sessionId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Clear all pending messages for a session
   */
  async clearPendingMessages(sessionId: string): Promise<number> {
    const pendingJobs = await this.getPendingMessages(sessionId);
    let cleared = 0;

    for (const job of pendingJobs) {
      try {
        await job.remove();
        cleared++;
      } catch (error) {
        this.logger.error(`Failed to remove job ${job.id}: ${error.message}`);
      }
    }

    this.logger.log(`Cleared ${cleared} pending messages for session ${sessionId}`);
    return cleared;
  }

  /**
   * Clear all pending messages by source
   */
  async clearPendingMessagesBySource(source: PendingMessage['source']): Promise<number> {
    const pendingJobs = await this.getPendingMessagesBySource(source);
    let cleared = 0;

    for (const job of pendingJobs) {
      try {
        await job.remove();
        cleared++;
      } catch (error) {
        this.logger.error(`Failed to remove job ${job.id}: ${error.message}`);
      }
    }

    this.logger.log(`Cleared ${cleared} pending ${source} messages`);
    return cleared;
  }
}
