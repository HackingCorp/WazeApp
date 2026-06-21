import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Lead, Order, AgentConversation } from "@/common/entities";
import { LeadStatus, LeadSource } from "@/common/enums";
import { LeadScoringService, LeadSignals } from "./lead-scoring.service";

export interface UpsertLeadInput {
  organizationId: string;
  agentId?: string;
  conversationId?: string;
  clientPhoneNumber: string;
  clientName?: string;
  clientEmail?: string;
  interest?: string;
  needSummary?: string;
  signals?: LeadSignals;
  source?: LeadSource;
  // Engagement metrics from the conversation (used to refine the score).
  engagementMetrics?: { userMessageCount?: number; messageCount?: number };
  tags?: string[];
}

const TIER_RANK: Record<string, number> = {
  cold: 0,
  warm: 1,
  hot: 2,
};

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    private readonly scoring: LeadScoringService,
  ) {}

  /**
   * Create or update a lead from an AI capture. Keyed by (organization, phone).
   * Merges new info into the existing lead, recomputes score/tier, and flags
   * existing customers by checking the orders table.
   */
  async upsertFromAI(input: UpsertLeadInput): Promise<Lead> {
    const phone = (input.clientPhoneNumber || "").replace(/\D/g, "");
    if (!phone) {
      throw new Error("clientPhoneNumber is required to capture a lead");
    }

    let lead = await this.leadRepository.findOne({
      where: { organizationId: input.organizationId, clientPhoneNumber: phone },
    });
    const isNew = !lead;
    if (!lead) {
      lead = this.leadRepository.create({
        organizationId: input.organizationId,
        clientPhoneNumber: phone,
        source: input.source || LeadSource.WHATSAPP_AI,
        signals: {},
        tags: [],
        metadata: {},
      });
    }

    // Merge scalar fields (only overwrite when a new value is provided)
    if (input.agentId) lead.agentId = input.agentId;
    if (input.conversationId) lead.conversationId = input.conversationId;
    if (input.clientName) lead.clientName = input.clientName;
    if (input.clientEmail) lead.clientEmail = input.clientEmail;
    if (input.interest) lead.interest = input.interest;
    if (input.needSummary) lead.needSummary = input.needSummary;
    if (input.tags?.length) {
      lead.tags = Array.from(new Set([...(lead.tags || []), ...input.tags]));
    }

    // Merge signals
    const mergedSignals: LeadSignals = { ...(lead.signals || {}), ...(input.signals || {}) };

    // Existing-customer detection: any order on this phone within the org.
    try {
      const orderCount = await this.orderRepository.count({
        where: { organizationId: input.organizationId, clientPhoneNumber: phone },
      });
      if (orderCount > 0) mergedSignals.existingCustomer = true;
    } catch (e) {
      this.logger.warn(`Existing-customer check failed: ${e.message}`);
    }

    // Refine engagement from conversation metrics. Use the provided metrics, or
    // load them from the linked conversation (hybrid re-qualification on each capture).
    let engagementMetrics = input.engagementMetrics;
    if (!engagementMetrics && (input.conversationId || lead.conversationId)) {
      try {
        const conv = await this.conversationRepository.findOne({
          where: { id: input.conversationId || lead.conversationId },
          select: ["id", "metrics"],
        });
        if (conv?.metrics) engagementMetrics = conv.metrics as any;
      } catch (e) {
        this.logger.warn(`Could not load conversation metrics for engagement: ${e.message}`);
      }
    }
    if (engagementMetrics) {
      mergedSignals.engagementScore = Math.max(
        mergedSignals.engagementScore ?? 0,
        this.scoring.engagementFromMetrics(engagementMetrics),
      );
    }

    lead.signals = mergedSignals;
    lead.score = this.scoring.computeScore(mergedSignals);
    lead.status = this.scoring.tierFromScore(lead.score, mergedSignals);
    lead.lastInteractionAt = new Date();

    const saved = await this.leadRepository.save(lead);
    this.logger.log(
      `${isNew ? "Created" : "Updated"} lead ${saved.id} (${phone}) — tier=${saved.status} score=${saved.score}`,
    );
    return saved;
  }

  async findAll(
    organizationId: string,
    query: {
      status?: LeadStatus;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { status, search, dateFrom, dateTo, page = 1, limit = 20 } = query;

    const qb = this.leadRepository
      .createQueryBuilder("lead")
      .where("lead.organizationId = :organizationId", { organizationId });

    if (status) qb.andWhere("lead.status = :status", { status });
    if (search) {
      qb.andWhere(
        "(lead.clientName ILIKE :search OR lead.clientPhoneNumber ILIKE :search OR lead.interest ILIKE :search)",
        { search: `%${search}%` },
      );
    }
    if (dateFrom) qb.andWhere("lead.createdAt >= :dateFrom", { dateFrom });
    if (dateTo) qb.andWhere("lead.createdAt <= :dateTo", { dateTo: `${dateTo}T23:59:59` });

    // Sort by score desc then most recent.
    qb.orderBy("lead.score", "DESC").addOrderBy("lead.lastInteractionAt", "DESC");

    const total = await qb.getCount();
    const leads = await qb.skip((page - 1) * limit).take(limit).getMany();

    return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, organizationId: string) {
    const lead = await this.leadRepository.findOne({ where: { id, organizationId } });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async getStats(organizationId: string) {
    const [total, cold, warm, hot, customer, lost] = await Promise.all([
      this.leadRepository.count({ where: { organizationId } }),
      this.leadRepository.count({ where: { organizationId, status: LeadStatus.COLD } }),
      this.leadRepository.count({ where: { organizationId, status: LeadStatus.WARM } }),
      this.leadRepository.count({ where: { organizationId, status: LeadStatus.HOT } }),
      this.leadRepository.count({ where: { organizationId, status: LeadStatus.CUSTOMER } }),
      this.leadRepository.count({ where: { organizationId, status: LeadStatus.LOST } }),
    ]);
    return { total, cold, warm, hot, customer, lost };
  }

  async updateStatus(id: string, organizationId: string, status: LeadStatus) {
    const lead = await this.findOne(id, organizationId);
    lead.status = status;
    return this.leadRepository.save(lead);
  }

  async remove(id: string, organizationId: string) {
    const lead = await this.findOne(id, organizationId);
    await this.leadRepository.remove(lead);
    return { success: true };
  }

  /**
   * New (not-yet-reported) leads captured by `agentId` since `since`, at or above
   * `minTier`, highest score first. Used by the periodic report.
   */
  async listNewForReport(
    agentId: string,
    since: Date,
    minTier: "cold" | "warm" | "hot" = "cold",
  ): Promise<Lead[]> {
    const minRank = TIER_RANK[minTier] ?? 0;
    const tiers = Object.entries(TIER_RANK)
      .filter(([, rank]) => rank >= minRank)
      .map(([tier]) => tier) as LeadStatus[];

    const leads = await this.leadRepository
      .createQueryBuilder("lead")
      .where("lead.agentId = :agentId", { agentId })
      .andWhere("lead.createdAt >= :since", { since })
      .andWhere("lead.reportedAt IS NULL")
      .orderBy("lead.score", "DESC")
      .addOrderBy("lead.createdAt", "DESC")
      .getMany();

    return leads.filter((l) => tiers.includes(l.status));
  }

  async markReported(leadIds: string[]): Promise<void> {
    if (!leadIds.length) return;
    await this.leadRepository
      .createQueryBuilder()
      .update(Lead)
      .set({ reportedAt: new Date() })
      .whereInIds(leadIds)
      .execute();
  }
}
