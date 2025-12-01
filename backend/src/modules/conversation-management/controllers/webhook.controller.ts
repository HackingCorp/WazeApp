import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { UserRole } from "../../../common/enums";
import { User } from "../../../common/entities";
import {
  WebhookProcessorService,
  WhatsAppWebhookPayload,
} from "../services/webhook-processor.service";

@ApiTags("webhooks")
@Controller("webhooks")
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private webhookProcessorService: WebhookProcessorService,
    private configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get(
      "WHATSAPP_WEBHOOK_SECRET",
      "default-secret",
    );
  }

  @Get("whatsapp")
  @ApiOperation({ summary: "WhatsApp webhook verification" })
  @ApiQuery({ name: "hub.mode", description: "Webhook mode" })
  @ApiQuery({ name: "hub.verify_token", description: "Verification token" })
  @ApiQuery({ name: "hub.challenge", description: "Challenge string" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Webhook verified successfully",
  })
  async verifyWebhook(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") verifyToken: string,
    @Query("hub.challenge") challenge: string,
  ) {
    this.logger.log(
      `Webhook verification request: mode=${mode}, token=${verifyToken}`,
    );

    if (mode === "subscribe" && verifyToken === this.webhookSecret) {
      this.logger.log("Webhook verified successfully");
      return challenge;
    } else {
      this.logger.warn("Webhook verification failed");
      throw new UnauthorizedException("Invalid verification token");
    }
  }

  @Post("whatsapp")
  @ApiOperation({ summary: "Receive WhatsApp webhook events" })
  @ApiHeader({ name: "X-Hub-Signature-256", description: "Webhook signature" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Webhook processed successfully",
  })
  async receiveWebhook(
    @Body() payload: any,
    @Headers("X-Hub-Signature-256") signature?: string,
    @Headers("X-Organization-Id") organizationId?: string,
  ) {
    this.logger.log(
      `Received webhook: ${JSON.stringify(payload).substring(0, 200)}...`,
    );

    try {
      // Verify webhook signature
      if (signature) {
        this.verifyWebhookSignature(JSON.stringify(payload), signature);
      }

      // Extract organization ID from payload or header
      const orgId =
        organizationId || this.extractOrganizationFromPayload(payload);
      if (!orgId) {
        throw new BadRequestException("Organization ID not found in webhook");
      }

      // Process webhook events
      const results = [];
      if (payload.entry && Array.isArray(payload.entry)) {
        for (const entry of payload.entry) {
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              if (change.value && change.field === "messages") {
                const events = this.parseWhatsAppEvents(change.value);
                for (const event of events) {
                  const result =
                    await this.webhookProcessorService.processWebhook(
                      event,
                      orgId,
                      entry.id, // WhatsApp Business Account ID
                    );
                  results.push(result);
                }
              }
            }
          }
        }
      }

      this.logger.log(`Processed ${results.length} webhook events`);
      return {
        success: true,
        processed: results.length,
        results: results.filter((r) => !r.success), // Only return failed results
      };
    } catch (error) {
      this.logger.error(
        `Webhook processing error: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Webhook processing failed: ${error.message}`,
      );
    }
  }

  @Post("whatsapp/test")
  @ApiOperation({ summary: "Test webhook processing with sample data" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Test webhook processed successfully",
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async testWebhook(@CurrentUser() user: User, @Body() testPayload?: any) {
    const samplePayload: WhatsAppWebhookPayload = testPayload || {
      type: "message" as any,
      timestamp: Date.now() / 1000,
      from: "1234567890",
      to: "0987654321",
      message: {
        id: "test-message-id",
        type: "text",
        text: "Hello, this is a test message!",
      },
    };

    try {
      const result = await this.webhookProcessorService.processWebhook(
        samplePayload,
        user.currentOrganizationId!,
        "test-session",
      );

      return {
        success: true,
        result,
        message: "Test webhook processed successfully",
      };
    } catch (error) {
      this.logger.error(`Test webhook failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        message: "Test webhook processing failed",
      };
    }
  }

  @Get("stats")
  @ApiOperation({ summary: "Get webhook processing statistics" })
  @ApiQuery({
    name: "timeframe",
    required: false,
    enum: ["day", "week", "month"],
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Statistics retrieved successfully",
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getWebhookStats(
    @CurrentUser() user: User,
    @Query("timeframe") timeframe: "day" | "week" | "month" = "day",
  ) {
    const stats = await this.webhookProcessorService.getWebhookStats(
      user.currentOrganizationId!,
      timeframe,
    );

    return {
      timeframe,
      organizationId: user.currentOrganizationId!,
      ...stats,
    };
  }

  /**
   * Verify webhook signature for security
   */
  private verifyWebhookSignature(payload: string, signature: string): void {
    const expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", this.webhookSecret)
        .update(payload, "utf8")
        .digest("hex");

    if (signature !== expectedSignature) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  /**
   * Extract organization ID from webhook payload
   */
  private extractOrganizationFromPayload(payload: any): string | null {
    // Try to extract organization ID from various possible locations
    if (payload.organizationId) {
      return payload.organizationId;
    }

    if (payload.entry?.[0]?.id) {
      // Use WhatsApp Business Account ID as fallback
      return `whatsapp:${payload.entry[0].id}`;
    }

    return null;
  }

  /**
   * Parse WhatsApp webhook events from payload
   */
  private parseWhatsAppEvents(value: any): WhatsAppWebhookPayload[] {
    const events: WhatsAppWebhookPayload[] = [];

    // Parse messages
    if (value.messages && Array.isArray(value.messages)) {
      for (const message of value.messages) {
        events.push({
          type: "message_received" as any,
          timestamp: message.timestamp,
          from: message.from,
          to: value.metadata?.phone_number_id || "unknown",
          message: {
            id: message.id,
            type: message.type,
            text: message.text?.body,
            media:
              message.image ||
              message.video ||
              message.audio ||
              message.document,
          },
        });
      }
    }

    // Parse message statuses
    if (value.statuses && Array.isArray(value.statuses)) {
      for (const status of value.statuses) {
        events.push({
          type: "message_status" as any,
          timestamp: status.timestamp,
          from: status.recipient_id,
          to: value.metadata?.phone_number_id || "unknown",
          status: {
            id: status.id,
            status: status.status,
            timestamp: status.timestamp,
          },
        });
      }
    }

    // Parse presence updates
    if (value.contacts && Array.isArray(value.contacts)) {
      for (const contact of value.contacts) {
        if (contact.wa_id) {
          events.push({
            type: "presence_update" as any,
            timestamp: Date.now() / 1000,
            from: contact.wa_id,
            to: value.metadata?.phone_number_id || "unknown",
            presence: {
              from: contact.wa_id,
              status: "online", // Default to online when contact info is updated
            },
          });
        }
      }
    }

    return events;
  }
}
