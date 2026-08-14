import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { AgentMessage, WhatsAppSession } from "@/common/entities";
import { MessageStatus, WhatsAppSessionStatus } from "@/common/enums";

/**
 * Baileys WAMessageStatus codes carried by `messages.update`.
 * 0=ERROR 1=PENDING 2=SERVER_ACK 3=DELIVERY_ACK 4=READ 5=PLAYED
 */
const WA_STATUS = {
  ERROR: 0,
  PENDING: 1,
  SERVER_ACK: 2,
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
} as const;

// Outbound message kept around so a delivery receipt can be attributed to it
// (and so a failed send can be retried through the alternate addressing).
const OUT_PREFIX = "wa:out:";
const OUT_TTL_SECONDS = 24 * 3600;

// Per-session, per-day delivery counters powering the health check.
const STATS_PREFIX = "wa:stats:";
const STATS_TTL_SECONDS = 8 * 24 * 3600;

// Cooldown between two "delivery degraded" alerts for the same session.
const ALERT_PREFIX = "wa:alert:delivery:";
const ALERT_COOLDOWN_SECONDS = 6 * 3600;

export interface OutboundRecord {
  sessionId: string;
  /** JID the message was actually addressed to (may be a @lid). */
  jid: string;
  /** Recipient as requested by the caller (phone digits or JID). */
  to: string;
  /** Original send payload, replayed as-is when retrying. */
  payload: Record<string, any>;
  /** True once a retry has been scheduled, so we never loop. */
  retried?: boolean;
  sentAt: number;
}

export interface DeliveryHealth {
  sessionId: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  /** delivered+read over sent, or null when there is not enough volume. */
  deliveryRate: number | null;
  degraded: boolean;
}

