import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import Redis from "ioredis";
import {
  AgentConversation,
  AgentMessage,
  BroadcastContact,
  WhatsAppContact,
  WhatsAppLabel,
  WhatsAppPoll,
  WhatsAppSession,
} from "../../common/entities";
import { WhatsAppAutomationSettings } from "../../common/entities/whatsapp-session.entity";
import { MessageRole } from "../../common/enums";
import { BaileysService } from "./baileys.service";
import { TextToSpeechService } from "./text-to-speech.service";

const CHANNEL_MAX_ADMINS = 16;
const CHANNEL_ADMIN_INVITE_TTL_SECONDS = 7 * 24 * 3600;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface MessageRef {
  chat: string;
  messageId: string;
  fromMe?: boolean;
  participant?: string;
}

export interface MediaInput {
  url: string;
  type: "image" | "video" | "document" | "audio";
  caption?: string;
  fileName?: string;
  mimetype?: string;
}

export interface PublishContent {
  text?: string;
  media?: MediaInput;
  backgroundColor?: string;
  font?: number;
}

export interface StatusAudience {
  type: "optin" | "contacts" | "jids";
  jids?: string[];
  tags?: string[];
}

export interface PresenceInfo {
  jid: string;
  presence: "available" | "unavailable" | "composing" | "recording" | "paused" | string;
  lastSeenAt?: string;
  observedAt: string;
}

/** Statuses are encrypted per viewer; one send per batch keeps it bounded. */
const STATUS_BATCH = 300;
const PRESENCE_TTL_SECONDS = 7 * 24 * 3600;
const CALL_NOTICE_TTL_SECONDS = 24 * 3600;

/**
 * Everything a session can do on WhatsApp besides answering a message:
 * polls, reactions, edits, groups, channels, statuses, labels, profile,
 * presence, calls. Each method takes the session id, resolves the live
 * socket and translates our plain inputs (phone numbers, URLs, stored
 * message ids) into what Baileys expects.
 */
@Injectable()
export class WhatsAppActionsService {
  private readonly logger = new Logger(WhatsAppActionsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly baileysService: BaileysService,
    private readonly tts: TextToSpeechService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(WhatsAppSession)
    private readonly sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppContact)
    private readonly contactRepository: Repository<WhatsAppContact>,
    @InjectRepository(BroadcastContact)
    private readonly broadcastContactRepository: Repository<BroadcastContact>,
    @InjectRepository(WhatsAppPoll)
    private readonly pollRepository: Repository<WhatsAppPoll>,
    @InjectRepository(WhatsAppLabel)
    private readonly labelRepository: Repository<WhatsAppLabel>,
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  private sock(sessionId: string): any {
    const sock = this.baileysService.getSessionSocket(sessionId);
    if (!sock || this.baileysService.getSessionStatus(sessionId) !== "connected") {
      throw new BadRequestException("La session WhatsApp n'est pas connectée");
    }
    return sock;
  }

  /**
   * Accepts what callers naturally have — a phone number, a LID, a group id,
   * an invite-style id — and returns a full JID.
   */
  toJid(target: string): string {
    const raw = String(target || "").trim();
    if (!raw) throw new BadRequestException("Destinataire manquant");
    if (raw.includes("@")) return raw;
    if (/^lid[_:]?(\d+)$/i.test(raw)) return `${raw.replace(/^lid[_:]?/i, "")}@lid`;
    if (/^\d+-\d+$/.test(raw)) return `${raw}@g.us`;
    const digits = raw.replace(/\D/g, "");
    if (!digits) throw new BadRequestException(`Destinataire invalide : ${raw}`);
    return `${digits}@s.whatsapp.net`;
  }

  private toJids(targets: string[]): string[] {
    return [...new Set((targets || []).map((t) => this.toJid(t)))];
  }

  private messageKey(ref: MessageRef, sessionId?: string): any {
    const remoteJid = this.toJid(ref.chat);
    const key: any = {
      remoteJid,
      id: ref.messageId,
      fromMe: ref.fromMe !== false,
    };
    if (remoteJid.endsWith("@g.us") && ref.participant) {
      key.participant = this.toJid(ref.participant);
    }
    return key;
  }

