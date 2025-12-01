import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import {
  AgentConversation,
  AgentMessage,
  AiAgent,
  User,
} from "../../common/entities";
import {
  ConversationStatus,
  ConversationChannel,
  MessageRole,
  MessageStatus,
  AuditAction,
} from "../../common/enums";
import {
  CreateConversationDto,
  SendMessageDto,
  ConversationQueryDto,
  UpdateConversationDto,
  ConversationStatsDto,
} from "./dto/conversation.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,

    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,

    @InjectRepository(AiAgent)
    private readonly agentRepository: Repository<AiAgent>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    userId: string | null,
    createDto: CreateConversationDto,
  ): Promise<AgentConversation> {
    // Validate agent belongs to organization
    const agent = await this.agentRepository.findOne({
      where: { id: createDto.agentId, organizationId },
    });

    if (!agent) {
      throw new BadRequestException("Agent not found or not accessible");
    }

    const conversation = this.conversationRepository.create({
      ...createDto,
      userId,
      status: ConversationStatus.ACTIVE,
      startedAt: new Date(),
      context: {
        sessionId: createDto.context?.sessionId || `session-${Date.now()}`,
        ...createDto.context,
      },
      metrics: {
        messageCount: 0,
        userMessageCount: 0,
        agentMessageCount: 0,
        averageResponseTime: 0,
        totalDuration: 0,
        lastActivity: new Date(),
      },
    });

    const saved = await this.conversationRepository.save(conversation);

    if (userId) {
      await this.auditService.log({
        organizationId,
        userId,
        action: AuditAction.CREATE,
        resourceType: "conversation",
        resourceId: saved.id,
        description: `Created conversation for agent: ${createDto.agentId}`,
        metadata: { agentId: createDto.agentId, channel: createDto.channel },
      });
    }

    return saved;
  }

  async sendMessage(
    organizationId: string,
    conversationId: string,
    sendDto: SendMessageDto,
    userId?: string,
  ): Promise<{ userMessage: AgentMessage; agentResponse?: AgentMessage }> {
    const conversation = await this.findOne(organizationId, conversationId);

    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw new BadRequestException("Conversation is not active");
    }

    const messageCount = await this.messageRepository.count({
      where: { conversationId },
    });

    // Create user message
    const userMessage = this.messageRepository.create({
      conversationId,
      content: sendDto.content,
      role: sendDto.role || MessageRole.USER,
      status: MessageStatus.SENT,
      sequenceNumber: messageCount + 1,
      externalMessageId: sendDto.externalMessageId,
      metadata: {
        ...sendDto.metadata,
        language: conversation.context?.userProfile?.language,
      },
    });

    const savedUserMessage = await this.messageRepository.save(userMessage);

    // Update conversation metrics
    await this.updateConversationMetrics(conversationId, userMessage.role);

    let agentResponse: AgentMessage | undefined;

    // Generate agent response if user message
    if (sendDto.role === MessageRole.USER || !sendDto.role) {
      agentResponse = await this.generateAgentResponse(
        conversation,
        savedUserMessage,
      );
    }

    return {
      userMessage: savedUserMessage,
      agentResponse,
    };
  }

  async findAll(
    organizationId: string,
    query: ConversationQueryDto,
  ): Promise<{ data: AgentConversation[]; total: number }> {
    const queryBuilder = this.conversationRepository
      .createQueryBuilder("conv")
      .leftJoinAndSelect("conv.agent", "agent")
      .leftJoinAndSelect("conv.user", "user")
      .where("agent.organizationId = :organizationId", { organizationId });

    if (query.agentId) {
      queryBuilder.andWhere("conv.agentId = :agentId", {
        agentId: query.agentId,
      });
    }

    if (query.status) {
      queryBuilder.andWhere("conv.status = :status", { status: query.status });
    }

    if (query.channel) {
      queryBuilder.andWhere("conv.channel = :channel", {
        channel: query.channel,
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        "(conv.title ILIKE :search OR conv.context::text ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere("conv.tags && :tags", { tags: query.tags });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere("conv.startedAt BETWEEN :startDate AND :endDate", {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      });
    }

    queryBuilder.orderBy("conv.updatedAt", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return { data, total };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<AgentConversation> {
    const conversation = await this.conversationRepository
      .createQueryBuilder("conv")
      .leftJoinAndSelect("conv.agent", "agent")
      .leftJoinAndSelect("conv.user", "user")
      .leftJoinAndSelect("conv.messages", "messages")
      .where("conv.id = :id", { id })
      .andWhere("agent.organizationId = :organizationId", { organizationId })
      .orderBy("messages.sequenceNumber", "ASC")
      .getOne();

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    updateDto: UpdateConversationDto,
  ): Promise<AgentConversation> {
    const conversation = await this.findOne(organizationId, id);

    Object.assign(conversation, updateDto);

    if (
      updateDto.status === ConversationStatus.COMPLETED &&
      !conversation.endedAt
    ) {
      conversation.endedAt = new Date();
      conversation.metrics = {
        ...conversation.metrics,
        totalDuration: Date.now() - conversation.startedAt.getTime(),
      };
    }

    const updated = await this.conversationRepository.save(conversation);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "conversation",
      resourceId: id,
      description: `Updated conversation: ${id}`,
      metadata: { changes: updateDto },
    });

    return updated;
  }

  async delete(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    const conversation = await this.findOne(organizationId, id);

    await this.conversationRepository.remove(conversation);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "conversation",
      resourceId: id,
      description: `Deleted conversation: ${id}`,
      metadata: { agentId: conversation.agentId },
    });
  }

  async getMessages(
    organizationId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: AgentMessage[]; total: number }> {
    const conversation = await this.findOne(organizationId, conversationId);

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId },
      order: { sequenceNumber: "ASC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: messages, total };
  }

  async getStats(
    organizationId: string,
    agentId?: string,
  ): Promise<ConversationStatsDto> {
    let queryBuilder = this.conversationRepository
      .createQueryBuilder("conv")
      .leftJoin("conv.agent", "agent")
      .where("agent.organizationId = :organizationId", { organizationId });

    if (agentId) {
      queryBuilder = queryBuilder.andWhere("conv.agentId = :agentId", {
        agentId,
      });
    }

    const conversationStats = await queryBuilder
      .select([
        "COUNT(*) as total",
        "AVG(EXTRACT(epoch FROM (conv.endedAt - conv.startedAt))/60) as avgDuration",
        "AVG(conv.metrics->'messageCount') as avgMessages",
        "AVG(conv.metrics->'averageResponseTime') as avgResponseTime",
        "AVG(conv.metrics->'satisfactionScore') as satisfactionScore",
        "COUNT(CASE WHEN conv.status = :completed THEN 1 END)::float / COUNT(*) as resolutionRate",
      ])
      .setParameter("completed", ConversationStatus.COMPLETED)
      .getRawOne();

    const statusStats = await queryBuilder
      .clone()
      .select("conv.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("conv.status")
      .getRawMany();

    const channelStats = await queryBuilder
      .clone()
      .select("conv.channel", "channel")
      .addSelect("COUNT(*)", "count")
      .groupBy("conv.channel")
      .getRawMany();

    const messageCount = await this.messageRepository
      .createQueryBuilder("msg")
      .leftJoin("msg.conversation", "conv")
      .leftJoin("conv.agent", "agent")
      .where("agent.organizationId = :organizationId", { organizationId })
      .getCount();

    const byStatus = Object.values(ConversationStatus).reduce(
      (acc, status) => {
        acc[status] = parseInt(
          statusStats.find((s) => s.status === status)?.count || "0",
        );
        return acc;
      },
      {} as Record<ConversationStatus, number>,
    );

    const byChannel = Object.values(ConversationChannel).reduce(
      (acc, channel) => {
        acc[channel] = parseInt(
          channelStats.find((c) => c.channel === channel)?.count || "0",
        );
        return acc;
      },
      {} as Record<ConversationChannel, number>,
    );

    return {
      total: parseInt(conversationStats.total) || 0,
      byStatus,
      byChannel,
      totalMessages: messageCount,
      avgDuration: parseFloat(conversationStats.avgDuration) || 0,
      avgMessages: parseFloat(conversationStats.avgMessages) || 0,
      avgResponseTime: parseFloat(conversationStats.avgResponseTime) || 0,
      satisfactionScore: parseFloat(conversationStats.satisfactionScore) || 0,
      resolutionRate: parseFloat(conversationStats.resolutionRate) || 0,
    };
  }

  private async generateAgentResponse(
    conversation: AgentConversation,
    userMessage: AgentMessage,
  ): Promise<AgentMessage> {
    const startTime = Date.now();

    // This would integrate with the LLM service to generate a response
    // For now, return a mock response
    const responseContent = `Thank you for your message. This is an automated response from the AI agent.`;

    const responseTime = Date.now() - startTime;

    const agentMessage = this.messageRepository.create({
      conversationId: conversation.id,
      content: responseContent,
      role: MessageRole.AGENT,
      status: MessageStatus.SENT,
      sequenceNumber: userMessage.sequenceNumber + 1,
      metadata: {
        processingTime: responseTime,
        modelUsed: "mock-model",
        tokenCount: Math.ceil(responseContent.length / 4),
        knowledgeBaseSources: [],
      },
    });

    const saved = await this.messageRepository.save(agentMessage);

    // Update conversation metrics
    await this.updateConversationMetrics(conversation.id, MessageRole.AGENT);

    return saved;
  }

  private async updateConversationMetrics(
    conversationId: string,
    messageRole: MessageRole,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) return;

    const messageCount = (conversation.metrics?.messageCount || 0) + 1;
    const userMessageCount = conversation.metrics?.userMessageCount || 0;
    const agentMessageCount = conversation.metrics?.agentMessageCount || 0;

    const updatedMetrics = {
      ...conversation.metrics,
      messageCount,
      userMessageCount:
        messageRole === MessageRole.USER
          ? userMessageCount + 1
          : userMessageCount,
      agentMessageCount:
        messageRole === MessageRole.AGENT
          ? agentMessageCount + 1
          : agentMessageCount,
      lastActivity: new Date(),
    };

    await this.conversationRepository.update(conversationId, {
      metrics: updatedMetrics,
    });
  }
}
