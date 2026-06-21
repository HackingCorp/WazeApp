import { Injectable } from "@nestjs/common";
import { LeadStatus } from "@/common/enums";

export interface LeadSignals {
  budget?: boolean | string;
  authority?: boolean;
  need?: boolean;
  timeline?: string;
  existingCustomer?: boolean;
  explicitInterest?: boolean;
  engagementScore?: number; // 0-100, derived from conversation activity
  [key: string]: any;
}

/**
 * Turns qualification signals into a 0-100 score and a lead tier.
 *
 * Weighting (BANT-lite + engagement + explicit intent):
 *   explicit interest .. 25
 *   need identified .... 20
 *   budget mentioned ... 15
 *   timeline/urgency ... 15
 *   decision authority . 10
 *   engagement ......... up to 15
 *
 * Tier thresholds: hot >= 70, warm >= 40, cold >= 15, otherwise new.
 * An existing customer always maps to the `customer` tier regardless of score.
 */
@Injectable()
export class LeadScoringService {
  computeScore(signals: LeadSignals): number {
    let score = 0;
    if (signals.explicitInterest) score += 25;
    if (signals.need) score += 20;
    if (signals.budget) score += 15;
    if (signals.timeline) score += 15;
    if (signals.authority) score += 10;

    const engagement = Math.max(0, Math.min(100, signals.engagementScore ?? 0));
    score += Math.round((engagement / 100) * 15);

    return Math.max(0, Math.min(100, score));
  }

  tierFromScore(score: number, signals: LeadSignals): LeadStatus {
    if (signals.existingCustomer) return LeadStatus.CUSTOMER;
    if (score >= 70) return LeadStatus.HOT;
    if (score >= 40) return LeadStatus.WARM;
    if (score >= 15) return LeadStatus.COLD;
    return LeadStatus.NEW;
  }

  /**
   * Derive an engagement score (0-100) from conversation activity metrics.
   * More user messages and a longer exchange signal higher engagement.
   */
  engagementFromMetrics(metrics: {
    userMessageCount?: number;
    messageCount?: number;
  }): number {
    const userMsgs = metrics.userMessageCount ?? 0;
    // 6+ user messages = full engagement; scales linearly below that.
    return Math.max(0, Math.min(100, Math.round((userMsgs / 6) * 100)));
  }
}
