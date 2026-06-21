import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AiAgent, Lead } from "@/common/entities";
import { LeadStatus } from "@/common/enums";
import { EmailService } from "../../email/email.service";
import { LeadService } from "./lead.service";

const TIER_LABEL: Record<string, string> = {
  hot: "🔥 Chauds",
  warm: "🌤️ Tièdes",
  cold: "❄️ Froids",
  customer: "✅ Clients existants",
  new: "🆕 Nouveaux",
  lost: "🚫 Perdus",
};

const TIER_ORDER: LeadStatus[] = [
  LeadStatus.HOT,
  LeadStatus.WARM,
  LeadStatus.COLD,
  LeadStatus.CUSTOMER,
];

@Injectable()
export class LeadReportService {
  private readonly logger = new Logger(LeadReportService.name);

  constructor(
    @InjectRepository(AiAgent)
    private readonly agentRepository: Repository<AiAgent>,
    private readonly leadService: LeadService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Runs hourly; each agent with reporting enabled fires at its configured hour
   * (daily, or weekly on Mondays).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourly(): Promise<void> {
    let agents: AiAgent[];
    try {
      agents = await this.agentRepository
        .createQueryBuilder("agent")
        .where("agent.leadQualificationConfig->>'reportEnabled' = 'true'")
        .getMany();
    } catch (e) {
      this.logger.warn(`Lead report cron query failed: ${e.message}`);
      return;
    }
    if (!agents.length) return;

    const now = new Date();
    const currentHour = now.getHours();
    const isMonday = now.getDay() === 1;

    for (const agent of agents) {
      const cfg = (agent as any).leadQualificationConfig || {};
      const reportHour = typeof cfg.reportHour === "number" ? cfg.reportHour : 8;
      if (currentHour !== reportHour) continue;

      const frequency = cfg.reportFrequency || "daily";
      if (frequency === "weekly" && !isMonday) continue;

      try {
        await this.sendReportForAgent(agent, frequency);
      } catch (e) {
        this.logger.error(`Lead report failed for agent ${agent.id}: ${e.message}`);
      }
    }
  }

  private async sendReportForAgent(
    agent: AiAgent,
    frequency: "daily" | "weekly",
  ): Promise<void> {
    const cfg = (agent as any).leadQualificationConfig || {};
    const windowMs = frequency === "weekly" ? 7 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
    const since = new Date(Date.now() - windowMs);

    const leads = await this.leadService.listNewForReport(
      agent.id,
      since,
      cfg.minReportTier || "cold",
    );
    if (!leads.length) {
      this.logger.log(`No new leads to report for agent ${agent.id}`);
      return;
    }

    const grouped = this.groupByTier(leads);
    const periodLabel = frequency === "weekly" ? "7 derniers jours" : "dernières 24h";

    // Email
    const emails: string[] = cfg.reportEmails || [];
    for (const email of emails) {
      try {
        await this.emailService.sendLeadReport(email, {
          agentName: agent.name,
          periodLabel,
          total: leads.length,
          grouped,
        });
      } catch (e) {
        this.logger.error(`Failed to email lead report to ${email}: ${e.message}`);
      }
    }

    // WhatsApp (decoupled — the WhatsApp module owns sending)
    if (cfg.reportWhatsAppNumber) {
      this.eventEmitter.emit("lead.report.whatsapp", {
        agentId: agent.id,
        organizationId: agent.organizationId,
        to: cfg.reportWhatsAppNumber,
        message: this.buildWhatsAppText(agent.name, periodLabel, leads.length, grouped),
      });
    }

    await this.leadService.markReported(leads.map((l) => l.id));
    this.logger.log(`📊 Lead report sent for agent ${agent.id} (${leads.length} leads)`);
  }

  private groupByTier(leads: Lead[]): Array<{ tier: LeadStatus; label: string; leads: Lead[] }> {
    return TIER_ORDER.map((tier) => ({
      tier,
      label: TIER_LABEL[tier] || tier,
      leads: leads.filter((l) => l.status === tier),
    })).filter((g) => g.leads.length > 0);
  }

  private buildWhatsAppText(
    agentName: string,
    periodLabel: string,
    total: number,
    grouped: Array<{ label: string; leads: Lead[] }>,
  ): string {
    let msg = `📊 *Rapport leads — ${agentName}*\n_${periodLabel}_ • ${total} nouveau(x) lead(s)\n`;
    for (const g of grouped) {
      msg += `\n*${g.label}* (${g.leads.length})\n`;
      for (const l of g.leads.slice(0, 10)) {
        const who = l.clientName || `+${l.clientPhoneNumber}`;
        const need = l.needSummary || l.interest || "—";
        msg += `• ${who} (${l.score}/100) : ${need}\n`;
      }
      if (g.leads.length > 10) msg += `… +${g.leads.length - 10} autre(s)\n`;
    }
    return msg.trim();
  }
}
