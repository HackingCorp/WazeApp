import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import axios from 'axios';
import { WebhookConfig, WebhookEventType } from '../../common/entities';
import { CreateWebhookDto } from './dto/broadcast.dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookConfig)
    private webhookRepository: Repository<WebhookConfig>,
  ) {}

  /**
   * Create a new webhook
   */
  async createWebhook(
    organizationId: string,
    dto: CreateWebhookDto,
  ): Promise<WebhookConfig> {
    // Generate secret
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = this.webhookRepository.create({
      organizationId,
      name: dto.name,
      url: dto.url,
      secret,
      events: dto.events as WebhookEventType[],
      headers: dto.headers,
      isActive: true,
    });

    return this.webhookRepository.save(webhook);
  }

  /**
   * Get all webhooks for organization
   */
  async getWebhooks(organizationId: string): Promise<WebhookConfig[]> {
    return this.webhookRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(
    organizationId: string,
    webhookId: string,
  ): Promise<WebhookConfig> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, organizationId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return webhook;
  }

  /**
   * Update webhook
   */
  async updateWebhook(
    organizationId: string,
    webhookId: string,
    updates: Partial<CreateWebhookDto>,
  ): Promise<WebhookConfig> {
    const webhook = await this.getWebhook(organizationId, webhookId);
    Object.assign(webhook, updates);
    return this.webhookRepository.save(webhook);
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(organizationId: string, webhookId: string): Promise<void> {
    const webhook = await this.getWebhook(organizationId, webhookId);
    await this.webhookRepository.remove(webhook);
  }

  /**
   * Toggle webhook active status
   */
  async toggleWebhook(
    organizationId: string,
    webhookId: string,
    isActive: boolean,
  ): Promise<WebhookConfig> {
    const webhook = await this.getWebhook(organizationId, webhookId);
    webhook.isActive = isActive;
    webhook.autoDisabled = false;
    webhook.consecutiveFailures = 0;
    return this.webhookRepository.save(webhook);
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(
    organizationId: string,
    webhookId: string,
  ): Promise<{ secret: string }> {
    const webhook = await this.getWebhook(organizationId, webhookId);
    webhook.secret = crypto.randomBytes(32).toString('hex');
    await this.webhookRepository.save(webhook);
    return { secret: webhook.secret };
  }

  /**
   * Trigger webhooks for an event
   */
  async trigger(
    organizationId: string,
    event: string,
    payload: any,
  ): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: {
        organizationId,
        isActive: true,
        autoDisabled: false,
      },
    });

    const applicableWebhooks = webhooks.filter((w) =>
      w.events.includes(event as WebhookEventType),
    );

    for (const webhook of applicableWebhooks) {
      this.sendWebhook(webhook, event, payload).catch((err) => {
        this.logger.error(`Webhook ${webhook.name} failed:`, err);
      });
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(
    webhook: WebhookConfig,
    event: string,
    payload: any,
    retryCount = 0,
  ): Promise<void> {
    const timestamp = Date.now();
    const body = {
      event,
      timestamp,
      data: payload,
    };

    // Create signature
    const signature = this.createSignature(webhook.secret, JSON.stringify(body));

    try {
      await axios.post(webhook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': timestamp.toString(),
          ...webhook.headers,
        },
        timeout: 10000,
      });

      // Update success stats
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        totalTriggered: () => 'total_triggered + 1',
        totalSuccess: () => 'total_success + 1',
      });

      this.logger.debug(`Webhook ${webhook.name} triggered successfully`);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;

      // Update failure stats
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
        lastFailureAt: new Date(),
        lastError: errorMessage,
        consecutiveFailures: () => 'consecutive_failures + 1',
        totalTriggered: () => 'total_triggered + 1',
        totalFailures: () => 'total_failures + 1',
      });

      // Check if we should auto-disable
      const updated = await this.webhookRepository.findOne({
        where: { id: webhook.id },
      });

      if (updated.consecutiveFailures >= updated.autoDisableThreshold) {
        await this.webhookRepository.update(webhook.id, {
          autoDisabled: true,
        });
        this.logger.warn(
          `Webhook ${webhook.name} auto-disabled after ${updated.consecutiveFailures} failures`,
        );
      } else if (retryCount < webhook.maxRetries) {
        // Retry with exponential backoff
        const delay = webhook.retryDelay * Math.pow(2, retryCount);
        setTimeout(() => {
          this.sendWebhook(webhook, event, payload, retryCount + 1);
        }, delay);
      }

      throw error;
    }
  }

  /**
   * Create HMAC signature for webhook payload
   */
  private createSignature(secret: string, payload: string): string {
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(organizationId: string, webhookId: string): Promise<{
    success: boolean;
    statusCode?: number;
    error?: string;
    duration?: number;
  }> {
    const webhook = await this.getWebhook(organizationId, webhookId);

    const startTime = Date.now();
    const testPayload = {
      event: 'test',
      timestamp: startTime,
      data: {
        message: 'This is a test webhook from WazeApp',
      },
    };

    const signature = this.createSignature(
      webhook.secret,
      JSON.stringify(testPayload),
    );

    try {
      const response = await axios.post(webhook.url, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'test',
          'X-Webhook-Timestamp': startTime.toString(),
          ...webhook.headers,
        },
        timeout: 10000,
        validateStatus: () => true,
      });

      const duration = Date.now() - startTime;

      return {
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }
}
