import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { AgentConversation, AgentMessage, WhatsAppContact } from "@/common/entities";
import { MessageRole } from "@/common/enums";

const COLD_PREFIX = "wa:cold:";
const COLD_TTL_SECONDS = 2 * 24 * 3600;

export interface ContactStatus {
  /** Digits as asked for, normalised. */
  phone: string;
  /** True when this number already wrote to the session at least once. */
  hasWritten: boolean;
  /** Number of inbound messages found (capped by the lookup window). */
  inboundCount: number;
  /** Most recent inbound message, ISO string, when known. */
  lastInboundAt: string | null;
}

/**
 * Cold-contact awareness for outbound WhatsApp traffic.
 *
 * Messaging people who never wrote first is what gets a number restricted,
 * and the trigger is volume — roughly 15-20 such sends in a day. This service
 * therefore *reports* on it, and exposes the lookup so callers can decide
 * before sending; it deliberately never refuses a send of its own accord,
 * since a wrong "cold" verdict would silently drop legitimate replies.
 */
@Injectable()
export class OutboundGuardService {
  private readonly logger = new Logger(OutboundGuardService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppContact)
    private contactRepository: Repository<WhatsAppContact>,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });
    this.logger.log("OutboundGuardService initialized");
  }

  private dayKey(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  private static normalise(value: string): string {
    return String(value || "").replace(/\D/g, "");
  }

  /**
   * Contacts are keyed inconsistently: some conversations carry the phone
   * number, many others the contact's LID. The stored contact row is what
   * links the two, so the LID is resolved from it before matching.
   */
  private async resolveLid(sessionId: string, digits: string): Promise<string> {
    if (!digits) return "";
    try {
      const contact = await this.contactRepository
        .createQueryBuilder("c")
        .select(["c.lid"])
        .where("c.sessionId = :sessionId", { sessionId })
        .andWhere(
          "regexp_replace(COALESCE(c.phoneNumber, ''), '\\D', '', 'g') LIKE :tail",
          { tail: `%${digits.slice(-9)}` },
        )
        .limit(1)
        .getOne();
      const fromContact = OutboundGuardService.normalise(contact?.lid || "");
      if (fromContact) return fromContact;

      // Most contacts are stored LID-first (phoneNumber = "lid_<digits>"), so
      // the row above never matches on the phone number. The mapping learned
      // from previous sends is the only offline link between the two.
      return await this.readLearnedLid(sessionId, digits);
    } catch (error) {
      this.logger.warn(`LID lookup failed for ${digits}: ${error.message}`);
      return "";
    }
  }

  /**
   * Phone ⇄ LID mappings learned while sending. WhatsApp only reveals a
   * contact's LID on a live session, so it is cached here to keep
   * getContactStatus() accurate while the session is down.
   */
  private learnedKey(sessionId: string, digits: string): string {
    return `lidmap:${sessionId}:${digits.slice(-9)}`;
  }

  private async readLearnedLid(sessionId: string, digits: string): Promise<string> {
    try {
      const v = await this.redis.get(this.learnedKey(sessionId, digits));
      return OutboundGuardService.normalise(v || "");
    } catch {
      return "";
    }
  }

  /** Record a phone ⇄ LID pair observed on a live session (inbound or outbound). */
  async learnLidMapping(sessionId: string, phone: string, lid: string): Promise<void> {
    await this.rememberLid(
      sessionId,
      OutboundGuardService.normalise(phone),
      OutboundGuardService.normalise(lid),
    );
  }

  private async rememberLid(sessionId: string, digits: string, lidDigits: string): Promise<void> {
    if (!digits || !lidDigits) return;
    try {
      // Kept for a year: a contact's LID does not change, and the value is
      // only useful for as long as the conversation history exists.
      await this.redis.set(this.learnedKey(sessionId, digits), lidDigits, "EX", 31536000);
    } catch {
      // Best effort — never let cache writes affect delivery.
    }
  }

  /**
   * Whether a number already wrote to this session, and when.
   *
   * This is the lookup partners are expected to call before sending to a
   * number they hold in their own database.
   */
  async getContactStatus(
    sessionId: string,
    phone: string,
    knownLid?: string,
  ): Promise<ContactStatus> {
    const digits = OutboundGuardService.normalise(phone);
    const empty: ContactStatus = {
      phone: digits,
      hasWritten: false,
      inboundCount: 0,
      lastInboundAt: null,
    };
    if (!digits) return empty;

    const lidDigits = OutboundGuardService.normalise(knownLid || "") ||
      (await this.resolveLid(sessionId, digits));

    const identifiers = [digits, lidDigits]
      .filter((v) => v && v.length >= 6)
      .map((v) => `%${v.slice(-9)}`);
    if (!identifiers.length) return empty;

    const conversations = await this.conversationRepository
      .createQueryBuilder("conv")
      .select(["conv.id"])
      .where("conv.sessionId = :sessionId", { sessionId })
      .andWhere(
        `(regexp_replace(COALESCE(conv.clientPhoneNumber, ''), '\\D', '', 'g') LIKE ANY(:ids)
          OR regexp_replace(COALESCE(conv.externalId, ''), '\\D', '', 'g') LIKE ANY(:ids))`,
        { ids: identifiers },
      )
      .limit(20)
      .getMany();

    if (!conversations.length) return empty;

    const ids = conversations.map((c) => c.id);
    const [inboundCount, latest] = await Promise.all([
      this.messageRepository
        .createQueryBuilder("m")
        .where("m.conversationId IN (:...ids)", { ids })
        .andWhere("m.role = :role", { role: MessageRole.USER })
        .getCount(),
      this.messageRepository
        .createQueryBuilder("m")
        .select(["m.createdAt"])
        .where("m.conversationId IN (:...ids)", { ids })
        .andWhere("m.role = :role", { role: MessageRole.USER })
        .orderBy("m.createdAt", "DESC")
        .limit(1)
        .getOne(),
    ]);

    return {
      phone: digits,
      hasWritten: inboundCount > 0,
      inboundCount,
      lastInboundAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
    };
  }

  /**
   * Same lookup over several numbers, for partners checking a batch.
   *
   * Each number costs a few queries, so they run in small waves rather than
   * all at once — a 200-number batch fired in parallel would exhaust the
   * connection pool and stall unrelated traffic.
   */
  async getContactStatuses(
    sessionId: string,
    phones: string[],
    knownLids: (string | undefined)[] = [],
  ): Promise<ContactStatus[]> {
    // Keep each number paired with the LID resolved for it before de-duplicating.
    const byPhone = new Map<string, string | undefined>();
    phones.forEach((p, i) => {
      const digits = OutboundGuardService.normalise(p);
      if (!digits) return;
      if (!byPhone.get(digits)) byPhone.set(digits, knownLids[i]);
    });

    const entries = [...byPhone.entries()];
    const CHUNK = 10;
    const out: ContactStatus[] = [];
    for (let i = 0; i < entries.length; i += CHUNK) {
      const wave = entries.slice(i, i + CHUNK);
      out.push(
        ...(await Promise.all(wave.map(([p, lid]) => this.getContactStatus(sessionId, p, lid)))),
      );
    }
    return out;
  }

  private async bumpCold(sessionId: string): Promise<number> {
    try {
      const key = `${COLD_PREFIX}${sessionId}:${this.dayKey()}`;
      const used = await this.redis.incr(key);
      await this.redis.expire(key, COLD_TTL_SECONDS);
      return used;
    } catch (error) {
      this.logger.warn(`Failed to count cold contact for ${sessionId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Record — never refuse — an outbound message to someone who never wrote in.
   * Deciding whether such a message should go out belongs to the caller, which
   * can consult getContactStatus() beforehand.
   */
  async observe(sessionId: string, to: string, resolvedJid?: string): Promise<void> {
    if (this.configService.get("WHATSAPP_COLD_CONTACT_TRACKING", "true") !== "true") return;

    const digits = OutboundGuardService.normalise(to);
    // Groups and broadcasts carry no contact to reason about.
    if (String(to).includes("@g.us") || String(resolvedJid || "").includes("@g.us")) return;
    if (!digits) return;

    const lidDigits = String(resolvedJid || "").includes("@lid")
      ? OutboundGuardService.normalise(String(resolvedJid).split("@")[0].split(":")[0])
      : "";

    // The live session just resolved this number to a LID — persist the pair so
    // contacts/status stays correct once the session is gone.
    await this.rememberLid(sessionId, digits, lidDigits);

    try {
      const status = await this.getContactStatus(sessionId, digits, lidDigits);
      if (status.hasWritten) return;

      const used = await this.bumpCold(sessionId);
      const advisory = Number(this.configService.get("WHATSAPP_COLD_DAILY_ADVISORY", 15));
      this.logger.warn(
        `🧊 Cold contact ${digits} on session ${sessionId} (${used} today` +
          (advisory > 0 && used >= advisory
            ? `, above the ${advisory}/day advisory — restriction risk`
            : "") +
          ")",
      );
    } catch (error) {
      // Observability must never interfere with delivery.
      this.logger.warn(`Cold-contact check failed for ${digits}: ${error.message}`);
    }
  }

  /** Cold contacts counted for this session today. */
  async getColdCountToday(sessionId: string): Promise<number> {
    try {
      const v = await this.redis.get(`${COLD_PREFIX}${sessionId}:${this.dayKey()}`);
      return Number(v || 0);
    } catch {
      return 0;
    }
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