@Injectable()
export class MessageDeliveryService {
  private readonly logger = new Logger(MessageDeliveryService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });
    this.logger.log("MessageDeliveryService initialized");
  }

  private dayKey(date = new Date()): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  private statsKey(sessionId: string, date = new Date()): string {
    return `${STATS_PREFIX}${sessionId}:${this.dayKey(date)}`;
  }

  private async bump(sessionId: string, field: string): Promise<void> {
    try {
      const key = this.statsKey(sessionId);
      await this.redis.hincrby(key, field, 1);
      await this.redis.expire(key, STATS_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Failed to bump ${field} for ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Remember an outbound message so its delivery receipt can be attributed,
   * and count it towards the session's daily volume. Called by BaileysService
   * right after WhatsApp accepted the send.
   */
  async recordSent(record: Omit<OutboundRecord, "sentAt">, messageId: string): Promise<void> {
    if (!messageId) return;
    try {
      const value: OutboundRecord = { ...record, sentAt: Date.now() };
      await this.redis.set(
        `${OUT_PREFIX}${messageId}`,
        JSON.stringify(value),
        "EX",
        OUT_TTL_SECONDS,
      );
      await this.bump(record.sessionId, "sent");
    } catch (error) {
      this.logger.warn(`Failed to record outbound ${messageId}: ${error.message}`);
    }
  }

  private async getOutbound(messageId: string): Promise<OutboundRecord | null> {
    try {
      const raw = await this.redis.get(`${OUT_PREFIX}${messageId}`);
      return raw ? (JSON.parse(raw) as OutboundRecord) : null;
    } catch {
      return null;
    }
  }

  /**
   * Turn Baileys delivery receipts into persisted message state.
   *
   * Outbound rows are created optimistically with status SENT and only ever
   * flipped to FAILED when the send call itself throws — an asynchronous
   * ERROR receipt used to go unnoticed, which is how a session that delivered
   * to nobody could look perfectly healthy.
   */
  @OnEvent("whatsapp.message.update")
  async handleMessageUpdate(payload: {
    sessionId: string;
    update: {
      key?: { remoteJid?: string; id?: string; fromMe?: boolean };
      update?: { status?: number; [key: string]: any };
    };
  }): Promise<void> {
    const messageId = payload?.update?.key?.id;
    const status = payload?.update?.update?.status;
    const sessionId = payload?.sessionId;

    if (!messageId || status === undefined || status === null || !sessionId) return;
    // Receipts only describe messages we sent; an inbound row must never be
    // rewritten by one (their ids live in the same externalMessageId column).
    if (payload?.update?.key?.fromMe === false) return;
    // SERVER_ACK and below carry no delivery information.
    if (status !== WA_STATUS.ERROR && status < WA_STATUS.DELIVERY_ACK) return;

    const outbound = await this.getOutbound(messageId);

    if (status === WA_STATUS.ERROR) {
      await this.bump(sessionId, "failed");
      await this.markMessage(messageId, MessageStatus.FAILED);
      this.logger.warn(
        `❌ Delivery FAILED [${sessionId}] msg=${messageId}${outbound ? ` to=${outbound.to}` : ""}`,
      );
      this.eventEmitter.emit("whatsapp.delivery.failed", {
        sessionId,
        messageId,
        to: outbound?.to,
        jid: outbound?.jid,
      });
      await this.scheduleRetry(messageId, outbound);
      return;
    }

    if (status >= WA_STATUS.READ) {
      await this.bump(sessionId, "read");
      await this.markMessage(messageId, MessageStatus.READ);
      return;
    }

    await this.bump(sessionId, "delivered");
    await this.markMessage(messageId, MessageStatus.DELIVERED);
  }

  /**
   * Apply a delivery status to the persisted message, if the sender recorded
   * its WhatsApp id. Never walks a message backwards (READ stays READ), but a
   * FAILED receipt always wins since it is terminal.
   */
  private async markMessage(externalMessageId: string, status: MessageStatus): Promise<void> {
    try {
      const message = await this.messageRepository.findOne({
        where: { externalMessageId },
      });
      if (!message) return;

      const rank: Record<string, number> = {
        [MessageStatus.SENT]: 1,
        [MessageStatus.DELIVERED]: 2,
        [MessageStatus.READ]: 3,
      };

      if (status !== MessageStatus.FAILED) {
        const current = rank[message.status] || 0;
        if ((rank[status] || 0) <= current) return;
      }

      message.status = status;
      const now = new Date();
      if (status === MessageStatus.DELIVERED && !message.deliveredAt) {
        message.deliveredAt = now;
      }
      if (status === MessageStatus.READ) {
        if (!message.deliveredAt) message.deliveredAt = now;
        message.readAt = now;
      }
      if (status === MessageStatus.FAILED) {
        message.metadata = {
          ...(message.metadata || {}),
          error: {
            message: "WhatsApp reported the message as undelivered",
            code: "DELIVERY_ERROR",
            timestamp: now,
          },
        };
      }
      await this.messageRepository.save(message);
    } catch (error) {
      this.logger.warn(`Failed to persist status for ${externalMessageId}: ${error.message}`);
    }
  }

  /**
   * Ask BaileysService (over the event bus, to avoid a circular dependency) to
   * replay the message once through the other addressing scheme. A LID/phone
   * desync makes one of the two paths fail while the other still works; a
   * genuinely unreachable recipient simply fails twice and stops there.
   */
  private async scheduleRetry(messageId: string, outbound: OutboundRecord | null): Promise<void> {
    if (!outbound || outbound.retried) return;
    if (this.configService.get("WHATSAPP_DELIVERY_RETRY", "true") !== "true") return;

    try {
      await this.redis.set(
        `${OUT_PREFIX}${messageId}`,
        JSON.stringify({ ...outbound, retried: true }),
        "EX",
        OUT_TTL_SECONDS,
      );
      this.eventEmitter.emit("whatsapp.delivery.retry", {
        sessionId: outbound.sessionId,
        to: outbound.to,
        jid: outbound.jid,
        payload: outbound.payload,
        originalMessageId: messageId,
      });
      this.logger.log(`🔁 Scheduling alternate-addressing retry for ${messageId} (${outbound.to})`);
    } catch (error) {
      this.logger.warn(`Failed to schedule retry for ${messageId}: ${error.message}`);
    }
  }

  /** Aggregate today's counters for a session. */
  async getHealth(sessionId: string): Promise<DeliveryHealth> {
    const minVolume = Number(this.configService.get("WHATSAPP_HEALTH_MIN_VOLUME", 5));
    const threshold = Number(this.configService.get("WHATSAPP_HEALTH_MIN_RATE", 0.5));

    let raw: Record<string, string> = {};
    try {
      raw = (await this.redis.hgetall(this.statsKey(sessionId))) || {};
    } catch (error) {
      this.logger.warn(`Failed to read stats for ${sessionId}: ${error.message}`);
    }

    const sent = Number(raw.sent || 0);
    const delivered = Number(raw.delivered || 0);
    const read = Number(raw.read || 0);
    const failed = Number(raw.failed || 0);
    const acked = delivered + read;
    const settled = acked + failed;

    const deliveryRate = settled >= minVolume ? acked / settled : null;

    return {
      sessionId,
      sent,
      delivered,
      read,
      failed,
      deliveryRate,
      degraded: deliveryRate !== null && deliveryRate < threshold,
    };
  }

  /**
   * Surface sessions that are connected but no longer getting messages
   * through. This is the signal that was missing when a session silently
   * stopped delivering while still reporting CONNECTED.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkSessionHealth(): Promise<void> {
    try {
      const sessions = await this.sessionRepository.find({
        where: { status: WhatsAppSessionStatus.CONNECTED },
        select: ["id", "name", "phoneNumber", "userId", "organizationId"],
      });

      for (const session of sessions) {
        const health = await this.getHealth(session.id);
        if (!health.degraded) continue;

        const alertKey = `${ALERT_PREFIX}${session.id}`;
        const fresh = await this.redis.set(
          alertKey,
          Date.now().toString(),
          "EX",
          ALERT_COOLDOWN_SECONDS,
          "NX",
        );
        if (fresh !== "OK") continue;

        const pct = Math.round((health.deliveryRate || 0) * 100);
        this.logger.warn(
          `🚨 Delivery degraded for session ${session.id} (${session.name}): ` +
            `${pct}% delivered — ${health.failed} failed / ${health.delivered + health.read} acked today`,
        );
        this.eventEmitter.emit("whatsapp.session.delivery_degraded", {
          sessionId: session.id,
          sessionName: session.name,
          phoneNumber: session.phoneNumber,
          userId: session.userId,
          organizationId: session.organizationId,
          health,
        });
      }
    } catch (error) {
      this.logger.error(`Delivery health check failed: ${error.message}`);
    }
  }
}
