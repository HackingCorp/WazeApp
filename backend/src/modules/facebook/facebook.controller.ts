import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FacebookService } from "./facebook.service";
import { FacebookCommentResponderService } from "./facebook-comment-responder.service";
import {
  ConnectPageDto,
  UpdatePageSessionDto,
  FacebookPageSessionResponseDto,
} from "./dto/connect-page.dto";
import {
  FacebookWebhookVerifyDto,
  FacebookWebhookEventDto,
} from "./dto/webhook-event.dto";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { Public } from "@/common/decorators/public.decorator";
import { AllowIndividualUsers } from "@/common/decorators/allow-individual-users.decorator";
import { FacebookPageSession } from "@/common/entities";

@ApiTags("Facebook")
@Controller("facebook")
@UseGuards(JwtAuthGuard)
@AllowIndividualUsers()
@ApiBearerAuth()
export class FacebookController {
  private readonly logger = new Logger(FacebookController.name);

  constructor(
    private facebookService: FacebookService,
    private commentResponderService: FacebookCommentResponderService,
    private configService: ConfigService,
    @InjectRepository(FacebookPageSession)
    private sessionRepository: Repository<FacebookPageSession>,
  ) {}

  @Post("pages/connect")
  @ApiOperation({ summary: "Connect a Facebook Page" })
  @ApiResponse({
    status: 201,
    description: "Page connected successfully",
    type: FacebookPageSessionResponseDto,
  })
  async connectPage(
    @Body() connectDto: ConnectPageDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FacebookPageSessionResponseDto> {
    return this.facebookService.connectPage(
      connectDto,
      user.userId,
      user.organizationId || null,
    );
  }

  @Get("pages")
  @ApiOperation({ summary: "Get connected Facebook Pages" })
  @ApiResponse({
    status: 200,
    description: "Pages retrieved successfully",
    type: [FacebookPageSessionResponseDto],
  })
  async getPages(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FacebookPageSessionResponseDto[]> {
    return this.facebookService.findAll(user.userId, user.organizationId || null);
  }

  @Get("pages/:id")
  @ApiOperation({ summary: "Get Facebook Page by ID" })
  @ApiResponse({
    status: 200,
    description: "Page found",
    type: FacebookPageSessionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Page not found" })
  async getPage(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FacebookPageSessionResponseDto> {
    return this.facebookService.findOne(
      id,
      user.userId,
      user.organizationId || null,
    );
  }

  @Put("pages/:id")
  @ApiOperation({ summary: "Update Facebook Page session" })
  @ApiResponse({
    status: 200,
    description: "Page updated successfully",
    type: FacebookPageSessionResponseDto,
  })
  async updatePage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDto: UpdatePageSessionDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<FacebookPageSessionResponseDto> {
    return this.facebookService.update(
      id,
      updateDto,
      user.userId,
      user.organizationId || null,
    );
  }

  @Delete("pages/:id")
  @ApiOperation({ summary: "Disconnect Facebook Page" })
  @ApiResponse({ status: 200, description: "Page disconnected successfully" })
  async disconnectPage(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.facebookService.delete(
      id,
      user.userId,
      user.organizationId || null,
    );
    return { message: "Facebook Page disconnected successfully" };
  }

  /**
   * Webhook verification endpoint (GET)
   * Facebook will call this to verify webhook URL
   */
  @Get("webhook")
  @Public()
  @ApiOperation({ summary: "Verify Facebook webhook" })
  @ApiResponse({ status: 200, description: "Webhook verified" })
  async verifyWebhook(@Query() query: any): Promise<string> {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    const verifyToken =
      this.configService.get("FACEBOOK_VERIFY_TOKEN") || "wazeapp_facebook_verify";

    if (mode === "subscribe" && token === verifyToken) {
      this.logger.log("Facebook webhook verified successfully");
      return challenge;
    } else {
      this.logger.warn("Facebook webhook verification failed");
      throw new BadRequestException("Verification failed");
    }
  }

  /**
   * Webhook event endpoint (POST)
   * Facebook will send events to this endpoint
   */
  @Post("webhook")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive Facebook webhook events" })
  @ApiResponse({ status: 200, description: "Event received" })
  async handleWebhook(@Body() body: FacebookWebhookEventDto): Promise<{ status: string }> {
    this.logger.log(`Received Facebook webhook event: ${body.object}`);

    try {
      if (body.object === "page") {
        for (const entry of body.entry) {
          const pageId = entry.id;

          // Handle comment events
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === "feed" && change.value?.item === "comment") {
                await this.handleCommentEvent(pageId, change.value);
              }
            }
          }
        }
      }

      return { status: "ok" };
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
      // Always return 200 to Facebook to prevent retries
      return { status: "ok" };
    }
  }

  /**
   * Handle comment event
   */
  private async handleCommentEvent(pageId: string, commentData: any): Promise<void> {
    try {
      // Find session by page ID
      const session = await this.sessionRepository.findOne({
        where: { pageId, isActive: true },
        relations: ["agent"],
      });

      if (!session) {
        this.logger.debug(`No active session found for page ${pageId}`);
        return;
      }

      // Extract comment details
      const commentEvent = {
        id: commentData.comment_id,
        from: {
          id: commentData.from?.id || "",
          name: commentData.from?.name || "Unknown",
        },
        message: commentData.message || "",
        created_time: commentData.created_time,
        parent: commentData.parent_id
          ? {
              id: commentData.parent_id,
              created_time: commentData.created_time,
            }
          : undefined,
        post_id: commentData.post_id,
        verb: commentData.verb || "add",
      };

      // Handle the comment event
      await this.commentResponderService.handleCommentEvent(session, commentEvent);
    } catch (error) {
      this.logger.error(
        `Error handling comment event for page ${pageId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
