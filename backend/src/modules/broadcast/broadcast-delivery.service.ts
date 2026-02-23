import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BroadcastMessage,
  BroadcastCampaign,
  BroadcastMessageStatus,
} from '../../common/entities';

@Injectable()
export class BroadcastDeliveryService {
  private readonly logger = new Logger(BroadcastDeliveryService.name);

  constructor(
    @InjectRepository(BroadcastMessage)
    private messageRepository: Repository<BroadcastMessage>,
    @InjectRepository(BroadcastCampaign)
    private campaignRepository: Repository<BroadcastCampaign>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Listen for WhatsApp message status updates (delivery receipts, read receipts)
   * Baileys emits messages.update with status: DELIVERY_ACK (3) = delivered, READ (4) = read
   */
  @OnEvent('whatsapp.message.update')
  async handleMessageUpdate(payload: {
    sessionId: string;
    update: {
      key: { remoteJid?: string; id?: string; fromMe?: boolean };
      update: { status?: number; [key: string]: any };
    };
  }): Promise<void> {
    const { update } = payload;
    const messageId = update?.key?.id;
    const status = update?.update?.status;

    if (!messageId || !status) return;

    // Baileys status codes: 2=SENT, 3=DELIVERY_ACK (delivered), 4=READ, 5=PLAYED
    if (status < 3) return; // Only interested in delivery and read receipts

    try {
      // Find matching broadcast message by whatsappMessageId
      const broadcastMessage = await this.messageRepository.findOne({
        where: { whatsappMessageId: messageId },
        relations: ['campaign'],
      });

      if (!broadcastMessage) return; // Not a broadcast message

      const newStatus =
        status >= 4
          ? BroadcastMessageStatus.READ
          : BroadcastMessageStatus.DELIVERED;

      // Only update if it's a progression (SENT -> DELIVERED -> READ)
      const statusOrder = {
        [BroadcastMessageStatus.SENT]: 1,
        [BroadcastMessageStatus.DELIVERED]: 2,
        [BroadcastMessageStatus.READ]: 3,
      };

      const currentOrder = statusOrder[broadcastMessage.status] || 0;
      const newOrder = statusOrder[newStatus] || 0;

      if (newOrder <= currentOrder) return; // Already at or past this status

      // Update message status
      broadcastMessage.status = newStatus;
      if (newStatus === BroadcastMessageStatus.DELIVERED) {
        broadcastMessage.deliveredAt = new Date();
      } else if (newStatus === BroadcastMessageStatus.READ) {
        if (!broadcastMessage.deliveredAt) {
          broadcastMessage.deliveredAt = new Date();
        }
        broadcastMessage.readAt = new Date();
      }
      await this.messageRepository.save(broadcastMessage);

      // Update campaign stats
      if (broadcastMessage.campaign) {
        await this.updateCampaignStats(broadcastMessage.campaign.id);
      }

      // Emit Socket.io event for real-time UI updates
      const eventName =
        newStatus === BroadcastMessageStatus.READ
          ? 'broadcast.message.read'
          : 'broadcast.message.delivered';

      this.eventEmitter.emit(eventName, {
        organizationId: broadcastMessage.campaign?.organizationId,
        campaignId: broadcastMessage.campaignId,
        messageId: broadcastMessage.id,
        status: newStatus,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update delivery status for message ${messageId}:`,
        error,
      );
    }
  }

  private async updateCampaignStats(campaignId: string): Promise<void> {
    const stats = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('message.campaignId = :campaignId', { campaignId })
      .groupBy('message.status')
      .getRawMany();

    const result = {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };

    for (const stat of stats) {
      result.total += parseInt(stat.count);
      switch (stat.status) {
        case BroadcastMessageStatus.PENDING:
        case BroadcastMessageStatus.QUEUED:
        case BroadcastMessageStatus.SENDING:
        case BroadcastMessageStatus.PAUSED:
          result.pending += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.SENT:
          result.sent += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.DELIVERED:
          result.delivered += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.READ:
          result.read += parseInt(stat.count);
          break;
        case BroadcastMessageStatus.FAILED:
        case BroadcastMessageStatus.CANCELLED:
          result.failed += parseInt(stat.count);
          break;
      }
    }

    await this.campaignRepository.update(campaignId, { stats: result });
  }
}
