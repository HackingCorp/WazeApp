import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { ConversationService } from "./conversation.service";
import {
  CreateConversationDto,
  SendMessageDto,
  ConversationQueryDto,
  UpdateConversationDto,
  ConversationStatsDto,
} from "./dto/conversation.dto";

@ApiTags("AI Agents - Conversations")
@Controller("api/v1/conversations")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Create a new conversation" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Conversation created successfully",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Invalid agent or parameters",
  })
  async create(
    @CurrentUser() user: User,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    return this.conversationService.create(
      user.currentOrganizationId,
      user.id,
      createConversationDto,
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get all conversations for organization" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversations retrieved successfully",
  })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ConversationQueryDto,
  ) {
    return this.conversationService.findAll(user.currentOrganizationId, query);
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get conversation statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation statistics retrieved successfully",
    type: ConversationStatsDto,
  })
  async getStats(
    @CurrentUser() user: User,
    @Query("agentId") agentId?: string,
  ): Promise<ConversationStatsDto> {
    return this.conversationService.getStats(
      user.currentOrganizationId,
      agentId,
    );
  }

  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get conversation by ID" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation retrieved successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Conversation not found",
  })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.conversationService.findOne(user.currentOrganizationId, id);
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Update conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation updated successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Conversation not found",
  })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateConversationDto: UpdateConversationDto,
  ) {
    return this.conversationService.update(
      user.currentOrganizationId,
      user.id,
      id,
      updateConversationDto,
    );
  }

  @Delete(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation deleted successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Conversation not found",
  })
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.conversationService.delete(
      user.currentOrganizationId,
      user.id,
      id,
    );
    return { message: "Conversation deleted successfully" };
  }

  @Post(":id/messages")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Send a message in conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Message sent successfully",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Conversation is not active",
  })
  async sendMessage(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.conversationService.sendMessage(
      user.currentOrganizationId,
      id,
      sendMessageDto,
      user.id,
    );
  }

  @Get(":id/messages")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get conversation messages" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Messages retrieved successfully",
  })
  async getMessages(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 50,
  ) {
    return this.conversationService.getMessages(
      user.currentOrganizationId,
      id,
      page,
      limit,
    );
  }

  @Post(":id/close")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Close/complete conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation closed successfully",
  })
  async closeConversation(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body?: { summary?: string; satisfactionScore?: number },
  ) {
    return this.conversationService.update(
      user.currentOrganizationId,
      user.id,
      id,
      {
        status: "completed" as any,
        context: {
          summary: body?.summary,
          satisfactionScore: body?.satisfactionScore,
        },
      },
    );
  }

  @Post(":id/reopen")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Reopen a closed conversation" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation reopened successfully",
  })
  async reopenConversation(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.conversationService.update(
      user.currentOrganizationId,
      user.id,
      id,
      { status: "active" as any },
    );
  }

  @Post(":id/transfer")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Transfer conversation to another agent" })
  @ApiParam({ name: "id", description: "Conversation ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Conversation transferred successfully",
  })
  async transferConversation(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body("newAgentId") newAgentId: string,
    @Body("reason") reason?: string,
  ) {
    // This would transfer a conversation to a different agent
    // Implementation would involve updating the agentId and logging the transfer
    return {
      message: "Conversation transfer endpoint - implementation pending",
    };
  }
}
