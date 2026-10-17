import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectQueue, Process, Processor } from "@nestjs/bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job, Queue } from "bull";
import { WhatsAppScheduledPost, WhatsAppSession } from "../../common/entities";
import { ScheduledPostAudience, ScheduledPostContent, ScheduledPostKind } from "../../common/entities/whatsapp-scheduled-post.entity";
import { WhatsAppActionsService } from "./whatsapp-actions.service";

export const PUBLISH_QUEUE = "whatsapp-publish";

export interface SchedulePostInput {
  kind: ScheduledPostKind;
  target?: string;
  content: ScheduledPostContent;
  audience?: ScheduledPostAudience;
  scheduledAt: string | Date;
  cron?: string;
}

/**
 * Posts to publish later — on a channel, as a status, in a group or a chat.
 * The row is the source of truth; the Bull job only carries its id, so a
 * cancelled or edited post never publishes stale content.
 */
@Injectable()
export class ScheduledPostService {
  private readonly logger = new Logger(ScheduledPostService.name);

  constructor(
    @InjectRepository(WhatsAppScheduledPost)
    private readonly postRepository: Repository<WhatsAppScheduledPost>,
    @InjectRepository(WhatsAppSession)
    private readonly sessionRepository: Repository<WhatsAppSession>,
    @InjectQueue(PUBLISH_QUEUE)
    private readonly queue: Queue,
    private readonly actions: WhatsAppActionsService,
  ) {}

  private validate(input: SchedulePostInput) {
    if (!input.content?.text && !input.content?.mediaUrl) {
      throw new BadRequestException("Le contenu doit avoir un texte ou un média");
    }
    if (input.kind !== "status" && !input.target) {
      throw new BadRequestException("target est requis pour une chaîne, un groupe ou une conversation");
    }
    if (input.kind === "status" && !input.audience) {
      throw new BadRequestException("audience est requise pour un statut");
    }
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException("scheduledAt invalide");
    }
    if (input.cron && !/^(\S+\s+){4}\S+$/.test(input.cron.trim())) {
      throw new BadRequestException("cron doit avoir 5 champs, ex. \"0 9 * * 1\"");
    }
    return when;
  }

  async schedule(sessionId: string, organizationId: string | null, createdBy: string | null, input: SchedulePostInput) {
    const when = this.validate(input);
    const post = await this.postRepository.save(
      this.postRepository.create({
        sessionId,
        organizationId: organizationId || null,
        createdBy: createdBy || null,
        kind: input.kind,
        target: input.target || null,
        content: input.content,
        audience: input.audience || null,
        scheduledAt: when,
        cron: input.cron || null,
        status: "scheduled",
      }),
    );
    await this.enqueue(post);
    return post;
  }

  private async enqueue(post: WhatsAppScheduledPost) {
    const delay = Math.max(0, new Date(post.scheduledAt).getTime() - Date.now());
    const opts: any = post.cron
      ? { jobId: `post:${post.id}`, repeat: { cron: post.cron, startDate: post.scheduledAt }, removeOnComplete: true }
      : { jobId: `post:${post.id}`, delay, attempts: 2, backoff: 60_000, removeOnComplete: true, removeOnFail: false };
    const job = await this.queue.add("publish", { postId: post.id }, opts);
    await this.postRepository.update(post.id, { jobId: String(job.id) });
  }

  async list(sessionId: string, status?: string) {
    return this.postRepository.find({
      where: status ? { sessionId, status: status as any } : { sessionId },
      order: { scheduledAt: "DESC" },
      take: 200,
    });
  }

  async get(sessionId: string, id: string) {
    const post = await this.postRepository.findOne({ where: { id, sessionId } });
    if (!post) throw new NotFoundException("Publication programmée introuvable");
    return post;
  }

  async cancel(sessionId: string, id: string) {
    const post = await this.get(sessionId, id);
    if (post.status === "done") throw new BadRequestException("Déjà publiée");
    try {
      if (post.cron) {
        await this.queue.removeRepeatable("publish", { cron: post.cron, jobId: `post:${post.id}` });
      } else {
        const job = await this.queue.getJob(`post:${post.id}`);
        if (job) await job.remove();
      }
    } catch (error) {
      this.logger.debug?.(`job cleanup for ${id}: ${error.message}`);
    }
    await this.postRepository.update(id, { status: "cancelled" });
    return { ok: true };
  }

  /** Publish now, from the row. Used by the processor and by "run now" in the UI. */
  async run(postId: string) {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) return { skipped: "missing" };
    if (post.status === "cancelled") return { skipped: "cancelled" };
    if (post.status === "done" && !post.cron) return { skipped: "done" };

    await this.postRepository.update(post.id, { status: "running", lastRunAt: new Date(), error: null });
    try {
      const content = {
        text: post.content.text,
        backgroundColor: post.content.backgroundColor,
        font: post.content.font,
        media: post.content.mediaUrl
          ? { url: post.content.mediaUrl, type: post.content.mediaType || "image", caption: post.content.caption, fileName: post.content.fileName }
          : undefined,
      };
      let result: any;
      switch (post.kind) {
        case "channel":
          result = await this.actions.publishToChannel(post.sessionId, post.target, content);
          break;
        case "status":
          result = await this.actions.publishStatus(post.sessionId, post.organizationId || null, content, post.audience as any);
          break;
        case "group":
          result = await this.actions.sendToGroup(post.sessionId, post.target, content);
          break;
        case "chat": {
          const sock = this.actions["sock"](post.sessionId);
          const jid = this.actions.toJid(post.target);
          const sent = await sock.sendMessage(jid, await this.actions["buildContent"](content));
          result = { messageId: sent?.key?.id, chat: jid };
          break;
        }
      }
      await this.postRepository.update(post.id, { status: post.cron ? "scheduled" : "done", result });
      this.logger.log(`📅 Scheduled ${post.kind} post ${post.id} published`);
      return result;
    } catch (error) {
      await this.postRepository.update(post.id, { status: post.cron ? "scheduled" : "failed", error: error.message });
      this.logger.error(`Scheduled post ${post.id} failed: ${error.message}`);
      throw error;
    }
  }
}

@Processor(PUBLISH_QUEUE)
export class ScheduledPostProcessor {
  private readonly logger = new Logger(ScheduledPostProcessor.name);

  constructor(private readonly posts: ScheduledPostService) {}

  @Process("publish")
  async publish(job: Job<{ postId: string }>) {
    this.logger.log(`Publishing scheduled post ${job.data.postId}`);
    return this.posts.run(job.data.postId);
  }
}
