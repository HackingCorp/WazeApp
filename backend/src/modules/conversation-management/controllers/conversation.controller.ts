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
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "../../../common/decorators/current-user.decorator";
import {
  UserRole,
  ConversationState,
  MessagePriority,
  MessageRole,
  MessageStatus,
  ConversationStatus,
} from "../../../common/enums";
import {
  User,
  AgentConversation,
  AgentMessage,
  ConversationContext,
} from "../../../common/entities";
import { ConversationStateService } from "../services/conversation-state.service";
import { MessageProcessingService } from "../services/message-processing.service";
import { ResponseGenerationService } from "../services/response-generation.service";

class CreateConversationDto {
  agentId: string;
  phoneNumber: string;
  initialMessage?: string;
  metadata?: Record<string, any>;
}

class SendMessageDto {
  content: string;
  mediaUrls?: string[];
  priority?: MessagePriority;
  metadata?: Record<string, any>;
}

class TransitionStateDto {
  newState: ConversationState;
  reason?: string;
  metadata?: Record<string, any>;
}

@ApiTags("conversations")
@Controller("conversations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationController {
  constructor(
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    private conversationStateService: ConversationStateService,
    private messageProcessingService: MessageProcessingService,
    private responseGenerationService: ResponseGenerationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get all conversations for organization" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["active", "closed", "archived"],
  })
  @ApiQuery({ name: "state", required: false, enum: ConversationState })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversations retrieved successfully",
  })
  async getConversations(
    @CurrentUser() user: AuthenticatedRequest,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 20,
    @Query("status") status?: string,
    @Query("state") state?: ConversationState,
  ) {
    const queryBuilder = this.conversationRepository
      .createQueryBuilder("conversation")
      .leftJoinAndSelect("conversation.agent", "agent");

    // For users without organizations, filter by userId directly
    if (user.organizationId) {
      queryBuilder
        .leftJoin("conversation.agent", "agentForOrg")
        .where("agentForOrg.organizationId = :organizationId", {
          organizationId: user.organizationId,
        });
    } else {
      queryBuilder.where("conversation.userId = :userId", {
        userId: user.userId,
      });
    }

    if (status) {
      queryBuilder.andWhere("conversation.status = :status", { status });
    }

    if (state) {
      queryBuilder
        .leftJoin("conversation.context", "ctx")
        .andWhere("ctx.currentState = :state", { state });
    }

    const [conversations, total] = await queryBuilder
      .orderBy("conversation.lastActivityAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Post()
  @ApiOperation({ summary: "Create new conversation" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Conversation created successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async createConversation(
    @CurrentUser() user: User,
    @Body() createDto: CreateConversationDto,
  ) {
    // Create conversation
    const conversation = this.conversationRepository.create({
      agentId: createDto.agentId,
      userId: user.id,
      channel: "whatsapp" as any,
      externalId: createDto.phoneNumber,
      status: "active" as any,
      startedAt: new Date(),
      context: {
        userProfile: { phone: createDto.phoneNumber },
        ...createDto.metadata,
      },
    });

    const savedConversation =
      await this.conversationRepository.save(conversation);

    // Initialize conversation context
    await this.conversationStateService.initializeContext(
      savedConversation.id,
      {
        userProfile: {
          phone: createDto.phoneNumber,
          name: user.fullName,
        },
      },
    );

    // Send initial message if provided
    if (createDto.initialMessage) {
      await this.sendMessage(user, savedConversation.id, {
        content: createDto.initialMessage,
        priority: MessagePriority.NORMAL,
      });
    }

    return savedConversation;
  }

  @Get(":id")
  @ApiOperation({ summary: "Get conversation by ID" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getConversation(@CurrentUser() user: User, @Param("id") id: string) {
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "Get messages for conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Messages retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getConversationMessages(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 50,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId: id },
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Send message to conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Message sent successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async sendMessage(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() sendDto: SendMessageDto,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Save user message
    const userMessage = this.messageRepository.create({
      conversationId: id,
      role: MessageRole.USER,
      content: sendDto.content,
      status: MessageStatus.SENT,
      sequenceNumber: await this.getNextSequenceNumber(id),
      metadata: {
        ...sendDto.metadata,
        attachments:
          sendDto.mediaUrls?.map((url) => ({
            type: "document" as const,
            url,
            name: "attachment",
            size: 0,
          })) || [],
      },
    });

    const savedMessage = await this.messageRepository.save(userMessage);

    // Queue for AI processing
    await this.messageProcessingService.queueMessage({
      messageId: savedMessage.id,
      conversationId: id,
      agentId: conversation.agentId,
      content: sendDto.content,
      mediaUrls: sendDto.mediaUrls,
      priority: sendDto.priority || MessagePriority.NORMAL,
      organizationId: user.currentOrganizationId!,
      userId: user.id,
    });

    // Update conversation activity
    await this.conversationRepository
      .createQueryBuilder()
      .update(AgentConversation)
      .set({
        metrics: () =>
          `jsonb_set(metrics, '{lastActivity}', '"${new Date().toISOString()}"')`,
      })
      .where("id = :id", { id })
      .execute();

    return savedMessage;
  }

  @Put(":id/state")
  @ApiOperation({ summary: "Transition conversation state" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "State transitioned successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async transitionState(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() transitionDto: TransitionStateDto,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const context = await this.conversationStateService.transitionState(
      id,
      transitionDto.newState,
      transitionDto.reason,
      {
        ...transitionDto.metadata,
        triggeredBy: user.id,
        triggeredAt: new Date().toISOString(),
      },
    );

    return context;
  }

  @Get(":id/context")
  @ApiOperation({ summary: "Get conversation context" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Context retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getContext(@CurrentUser() user: User, @Param("id") id: string) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const context = await this.conversationStateService.getContext(id);
    return context;
  }

  @Put(":id/context")
  @ApiOperation({ summary: "Update conversation context" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Context updated successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async updateContext(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() updates: Partial<ConversationContext>,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const context = await this.conversationStateService.updateContext(
      id,
      updates,
    );
    return context;
  }

  @Post(":id/close")
  @ApiOperation({ summary: "Close conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation closed successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async closeConversation(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Transition to closed state
    await this.conversationStateService.transitionState(
      id,
      ConversationState.CLOSED,
      body.reason || "Closed by user",
      {
        closedBy: user.id,
        closedAt: new Date().toISOString(),
      },
    );

    // Update conversation status
    await this.conversationRepository.update(id, {
      status: ConversationStatus.COMPLETED,
    });

    return { success: true, message: "Conversation closed successfully" };
  }

  @Delete(":id")
  @ApiOperation({ summary: "Archive conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation archived successfully",
  })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async archiveConversation(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Update status to archived instead of deleting
    await this.conversationRepository.update(id, {
      status: ConversationStatus.ARCHIVED,
    });

    return { success: true, message: "Conversation archived successfully" };
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Get conversation summary" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Summary generated successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getConversationSummary(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ) {
    // Verify conversation belongs to user's organization
    const conversation = await this.conversationRepository.findOne({
      where: {
        id,
        agent: {
          organizationId: user.currentOrganizationId!,
        },
      },
      relations: ["agent"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const summary =
      await this.responseGenerationService.summarizeConversationHistory(id);
    return { summary };
  }

  /**
   * Helper method to get next sequence number for messages
   */
  private async getNextSequenceNumber(conversationId: string): Promise<number> {
    const lastMessage = await this.messageRepository.findOne({
      where: { conversationId },
      order: { sequenceNumber: "DESC" },
    });

    return (lastMessage?.sequenceNumber || 0) + 1;
  }
}