  private async fetchMedia(url: string): Promise<{ buffer: Buffer; mimetype: string }> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new BadRequestException(`Média inaccessible (${response.status}) : ${url}`);
    }
    const mimetype = response.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 64 * 1024 * 1024) {
      throw new BadRequestException("Média trop volumineux (max 64 Mo)");
    }
    return { buffer, mimetype: mimetype.split(";")[0] };
  }

  /** Build the Baileys content for text or a media item. */
  private async buildContent(content: PublishContent): Promise<any> {
    if (content.media) {
      const { buffer, mimetype } = await this.fetchMedia(content.media.url);
      const caption = content.media.caption ?? content.text;
      switch (content.media.type) {
        case "image":
          return { image: buffer, caption };
        case "video":
          return { video: buffer, caption };
        case "audio":
          return { audio: buffer, mimetype: content.media.mimetype || mimetype, ptt: false };
        case "document":
          return {
            document: buffer,
            mimetype: content.media.mimetype || mimetype,
            fileName: content.media.fileName || content.media.url.split("/").pop()?.split("?")[0] || "document",
            caption,
          };
      }
    }
    const text = String(content.text || "").trim();
    if (!text) throw new BadRequestException("Contenu vide");
    return { text };
  }

  private async recordOutbound(sessionId: string, jid: string, sent: any, summary: string, extra: Record<string, any> = {}) {
    // Keep the dashboard timeline honest for one-to-one chats; groups and
    // channels have no conversation row to attach to.
    if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return;
    try {
      const digits = jid.split("@")[0].split(":")[0];
      const conversation = await this.conversationRepository
        .createQueryBuilder("c")
        .where("c.sessionId = :sessionId", { sessionId })
        .andWhere(
          "(regexp_replace(COALESCE(c.clientPhoneNumber,''), '\\D', '', 'g') LIKE :tail OR regexp_replace(COALESCE(c.externalId,''), '\\D', '', 'g') LIKE :tail)",
          { tail: `%${digits.slice(-9)}` },
        )
        .orderBy("c.updatedAt", "DESC")
        .getOne();
      if (!conversation) return;
      const last = await this.messageRepository.findOne({
        where: { conversationId: conversation.id },
        order: { sequenceNumber: "DESC" },
      });
      await this.messageRepository.save(
        this.messageRepository.create({
          conversationId: conversation.id,
          role: MessageRole.AGENT,
          content: summary,
          sequenceNumber: (last?.sequenceNumber || 0) + 1,
          externalMessageId: sent?.key?.id,
          metadata: { source: "action", ...extra } as any,
        }),
      );
    } catch (error) {
      this.logger.debug?.(`Could not record outbound action: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Automation settings
  // ---------------------------------------------------------------------------

  async getAutomation(sessionId: string): Promise<WhatsAppAutomationSettings> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session introuvable");
    return session.automation || {};
  }

  async updateAutomation(sessionId: string, patch: Partial<WhatsAppAutomationSettings>): Promise<WhatsAppAutomationSettings> {
    const current = await this.getAutomation(sessionId);
    const next: WhatsAppAutomationSettings = { ...current, ...patch };
    if (patch.voiceReplies) next.voiceReplies = { ...(current.voiceReplies || { enabled: false }), ...patch.voiceReplies };
    await this.sessionRepository.update(sessionId, { automation: next });
    this.logger.log(`Automation updated for session ${sessionId}: ${JSON.stringify(patch)}`);
    return next;
  }

  // ---------------------------------------------------------------------------
  // Messages: polls, location, contacts, voice, reactions, edit, delete, forward
  // ---------------------------------------------------------------------------

  async sendPoll(sessionId: string, input: { chat: string; question: string; options: string[]; selectableCount?: number }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    const options = input.options.map((o) => String(o).trim()).filter(Boolean);
    const sent = await sock.sendMessage(jid, {
      poll: { name: input.question, values: options, selectableCount: input.selectableCount ?? 1 },
    });
    const poll = await this.pollRepository.save(
      this.pollRepository.create({
        sessionId,
        chatJid: jid,
        messageId: sent?.key?.id,
        question: input.question,
        options,
        selectableCount: input.selectableCount ?? 1,
        pollMessage: sent ? JSON.parse(JSON.stringify(sent)) : null,
        votes: {},
        voterCount: 0,
      }),
    );
    await this.recordOutbound(sessionId, jid, sent, `📊 ${input.question}\n${options.map((o) => `• ${o}`).join("\n")}`, { poll: poll.id });
    return { messageId: sent?.key?.id, pollId: poll.id, chat: jid };
  }

  async getPoll(sessionId: string, pollId: string) {
    const poll = await this.pollRepository.findOne({ where: { id: pollId, sessionId } });
    if (!poll) throw new NotFoundException("Sondage introuvable");
    return poll;
  }

  async listPolls(sessionId: string, chat?: string) {
    return this.pollRepository.find({
      where: chat ? { sessionId, chatJid: this.toJid(chat) } : { sessionId },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  async sendLocation(sessionId: string, input: { chat: string; latitude: number; longitude: number; name?: string; address?: string }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    const sent = await sock.sendMessage(jid, {
      location: { degreesLatitude: input.latitude, degreesLongitude: input.longitude, name: input.name, address: input.address },
    });
    await this.recordOutbound(sessionId, jid, sent, `📍 ${input.name || ""} ${input.address || ""} (${input.latitude}, ${input.longitude})`.trim());
    return { messageId: sent?.key?.id, chat: jid };
  }

  async sendContacts(sessionId: string, input: { chat: string; contacts: Array<{ fullName: string; phone: string; organization?: string }> }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    const contacts = input.contacts.map((c) => {
      const digits = c.phone.replace(/\D/g, "");
      const vcard =
        "BEGIN:VCARD\nVERSION:3.0\n" +
        `FN:${c.fullName}\n` +
        (c.organization ? `ORG:${c.organization};\n` : "") +
        `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}\n` +
        "END:VCARD";
      return { displayName: c.fullName, vcard };
    });
    const sent = await sock.sendMessage(jid, {
      contacts: { displayName: contacts.length === 1 ? contacts[0].displayName : `${contacts.length} contacts`, contacts },
    });
    await this.recordOutbound(sessionId, jid, sent, `👤 ${input.contacts.map((c) => `${c.fullName} (${c.phone})`).join(", ")}`);
    return { messageId: sent?.key?.id, chat: jid };
  }

  /** Voice note from text (TTS) or from an audio URL. */
  async sendVoice(sessionId: string, input: { chat: string; text?: string; audioUrl?: string; voice?: string }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    let audio: Buffer;
    let mimetype: string;
    if (input.audioUrl) {
      ({ buffer: audio, mimetype } = await this.fetchMedia(input.audioUrl));
    } else if (input.text) {
      ({ buffer: audio, mimetype } = await this.tts.synthesize(input.text, { voice: input.voice }));
    } else {
      throw new BadRequestException("Fournir text ou audioUrl");
    }
    const sent = await sock.sendMessage(jid, { audio, mimetype, ptt: true });
    await this.recordOutbound(sessionId, jid, sent, input.text ? `🎙️ ${input.text}` : "🎙️ Message vocal", { voice: true });
    return { messageId: sent?.key?.id, chat: jid };
  }

  async react(sessionId: string, ref: MessageRef & { emoji: string }) {
    const sock = this.sock(sessionId);
    const key = this.messageKey(ref);
    await sock.sendMessage(key.remoteJid, { react: { text: ref.emoji || "", key } });
    return { ok: true, chat: key.remoteJid, messageId: ref.messageId, emoji: ref.emoji || null };
  }

  async editMessage(sessionId: string, ref: MessageRef & { text: string }) {
    const sock = this.sock(sessionId);
    const key = this.messageKey({ ...ref, fromMe: true });
    const sent = await sock.sendMessage(key.remoteJid, { text: ref.text, edit: key });
    await this.messageRepository
      .createQueryBuilder()
      .update(AgentMessage)
      .set({ content: ref.text, metadata: () => `metadata || '{"edited":true}'::jsonb` })
      .where("externalMessageId = :id", { id: ref.messageId })
      .execute()
      .catch(() => undefined);
    return { ok: true, chat: key.remoteJid, messageId: ref.messageId, editId: sent?.key?.id };
  }

  async deleteMessage(sessionId: string, ref: MessageRef) {
    const sock = this.sock(sessionId);
    const key = this.messageKey({ ...ref, fromMe: ref.fromMe !== false });
    await sock.sendMessage(key.remoteJid, { delete: key });
    await this.messageRepository
      .createQueryBuilder()
      .update(AgentMessage)
      .set({ metadata: () => `metadata || '{"deleted":true,"deletedBy":"us"}'::jsonb` })
      .where("externalMessageId = :id", { id: ref.messageId })
      .execute()
      .catch(() => undefined);
    return { ok: true, chat: key.remoteJid, messageId: ref.messageId };
  }

  /**
   * Forward a message we stored to other chats. We do not keep the original
   * WAMessage, so the stored content is re-sent flagged as forwarded.
   */
  async forwardMessage(sessionId: string, ref: MessageRef & { to: string[] }) {
    const sock = this.sock(sessionId);
    const stored = await this.messageRepository.findOne({ where: { externalMessageId: ref.messageId } });
    if (!stored) throw new NotFoundException("Message introuvable dans l'historique");
    const content: any = stored.mediaUrl
      ? await this.buildContent({
          text: stored.mediaCaption || stored.content,
          media: { url: stored.mediaUrl, type: (stored.mediaType as any) || "image", caption: stored.mediaCaption || undefined },
        })
      : { text: stored.content };
    content.contextInfo = { isForwarded: true, forwardingScore: 1 };
    const results = [];
    for (const target of this.toJids(ref.to)) {
      const sent = await sock.sendMessage(target, content);
      await this.recordOutbound(sessionId, target, sent, `↪️ ${stored.content}`, { forwardedFrom: ref.messageId });
      results.push({ chat: target, messageId: sent?.key?.id });
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    }
    return { forwarded: results };
  }

  async markRead(sessionId: string, input: { chat: string; messageIds?: string[] }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    let ids = input.messageIds || [];
    if (!ids.length) {
      // No ids given: read the latest inbound messages we know of for this chat.
      const digits = jid.split("@")[0].split(":")[0];
      const rows = await this.messageRepository
        .createQueryBuilder("m")
        .innerJoin("m.conversation", "c")
        .select(["m.externalMessageId"])
        .where("c.sessionId = :sessionId", { sessionId })
        .andWhere("m.role = :role", { role: MessageRole.USER })
        .andWhere("m.externalMessageId IS NOT NULL")
        .andWhere(
          "(regexp_replace(COALESCE(c.clientPhoneNumber,''), '\\D', '', 'g') LIKE :tail OR regexp_replace(COALESCE(c.externalId,''), '\\D', '', 'g') LIKE :tail)",
          { tail: `%${digits.slice(-9)}` },
        )
        .orderBy("m.createdAt", "DESC")
        .limit(20)
        .getMany();
      ids = rows.map((r) => r.externalMessageId).filter(Boolean);
    }
    if (!ids.length) return { ok: true, read: 0 };
    await sock.readMessages(ids.map((id) => ({ remoteJid: jid, id, fromMe: false })));
    return { ok: true, read: ids.length };
  }

  async setDisappearing(sessionId: string, input: { chat: string; seconds: number }) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(input.chat);
    await sock.sendMessage(jid, { disappearingMessagesInChat: input.seconds > 0 ? input.seconds : false });
    return { ok: true, chat: jid, seconds: input.seconds };
  }

  // ---------------------------------------------------------------------------
  // Chats: archive, pin, unread, mute, labels, block
  // ---------------------------------------------------------------------------

  private async lastMessageStub(sessionId: string, jid: string): Promise<any[]> {
    // chatModify wants the last message of the chat to anchor the mutation;
    // the id is enough for WhatsApp to apply archive/read flags.
    const digits = jid.split("@")[0].split(":")[0];
    const row = await this.messageRepository
      .createQueryBuilder("m")
      .innerJoin("m.conversation", "c")
      .select(["m.externalMessageId", "m.role", "m.createdAt"])
      .where("c.sessionId = :sessionId", { sessionId })
      .andWhere("m.externalMessageId IS NOT NULL")
      .andWhere(
        "(regexp_replace(COALESCE(c.clientPhoneNumber,''), '\\D', '', 'g') LIKE :tail OR regexp_replace(COALESCE(c.externalId,''), '\\D', '', 'g') LIKE :tail)",
        { tail: `%${digits.slice(-9)}` },
      )
      .orderBy("m.createdAt", "DESC")
      .getOne();
    if (!row) return [];
    return [
      {
        key: { remoteJid: jid, id: row.externalMessageId, fromMe: row.role !== MessageRole.USER },
        messageTimestamp: Math.floor(new Date(row.createdAt).getTime() / 1000),
      },
    ];
  }

  async archiveChat(sessionId: string, chat: string, archive = true) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(chat);
    await sock.chatModify({ archive, lastMessages: await this.lastMessageStub(sessionId, jid) }, jid);
    return { ok: true, chat: jid, archived: archive };
  }

  async pinChat(sessionId: string, chat: string, pin = true) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(chat);
    await sock.chatModify({ pin }, jid);
    return { ok: true, chat: jid, pinned: pin };
  }

  async markChatUnread(sessionId: string, chat: string, unread = true) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(chat);
    await sock.chatModify({ markRead: !unread, lastMessages: await this.lastMessageStub(sessionId, jid) }, jid);
    return { ok: true, chat: jid, unread };
  }

  async muteChat(sessionId: string, chat: string, hours?: number) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(chat);
    const mute = hours && hours > 0 ? Date.now() + hours * 3600 * 1000 : null;
    await sock.chatModify({ mute }, jid);
    return { ok: true, chat: jid, mutedUntil: mute ? new Date(mute).toISOString() : null };
  }

  async listLabels(sessionId: string) {
    return this.labelRepository.find({ where: { sessionId, deleted: false }, order: { name: "ASC" } });
  }

  async createLabel(sessionId: string, input: { name: string; color?: number }) {
    const sock = this.sock(sessionId);
    const labelId = String(Date.now() % 1_000_000_000);
    await sock.addLabel(undefined, { id: labelId, name: input.name, color: input.color ?? 0, deleted: false });
    const label = await this.labelRepository.save(
      this.labelRepository.create({ sessionId, labelId, name: input.name, color: input.color ?? 0, deleted: false }),
    );
    return label;
  }

  async setChatLabel(sessionId: string, chat: string, labelId: string, add = true) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(chat);
    if (add) await sock.addChatLabel(jid, labelId);
    else await sock.removeChatLabel(jid, labelId);
    return { ok: true, chat: jid, labelId, applied: add };
  }

  async setBlock(sessionId: string, contact: string, block = true) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(contact);
    await sock.updateBlockStatus(jid, block ? "block" : "unblock");
    return { ok: true, contact: jid, blocked: block };
  }

  async blocklist(sessionId: string): Promise<string[]> {
    const sock = this.sock(sessionId);
    return (await sock.fetchBlocklist()) || [];
  }

  // ---------------------------------------------------------------------------
  // Profile & presence
  // ---------------------------------------------------------------------------

  async getProfile(sessionId: string) {
    const sock = this.sock(sessionId);
    const me = sock.user?.id ? sock.user.id : null;
    let about: any = null;
    let pictureUrl: string | null = null;
    try {
      about = me ? await sock.fetchStatus(me) : null;
    } catch {}
    try {
      pictureUrl = me ? await sock.profilePictureUrl(me, "image") : null;
    } catch {}
    const aboutText = Array.isArray(about) ? about[0]?.status?.status ?? about[0]?.status : about?.status;
    return { jid: me, name: sock.user?.name || null, about: aboutText || null, pictureUrl };
  }

  async updateProfile(sessionId: string, input: { name?: string; about?: string; pictureUrl?: string; removePicture?: boolean }) {
    const sock = this.sock(sessionId);
    const done: string[] = [];
    if (input.name) {
      await sock.updateProfileName(input.name);
      done.push("name");
    }
    if (input.about !== undefined) {
      await sock.updateProfileStatus(input.about);
      done.push("about");
    }
    if (input.removePicture) {
      await sock.removeProfilePicture(sock.user?.id);
      done.push("picture-removed");
    } else if (input.pictureUrl) {
      const { buffer } = await this.fetchMedia(input.pictureUrl);
      await sock.updateProfilePicture(sock.user?.id, buffer);
      done.push("picture");
    }
    return { ok: true, updated: done };
  }

  async subscribePresence(sessionId: string, contact: string) {
    const sock = this.sock(sessionId);
    const jid = this.toJid(contact);
    await sock.presenceSubscribe(jid);
    return { ok: true, contact: jid };
  }

  async getPresence(sessionId: string, contact: string): Promise<PresenceInfo | null> {
    const jid = this.toJid(contact);
    const raw = await this.redis.get(`wa:presence:${sessionId}:${jid}`);
    if (!raw) {
      // Ask WhatsApp to start reporting; the answer lands asynchronously.
      try {
        await this.subscribePresence(sessionId, contact);
      } catch {}
      return null;
    }
    return JSON.parse(raw);
  }

  @OnEvent("whatsapp.presence.update")
  async handlePresenceUpdate(payload: { sessionId: string; id: string; presences: Record<string, any> }) {
    try {
      const session = await this.sessionRepository.findOne({ where: { id: payload.sessionId }, select: ["id", "automation"] });
      if (!session?.automation?.presenceTracking) return;
      for (const [jid, p] of Object.entries(payload.presences || {})) {
        const info: PresenceInfo = {
          jid,
          presence: (p as any)?.lastKnownPresence || "unavailable",
          lastSeenAt: (p as any)?.lastSeen ? new Date((p as any).lastSeen * 1000).toISOString() : undefined,
          observedAt: new Date().toISOString(),
        };
        await this.redis.set(`wa:presence:${payload.sessionId}:${jid}`, JSON.stringify(info), "EX", PRESENCE_TTL_SECONDS);
      }
    } catch (error) {
      this.logger.debug?.(`presence update ignored: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Calls
  // ---------------------------------------------------------------------------

  @OnEvent("whatsapp.call")
  async handleCall(payload: { sessionId: string; calls: any[] }) {
    try {
      const session = await this.sessionRepository.findOne({ where: { id: payload.sessionId }, select: ["id", "name", "automation"] });
      if (!session?.automation?.rejectCalls) return;
      const sock = this.baileysService.getSessionSocket(payload.sessionId);
      if (!sock) return;
      for (const call of payload.calls || []) {
        if (call.status !== "offer") continue;
        try {
          await sock.rejectCall(call.id, call.from);
          this.logger.log(`📵 Rejected ${call.isVideo ? "video" : "voice"} call from ${call.from} on ${session.name}`);
        } catch (error) {
          this.logger.warn(`Could not reject call ${call.id}: ${error.message}`);
          continue;
        }
        const text = String(session.automation.rejectCallsMessage || "").trim();
        if (!text) continue;
        const onceKey = `wa:callnotice:${payload.sessionId}:${call.from}`;
        const first = await this.redis.set(onceKey, "1", "EX", CALL_NOTICE_TTL_SECONDS, "NX");
        if (first !== "OK") continue;
        try {
          await sock.sendMessage(call.from, { text });
        } catch (error) {
          this.logger.warn(`Could not send call notice to ${call.from}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`call handling failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Labels sync, deletions/edits, poll votes (events from Baileys)
  // ---------------------------------------------------------------------------

  @OnEvent("whatsapp.labels.edit")
  async handleLabelEdit(payload: { sessionId: string; label: any }) {
    const l = payload.label || {};
    if (!l.id) return;
    try {
      const existing = await this.labelRepository.findOne({ where: { sessionId: payload.sessionId, labelId: String(l.id) } });
      const data = { name: l.name || existing?.name || `Label ${l.id}`, color: l.color ?? existing?.color ?? null, predefinedId: l.predefinedId ?? null, deleted: !!l.deleted };
      if (existing) await this.labelRepository.update(existing.id, data);
      else await this.labelRepository.save(this.labelRepository.create({ sessionId: payload.sessionId, labelId: String(l.id), ...data }));
    } catch (error) {
      this.logger.debug?.(`label sync failed: ${error.message}`);
    }
  }

  @OnEvent("whatsapp.message.revoked")
  async handleRevoked(payload: { sessionId: string; chat: string; messageId: string; byMe: boolean }) {
    await this.messageRepository
      .createQueryBuilder()
      .update(AgentMessage)
      .set({ metadata: () => `metadata || '{"deleted":true,"deletedBy":"${payload.byMe ? "us" : "contact"}"}'::jsonb` })
      .where("externalMessageId = :id", { id: payload.messageId })
      .execute()
      .catch(() => undefined);
    this.eventEmitter.emit("whatsapp.ui.message.update", { sessionId: payload.sessionId, chat: payload.chat, messageId: payload.messageId, deleted: true });
  }

  @OnEvent("whatsapp.message.edited")
  async handleEdited(payload: { sessionId: string; chat: string; messageId: string; text: string; byMe: boolean }) {
    await this.messageRepository
      .createQueryBuilder()
      .update(AgentMessage)
      .set({ content: payload.text, metadata: () => `metadata || '{"edited":true}'::jsonb` })
      .where("externalMessageId = :id", { id: payload.messageId })
      .execute()
      .catch(() => undefined);
    this.eventEmitter.emit("whatsapp.ui.message.update", { sessionId: payload.sessionId, chat: payload.chat, messageId: payload.messageId, edited: true, text: payload.text });
  }

  @OnEvent("whatsapp.poll.update")
  async handlePollUpdate(payload: { sessionId: string; messageId: string; pollUpdates: any[] }) {
    try {
      const poll = await this.pollRepository.findOne({ where: { sessionId: payload.sessionId, messageId: payload.messageId } });
      if (!poll?.pollMessage) return;
      const baileys: any = await import("@whiskeysockets/baileys");
      const aggregate = baileys.getAggregateVotesInPollMessage({ message: poll.pollMessage.message, pollUpdates: payload.pollUpdates });
      const votes: Record<string, string[]> = {};
      const voters = new Set<string>();
      for (const entry of aggregate || []) {
        votes[entry.name] = entry.voters || [];
        (entry.voters || []).forEach((v: string) => voters.add(v));
      }
      await this.pollRepository.update(poll.id, { votes, voterCount: voters.size });
      this.eventEmitter.emit("whatsapp.ui.poll.update", { sessionId: payload.sessionId, pollId: poll.id, votes, voterCount: voters.size });
    } catch (error) {
      this.logger.debug?.(`poll update failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  private groupJid(id: string): string {
    const jid = this.toJid(id);
    if (!jid.endsWith("@g.us")) throw new BadRequestException("Identifiant de groupe invalide");
    return jid;
  }

  private summarizeGroup(meta: any) {
    return {
      id: meta.id,
      subject: meta.subject,
      description: meta.desc || null,
      owner: meta.owner || null,
      size: meta.size ?? meta.participants?.length ?? 0,
      createdAt: meta.creation ? new Date(meta.creation * 1000).toISOString() : null,
      announcementOnly: !!meta.announce,
      locked: !!meta.restrict,
      joinApproval: !!meta.joinApprovalMode,
      disappearingSeconds: meta.ephemeralDuration || 0,
      participants: (meta.participants || []).map((p: any) => ({ id: p.id, admin: p.admin || null })),
    };
  }

  async listGroups(sessionId: string) {
    const sock = this.sock(sessionId);
    const all = await sock.groupFetchAllParticipating();
    return Object.values(all || {}).map((g: any) => this.summarizeGroup(g));
  }

  async getGroup(sessionId: string, groupId: string) {
    const sock = this.sock(sessionId);
    return this.summarizeGroup(await sock.groupMetadata(this.groupJid(groupId)));
  }

  async createGroup(sessionId: string, input: { subject: string; participants: string[]; description?: string }) {
    const sock = this.sock(sessionId);
    const meta = await sock.groupCreate(input.subject, this.toJids(input.participants));
    if (input.description) {
      await sock.groupUpdateDescription(meta.id, input.description).catch(() => undefined);
    }
    return this.summarizeGroup(await sock.groupMetadata(meta.id));
  }

  async updateGroup(sessionId: string, groupId: string, input: { subject?: string; description?: string; pictureUrl?: string; announcementOnly?: boolean; locked?: boolean; joinApproval?: boolean; disappearingSeconds?: number }) {
    const sock = this.sock(sessionId);
    const jid = this.groupJid(groupId);
    const done: string[] = [];
    if (input.subject) { await sock.groupUpdateSubject(jid, input.subject); done.push("subject"); }
    if (input.description !== undefined) { await sock.groupUpdateDescription(jid, input.description || undefined); done.push("description"); }
    if (input.pictureUrl) { const { buffer } = await this.fetchMedia(input.pictureUrl); await sock.updateProfilePicture(jid, buffer); done.push("picture"); }
    if (input.announcementOnly !== undefined) { await sock.groupSettingUpdate(jid, input.announcementOnly ? "announcement" : "not_announcement"); done.push("announcementOnly"); }
    if (input.locked !== undefined) { await sock.groupSettingUpdate(jid, input.locked ? "locked" : "unlocked"); done.push("locked"); }
    if (input.joinApproval !== undefined) { await sock.groupJoinApprovalMode(jid, input.joinApproval ? "on" : "off"); done.push("joinApproval"); }
    if (input.disappearingSeconds !== undefined) { await sock.groupToggleEphemeral(jid, input.disappearingSeconds); done.push("disappearing"); }
    return { ok: true, updated: done, group: this.summarizeGroup(await sock.groupMetadata(jid)) };
  }

  async updateGroupParticipants(sessionId: string, groupId: string, input: { participants: string[]; action: "add" | "remove" | "promote" | "demote" }) {
    const sock = this.sock(sessionId);
    const result = await sock.groupParticipantsUpdate(this.groupJid(groupId), this.toJids(input.participants), input.action);
    return { action: input.action, results: (result || []).map((r: any) => ({ jid: r.jid, status: r.status })) };
  }

  async getGroupInvite(sessionId: string, groupId: string, revoke = false) {
    const sock = this.sock(sessionId);
    const jid = this.groupJid(groupId);
    const code = revoke ? await sock.groupRevokeInvite(jid) : await sock.groupInviteCode(jid);
    return { code, link: `https://chat.whatsapp.com/${code}` };
  }

  async joinGroup(sessionId: string, invite: string) {
    const sock = this.sock(sessionId);
    const code = invite.replace(/^https?:\/\/chat\.whatsapp\.com\//i, "").trim();
    const info = await sock.groupGetInviteInfo(code).catch(() => null);
    const id = await sock.groupAcceptInvite(code);
    return { id, subject: info?.subject || null };
  }

  async leaveGroup(sessionId: string, groupId: string) {
    const sock = this.sock(sessionId);
    await sock.groupLeave(this.groupJid(groupId));
    return { ok: true };
  }

  async listJoinRequests(sessionId: string, groupId: string) {
    const sock = this.sock(sessionId);
    return (await sock.groupRequestParticipantsList(this.groupJid(groupId))) || [];
  }

  async handleJoinRequests(sessionId: string, groupId: string, input: { participants: string[]; action: "approve" | "reject" }) {
    const sock = this.sock(sessionId);
    const result = await sock.groupRequestParticipantsUpdate(this.groupJid(groupId), this.toJids(input.participants), input.action);
    return { action: input.action, results: result || [] };
  }

  async sendToGroup(sessionId: string, groupId: string, content: PublishContent) {
    const sock = this.sock(sessionId);
    const jid = this.groupJid(groupId);
    const sent = await sock.sendMessage(jid, await this.buildContent(content));
    return { messageId: sent?.key?.id, group: jid };
  }

  // ---------------------------------------------------------------------------
  // Channels (newsletters)
  // ---------------------------------------------------------------------------

  private channelJid(id: string): string {
    const raw = String(id || "").trim();
    const jid = raw.includes("@") ? raw : `${raw.replace(/\D/g, "")}@newsletter`;
    if (!jid.endsWith("@newsletter")) throw new BadRequestException("Identifiant de chaîne invalide");
    return jid;
  }

  private summarizeChannel(meta: any) {
    const t = meta?.thread_metadata || meta?.threadMetadata || meta || {};
    return {
      id: meta?.id || t.id || null,
      name: t.name?.text ?? t.name ?? null,
      description: t.description?.text ?? t.description ?? null,
      subscribers: Number(t.subscribers_count ?? t.subscribersCount ?? 0),
      inviteCode: t.invite || null,
      inviteLink: t.invite ? `https://whatsapp.com/channel/${t.invite}` : null,
      pictureUrl: t.picture?.direct_path ? `https://mmg.whatsapp.net${t.picture.direct_path}` : null,
      verified: t.verification === "verified",
      createdAt: t.creation_time ? new Date(Number(t.creation_time) * 1000).toISOString() : null,
      role: meta?.viewer_metadata?.role || meta?.viewerMetadata?.role || null,
    };
  }

  /** Channels this session is known to own, follow or have published on. */
  private channelsKey(sessionId: string) {
    return `wa:channels:${sessionId}`;
  }

  async rememberChannels(sessionId: string, jids: string[]): Promise<void> {
    const clean = (jids || []).map((j) => String(j || "").trim()).filter((j) => j.endsWith("@newsletter"));
    if (!clean.length) return;
    try {
      await this.redis.sadd(this.channelsKey(sessionId), ...clean);
    } catch (error) {
      this.logger.debug?.(`channel registry write failed: ${error.message}`);
    }
  }

  async forgetChannel(sessionId: string, jid: string): Promise<void> {
    try {
      await this.redis.srem(this.channelsKey(sessionId), jid);
    } catch {}
  }

  /**
   * WhatsApp has no "list my channels" query, so the list is what the session
   * has touched: channels it created or published on, looked up, or that
   * showed up in its chat sync. Metadata is refreshed live, a few at a time.
   */
  async listChannels(sessionId: string) {
    const sock = this.sock(sessionId);
    let jids: string[] = [];
    try {
      jids = await this.redis.smembers(this.channelsKey(sessionId));
    } catch {}
    jids = jids.filter((j) => j.endsWith("@newsletter")).slice(0, 50);
    const out: any[] = [];
    for (let i = 0; i < jids.length; i += 3) {
      const wave = jids.slice(i, i + 3);
      const results = await Promise.all(
        wave.map(async (jid) => {
          try {
            return this.summarizeChannel(await sock.newsletterMetadata("jid", jid));
          } catch (error) {
            return { id: jid, error: error.message || "metadata unavailable" };
          }
        }),
      );
      out.push(...results);
    }
    return out;
  }

  @OnEvent("whatsapp.channels.seen")
  async handleChannelsSeen(payload: { sessionId: string; jids: string[] }) {
    await this.rememberChannels(payload.sessionId, payload.jids || []);
  }

  async createChannel(sessionId: string, input: { name: string; description?: string }) {
    const sock = this.sock(sessionId);
    return this.createChannelRaw(sock, sessionId, input);
  }

  /**
   * The creation mutation sent by hand. Baileys' newsletterCreate() only sends
   * name + description and WhatsApp answers that with a null payload (which
   * Baileys then crashes on); the fuller input WhatsApp Web uses — picture and
   * reaction settings — is accepted. Verified on 2026-10-18.
   */
  private async createChannelRaw(sock: any, sessionId: string, input: { name: string; description?: string }) {
    const baileys: any = await import("@whiskeysockets/baileys");
    const queryId = baileys.QueryIds?.CREATE || "8823471724422422";
    const variables = {
      input: {
        name: input.name,
        description: input.description ?? null,
        picture: null,
        settings: { reaction_codes: { value: "ALL" } },
      },
    };
    let raw: any = null;
    try {
      const node = await sock.query({
        tag: "iq",
        attrs: { id: sock.generateMessageTag?.() || `${Date.now()}`, type: "get", to: "@s.whatsapp.net", xmlns: "w:mex" },
        content: [{ tag: "query", attrs: { query_id: queryId }, content: Buffer.from(JSON.stringify({ variables }), "utf-8") }],
      });
      const child = baileys.getBinaryNodeChild?.(node, "result");
      raw = child?.content ? JSON.parse(child.content.toString()) : node;
    } catch (error) {
      raw = { transportError: error.message };
    }
    this.logger.log(`📣 Channel creation answer on ${sessionId}: ${JSON.stringify(raw).slice(0, 600)}`);

    const created = raw?.data?.xwa2_newsletter_create;
    if (created?.id) {
      await this.rememberChannels(sessionId, [created.id]);
      return this.summarizeChannel(created);
    }
    const serverMessage = raw?.errors?.map((e: any) => e.message).join(", ") || raw?.transportError || null;
    throw new BadRequestException(
      "WhatsApp n'a pas autorisé la création de chaîne depuis cet appareil lié" +
        (serverMessage ? ` (${serverMessage})` : "") +
        ". Créez la chaîne depuis l'application WhatsApp du téléphone (Actus → Chaînes → +), puis utilisez son lien d'invitation ou son identifiant : la publication, la mise à jour et le suivi fonctionnent normalement par l'API.",
    );
  }

  async getChannel(sessionId: string, idOrInvite: string) {
    const sock = this.sock(sessionId);
    const raw = String(idOrInvite || "").trim();
    const isInvite = /whatsapp\.com\/channel\//i.test(raw) || !/^\d+(@newsletter)?$/.test(raw);
    const key = isInvite ? raw.replace(/^https?:\/\/(www\.)?whatsapp\.com\/channel\//i, "") : this.channelJid(raw);
    let meta: any;
    try {
      meta = await sock.newsletterMetadata(isInvite ? "invite" : "jid", key);
    } catch (error) {
      // WhatsApp answers "Bad Request" for an id it does not know; that is the
      // caller's input, not a server fault.
      throw new BadRequestException(`Chaîne introuvable ou identifiant invalide : ${raw} (${error.message})`);
    }
    const summary = this.summarizeChannel(meta);
    if (summary.id) await this.rememberChannels(sessionId, [summary.id]);
    return summary;
  }

  async updateChannel(sessionId: string, channelId: string, input: { name?: string; description?: string; pictureUrl?: string; removePicture?: boolean }) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    const done: string[] = [];
    if (input.name) { await sock.newsletterUpdateName(jid, input.name); done.push("name"); }
    if (input.description !== undefined) { await sock.newsletterUpdateDescription(jid, input.description || ""); done.push("description"); }
    if (input.removePicture) { await sock.newsletterRemovePicture(jid); done.push("picture-removed"); }
    else if (input.pictureUrl) { const { buffer } = await this.fetchMedia(input.pictureUrl); await sock.newsletterUpdatePicture(jid, buffer); done.push("picture"); }
    return { ok: true, updated: done };
  }

  async publishToChannel(sessionId: string, channelId: string, content: PublishContent) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    const sent = await sock.sendMessage(jid, await this.buildContent(content));
    await this.rememberChannels(sessionId, [jid]);
    this.logger.log(`📣 Published to channel ${jid} on session ${sessionId}`);
    return { messageId: sent?.key?.id, serverId: sent?.newsletterServerId ?? sent?.key?.server_id ?? null, channel: jid };
  }

  async channelMessages(sessionId: string, channelId: string, count = 20) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    const result = await sock.newsletterFetchMessages("jid", jid, Math.min(Math.max(count, 1), 100), 0, 0).catch((e: any) => {
      throw new BadRequestException(`Historique indisponible : ${e.message}`);
    });
    return result;
  }

  async followChannel(sessionId: string, channelId: string, follow = true) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    if (follow) await sock.newsletterFollow(jid);
    else await sock.newsletterUnfollow(jid);
    return { ok: true, channel: jid, following: follow };
  }

  async deleteChannel(sessionId: string, channelId: string) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    await sock.newsletterDelete(jid);
    await this.forgetChannel(sessionId, jid);
    return { ok: true };
  }

  // ---- channel administrators -------------------------------------------------

  /** Admin count and our own role (WhatsApp exposes no per-admin listing). */
  async channelAdmins(sessionId: string, channelId: string) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    const meta = await sock.newsletterMetadata("jid", jid).catch((e: any) => {
      throw new BadRequestException(`Chaîne introuvable : ${e.message}`);
    });
    const summary = this.summarizeChannel(meta);
    const adminCount = await sock.newsletterAdminCount(jid).catch(() => null);
    return {
      channel: jid,
      name: summary.name,
      role: summary.role,
      adminCount: typeof adminCount === "number" ? adminCount : null,
      maxAdmins: CHANNEL_MAX_ADMINS,
      canManage: summary.role === "OWNER",
    };
  }

  private channelUserJid(target: string): string {
    const jid = this.toJid(target);
    if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) {
      throw new BadRequestException(`Un administrateur de chaîne doit être un numéro WhatsApp : ${target}`);
    }
    return jid;
  }

  private async requireChannelOwner(sock: any, jid: string) {
    const meta = await sock.newsletterMetadata("jid", jid).catch((e: any) => {
      throw new BadRequestException(`Chaîne introuvable : ${e.message}`);
    });
    const summary = this.summarizeChannel(meta);
    if (summary.role && summary.role !== "OWNER") {
      throw new BadRequestException(`Seul le propriétaire de la chaîne peut gérer ses administrateurs (rôle actuel : ${summary.role})`);
    }
    return summary;
  }

  /**
   * WhatsApp has no "promote" for channels: the owner sends an admin
   * invitation (a private message card) and the invitee accepts it on their
   * phone within 7 days. Nothing changes on the channel until they accept.
   */
  async inviteChannelAdmin(sessionId: string, channelId: string, input: { phone: string; message?: string }) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    const summary = await this.requireChannelOwner(sock, jid);
    const invitee = this.channelUserJid(input.phone);
    const expiresAt = Math.floor(Date.now() / 1000) + CHANNEL_ADMIN_INVITE_TTL_SECONDS;
    const name = summary.name || jid.split("@")[0];
    const caption = (input.message || "").trim() || `Vous êtes invité(e) à devenir administrateur de la chaîne « ${name} ».`;
    const baileys: any = await import("@whiskeysockets/baileys");
    const messageId: string = baileys.generateMessageIDV2(sock.user?.id);
    await sock.relayMessage(
      invitee,
      {
        newsletterAdminInviteMessage: {
          newsletterJid: jid,
          newsletterName: name,
          caption,
          inviteExpiration: expiresAt,
        },
      },
      { messageId },
    );
    this.logger.log(`👑 Channel admin invitation for ${jid} sent to ${invitee} on session ${sessionId}`);
    return { ok: true, channel: jid, invitee, messageId, expiresAt: new Date(expiresAt * 1000).toISOString(), pending: true };
  }

  async demoteChannelAdmin(sessionId: string, channelId: string, phone: string) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    await this.requireChannelOwner(sock, jid);
    const user = this.channelUserJid(phone);
    await sock.newsletterDemote(jid, user).catch((e: any) => {
      throw new BadRequestException(`Rétrogradation refusée par WhatsApp : ${e.message}`);
    });
    return { ok: true, channel: jid, user, demoted: true };
  }

  /** Hands the channel over; the current owner stays admin, WhatsApp side. */
  async transferChannelOwnership(sessionId: string, channelId: string, phone: string) {
    const sock = this.sock(sessionId);
    const jid = this.channelJid(channelId);
    await this.requireChannelOwner(sock, jid);
    const user = this.channelUserJid(phone);
    await sock.newsletterChangeOwner(jid, user).catch((e: any) => {
      throw new BadRequestException(`Transfert refusé par WhatsApp (le nouveau propriétaire doit déjà être administrateur) : ${e.message}`);
    });
    this.logger.warn(`👑 Channel ${jid} ownership transferred to ${user} on session ${sessionId}`);
    return { ok: true, channel: jid, newOwner: user };
  }

  // ---------------------------------------------------------------------------
  // Statuses
  // ---------------------------------------------------------------------------

  async resolveStatusAudience(sessionId: string, organizationId: string | null, audience: StatusAudience): Promise<string[]> {
    if (audience.type === "jids") {
      return this.toJids(audience.jids || []);
    }
    if (audience.type === "contacts") {
      const rows = await this.contactRepository.find({
        where: { sessionId, isGroup: false },
        select: ["phoneNumber", "lid"],
      });
      return [...new Set(rows.map((c) => (c.phoneNumber?.startsWith("lid_") ? `${c.lid || c.phoneNumber.slice(4)}@lid` : this.toJid(c.phoneNumber))))];
    }
    if (!organizationId) throw new BadRequestException("Audience opt-in indisponible sans organisation");
    const qb = this.broadcastContactRepository
      .createQueryBuilder("c")
      .select(["c.phoneNumber", "c.customFields"])
      .where("c.organizationId = :organizationId", { organizationId })
      .andWhere("c.isSubscribed = true");
    if (audience.tags?.length) {
      // tags is a comma-separated text column (TypeORM simple-array)
      qb.andWhere(audience.tags.map((_, i) => `c.tags LIKE :tag${i}`).join(" OR "), Object.fromEntries(audience.tags.map((t, i) => [`tag${i}`, `%${t}%`])));
    }
    const rows = await qb.getMany();
    return [...new Set(rows.map((c) => this.toJid(c.phoneNumber)))];
  }

  async publishStatus(sessionId: string, organizationId: string | null, content: PublishContent, audience: StatusAudience) {
    const sock = this.sock(sessionId);
    const jids = await this.resolveStatusAudience(sessionId, organizationId, audience);
    if (!jids.length) throw new BadRequestException("Audience vide : personne ne verrait ce statut");

    const base = await this.buildContent(content);
    if (base.text && content.backgroundColor) base.backgroundColor = content.backgroundColor;
    if (base.text && content.font !== undefined) base.font = content.font;

    const batches: string[][] = [];
    for (let i = 0; i < jids.length; i += STATUS_BATCH) batches.push(jids.slice(i, i + STATUS_BATCH));

    const posted: string[] = [];
    for (const batch of batches) {
      const sent = await sock.sendMessage("status@broadcast", base, { statusJidList: batch });
      posted.push(sent?.key?.id);
      if (batches.length > 1) await new Promise((r) => setTimeout(r, 1500));
    }
    this.logger.log(`📸 Status published on ${sessionId} to ${jids.length} viewer(s) in ${batches.length} batch(es)`);
    return { messageIds: posted, viewers: jids.length, batches: batches.length };
  }
}
