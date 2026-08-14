import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { AgentConversation, AgentMessage } from "@/common/entities";
import { MessageRole } from "@/common/enums";

/**
 * How cold contacts (numbers that never wrote to us) are treated:
 *  - off    : no check at all
 *  - warn   : log them, never block
 *  - limit  : allow, but stop once the daily cold-contact budget is spent
 *  - block  : never message a cold contact
 *
 * Messaging strangers is what gets a number restricted, and the trigger is
 * volume — roughly 15-20 cold sends in a day.
 *
 * The default is "warn": it reports cold contacts without ever refusing a
 * send, so the detection can be validated against real traffic before it is
 * allowed to block anything. Switch to "limit" (recommended) once the logs
 * confirm warm contacts are not being misread as cold.
 */
export type ColdContactPolicy = "off" | "warn" | "limit" | "block";

const COLD_PREFIX = "wa:cold:";
const COLD_TTL_SECONDS = 2 * 24 * 3600;

/**
 * Extends BadRequestException so every caller — REST, external API, queue —
 * surfaces a 400 with a usable code instead of a generic 500.
 */
export class ColdContactBlockedError extends BadRequestException {
  readonly code = "COLD_CONTACT_BLOCKED";
  constructor(message: string) {
    super({ statusCode: 400, message, error: "COLD_CONTACT_BLOCKED" });
    this.name = "ColdContactBlockedError";
  }
}

@Injectable()
export class OutboundGuardService {
  private readonly logger = new Logger(OutboundGuardService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });
    this.logger.log("OutboundGuardService initialized");
  }

  private get policy(): ColdContactPolicy {
    return this.configService.get<ColdContactPolicy>(
      "WHATSAPP_COLD_CONTACT_POLICY",
      "warn",
    );
  }

  private get dailyLimit(): number {
    return Number(this.configService.get("WHATSAPP_COLD_DAILY_LIMIT", 15));
  }

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  /**
   * A contact is "warm" as soon as it has ever sent us a message on this
   * session — that inbound message is what makes replying safe.
   */
  private async hasInboundHistory(
    sessionId: string,
    digits: string,
    lidDigits?: string,
  ): Promise<boolean> {
    if (!digits && !lidDigits) return false;

    // The identifier is stored inconsistently: some conversations key on the
    // phone number, many others on the contact's LID (WhatsApp's per-account
    // id). Matching only the phone number reports established contacts as
    // cold, so both identifiers are compared, over both columns.
    const identifiers = [digits, lidDigits]
      .filter((v) => v && v.length >= 6)
      .map((v) => `%${v.slice(-9)}`);
    if (!identifiers.length) return false;

    const qb = this.conversationRepository
      .createQueryBuilder("conv")
      .select(["conv.id"])
      .where("conv.sessionId = :sessionId", { sessionId })
      .andWhere(
        `(regexp_replace(COALESCE(conv.clientPhoneNumber, ''), '\\D', '', 'g') LIKE ANY(:ids)
          OR regexp_replace(COALESCE(conv.externalId, ''), '\\D', '', 'g') LIKE ANY(:ids))`,
        { ids: identifiers },
      )
      .limit(20);

    const conversations = await qb.getMany();

    if (!conversations.length) return false;

    const count = await this.messageRepository.count({
      where: conversations.map((c) => ({
        conversationId: c.id,
        role: MessageRole.USER,
      })),
    });

    return count > 0;
  }

  private async coldCount(sessionId: string): Promise<number> {
    try {
      const v = await this.redis.get(`${COLD_PREFIX}${sessionId}:${this.dayKey()}`);
      return Number(v || 0);
    } catch {
      return 0;
    }
  }

  private async bumpCold(sessionId: string): Promise<void> {
    try {
      const key = `${COLD_PREFIX}${sessionId}:${this.dayKey()}`;
      await this.redis.incr(key);
      await this.redis.expire(key, COLD_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Failed to count cold contact for ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Decide whether this outbound message may go out.
   *
   * Throws ColdContactBlockedError when the configured policy refuses it;
   * the caller surfaces that as a normal send failure.
   */
  async assertCanSend(sessionId: string, to: string, resolvedJid?: string): Promise<void> {
    const policy = this.policy;
    if (policy === "off") return;

    const digits = String(to || "").replace(/\D/g, "");
    // Groups and broadcasts carry no contact to reason about.
    if (String(to).includes("@g.us") || String(resolvedJid || "").includes("@g.us")) return;
    if (!digits) return;

    // The recipient is usually addressed by LID, which is also how most
    // conversations are keyed — so it is the more reliable lookup of the two.
    const lidDigits = String(resolvedJid || "").includes("@lid")
      ? String(resolvedJid).split("@")[0].split(":")[0].replace(/\D/g, "")
      : "";

    let warm = false;
    try {
      warm = await this.hasInboundHistory(sessionId, digits, lidDigits);
    } catch (error) {
      // A lookup failure must never stop a legitimate reply.
      this.logger.warn(`Cold-contact lookup failed for ${digits}: ${error.message}`);
      return;
    }
    if (warm) return;

    const used = await this.coldCount(sessionId);
    const limit = this.dailyLimit;

    if (policy === "block") {
      throw new ColdContactBlockedError(
        `Recipient ${digits} has never messaged this session. Cold outreach is disabled ` +
          `(WHATSAPP_COLD_CONTACT_POLICY=block).`,
      );
    }

    if (policy === "limit" && used >= limit) {
      throw new ColdContactBlockedError(
        `Daily cold-contact budget reached for this session (${used}/${limit}). ` +
          `Messaging more strangers today risks getting the number restricted by WhatsApp.`,
      );
    }

    await this.bumpCold(sessionId);
    this.logger.warn(
      `🧊 Cold contact ${digits} on session ${sessionId} (${used + 1}/${limit} today, policy=${policy})`,
    );
  }

  /**
   * Make an outbound message look like it was typed rather than emitted by a
   * loop: subscribe to the chat, show "typing" for a length-dependent, jittered
   * pause, then release it. Robotic timing is one of the signals WhatsApp
   * weighs when restricting a number.
   */
  async humanPacing(sock: any, jid: string, text?: string): Promise<void> {
    if (this.configService.get("WHATSAPP_HUMAN_PACING", "true") !== "true") return;
    if (!sock || !jid) return;

    const minMs = Number(this.configService.get("WHATSAPP_PACING_MIN_MS", 800));
    const maxMs = Number(this.configService.get("WHATSAPP_PACING_MAX_MS", 4000));
    const length = (text || "").length;
    // ~45 ms per character lands a short reply near 1s and a long one near 4s.
    const base = Math.min(maxMs, Math.max(minMs, length * 45));
    const jitter = base * (0.75 + Math.random() * 0.5);
    const delay = Math.round(Math.min(maxMs, Math.max(minMs, jitter)));

    try {
      await sock.presenceSubscribe?.(jid);
      await sock.sendPresenceUpdate?.("composing", jid);
      await new Promise((r) => setTimeout(r, delay));
      await sock.sendPresenceUpdate?.("paused", jid);
    } catch (error) {
      // Presence is cosmetic — never let it block the actual send.
      this.logger.debug?.(`Presence pacing skipped for ${jid}: ${error.message}`);
    }
  }
}
