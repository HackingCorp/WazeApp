import { Injectable, Logger } from "@nestjs/common";
import {
  ToolDefinition,
  ToolResult,
  ToolExecutionContext,
  ToolHandler,
} from "../interfaces/tool.interface";
import { LeadService } from "../../leads/services/lead.service";

/**
 * Lets the AI record and qualify a sales lead during a conversation.
 * The model calls `capture_lead` whenever it detects buying intent or
 * collects relevant info; scoring/tiering is computed server-side.
 */
@Injectable()
export class InternalLeadHandler implements ToolHandler {
  private readonly logger = new Logger(InternalLeadHandler.name);

  private readonly toolNames = ["capture_lead"];

  constructor(private readonly leadService: LeadService) {}

  handles(name: string): boolean {
    return this.toolNames.includes(name);
  }

  getToolDefinitions(_context: ToolExecutionContext): ToolDefinition[] {
    return [
      {
        name: "capture_lead",
        description:
          "Record or update a sales lead for the current customer when they show interest in a product/service, " +
          "express a need, ask about pricing/availability, or share contact details. " +
          "Call this silently whenever you learn qualifying information — do not announce it to the customer. " +
          "Provide whatever you have learned; fields are optional and merged with any existing lead.",
        parameters: {
          type: "object",
          properties: {
            clientName: { type: "string", description: "Customer's name if known" },
            clientEmail: { type: "string", description: "Customer's email if shared" },
            interest: {
              type: "string",
              description: "The product or service the customer is interested in",
            },
            needSummary: {
              type: "string",
              description:
                "One or two sentences summarizing what the customer needs or is trying to achieve",
            },
            explicitInterest: {
              type: "boolean",
              description: "True if the customer explicitly expressed interest or intent to buy",
            },
            need: {
              type: "boolean",
              description: "True if a concrete need/problem has been identified",
            },
            budget: {
              type: "boolean",
              description: "True if the customer mentioned a budget or discussed price seriously",
            },
            timeline: {
              type: "string",
              description:
                "When the customer wants to buy/act (e.g. 'this week', 'next month'), if mentioned",
            },
            authority: {
              type: "boolean",
              description: "True if the customer appears to be the decision-maker",
            },
          },
          required: [],
        },
      },
    ];
  }

  async executeTool(
    name: string,
    args: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    if (name !== "capture_lead") {
      return { success: false, error: `Unknown lead tool: ${name}` };
    }
    try {
      if (!context.clientPhoneNumber) {
        return { success: false, error: "No client phone number in context" };
      }
      const lead = await this.leadService.upsertFromAI({
        organizationId: context.organizationId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        clientPhoneNumber: context.clientPhoneNumber,
        clientName: args.clientName,
        clientEmail: args.clientEmail,
        interest: args.interest,
        needSummary: args.needSummary,
        signals: {
          explicitInterest: args.explicitInterest,
          need: args.need,
          budget: args.budget,
          timeline: args.timeline,
          authority: args.authority,
        },
      });

      return {
        success: true,
        data: { leadId: lead.id, status: lead.status, score: lead.score },
      };
    } catch (error) {
      this.logger.error(`capture_lead failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
