import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan, IsNull } from "typeorm";
import {
  User,
  Organization,
  AiAgent,
  AgentConversation,
  AgentMessage,
  WhatsAppSession,
} from "@/common/entities";
import { QuotaEnforcementService, QuotaCheck } from "@/modules/subscriptions/quota-enforcement.service";

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    private quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async getAnalytics(organizationId: string, userId: string, params: any) {
    const { period = "7d", startDate, endDate } = params;

    
    try {
      // Get real data from database

      // Build proper where conditions - find ALL agents the user has access to
      // Always search for agents created by the user (regardless of org assignment)
      // Plus org-level agents if user has an organization
      let agentWhereConditions: any[];
      let sessionWhereConditions: any[];

      if (organizationId) {
        // Has organization - search org agents AND all user-created agents
        agentWhereConditions = [
          { organizationId },
          { createdBy: userId }  // All agents created by user (with or without org)
        ];
        sessionWhereConditions = [
          { organizationId },
          { userId }  // All sessions for this user
        ];
      } else {
        // No organization - search all agents created by user
        agentWhereConditions = [
          { createdBy: userId }
        ];
        sessionWhereConditions = [
          { userId }
        ];
      }


      // Get AI Agents
      const agents = await this.agentRepository.find({
        where: agentWhereConditions,
        relations: ['organization', 'conversations']
      });

      // Get WhatsApp Sessions
      const sessions = await this.sessionRepository.find({
        where: sessionWhereConditions,
        relations: ['agent', 'user'],
        order: { updatedAt: 'DESC' }
      });
      
      // Get agent IDs and session IDs for querying
      const agentIds = agents.map(agent => agent.id);
      const sessionIds = sessions.map(session => session.id);


      // Get real conversations count - by agentId OR sessionId
      // Conversations can be linked via agentId (AI agent) or sessionId (WhatsApp session)
      let conversations = 0;
      let conversationIds: string[] = [];

      const conversationsQuery = this.conversationRepository.createQueryBuilder('conversation');

      // Build OR conditions for both agentId and sessionId
      const conditions: string[] = [];
      const params: any = {};

      if (agentIds.length > 0) {
        conditions.push('conversation.agentId IN (:...agentIds)');
        params.agentIds = agentIds;
      }
      if (sessionIds.length > 0) {
        conditions.push('conversation.sessionId IN (:...sessionIds)');
        params.sessionIds = sessionIds;
      }

      if (conditions.length > 0) {
        conversationsQuery.where(`(${conditions.join(' OR ')})`, params);
        conversations = await conversationsQuery.getCount();
        conversationIds = await conversationsQuery.select('conversation.id').getRawMany()
          .then(results => results.map(r => r.conversation_id));
      }

      
      // Get real messages count for the period
      const dateFilter = this.getDateFilter(period, startDate, endDate);
      let messagesQuery = this.messageRepository.createQueryBuilder('message');
      if (conversationIds.length > 0) {
        messagesQuery = messagesQuery.where('message.conversationId IN (:...conversationIds)', { conversationIds });
        if (dateFilter) {
          messagesQuery = messagesQuery.andWhere('message.createdAt >= :startDate', { startDate: dateFilter });
        }
      } else {
        messagesQuery = messagesQuery.where('1 = 0'); // No results if no conversations
      }
      const messages = await messagesQuery.getCount();
      

      // Calculate real active conversations (conversations with recent activity)
      const recentThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      let activeConversationsQuery = this.conversationRepository.createQueryBuilder('conversation');

      // Use same conditions as total conversations but add recent activity filter
      if (conditions.length > 0) {
        activeConversationsQuery = activeConversationsQuery
          .where(`(${conditions.join(' OR ')})`, params)
          .andWhere('conversation.updatedAt > :recentThreshold', { recentThreshold });
      } else {
        activeConversationsQuery = activeConversationsQuery
          .where('conversation.userId = :userId', { userId })
          .andWhere('conversation.updatedAt > :recentThreshold', { recentThreshold });
      }
      const activeConversations = await activeConversationsQuery.getCount();

      // Calculate response time from recent messages
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let recentMessagesQuery = this.messageRepository.createQueryBuilder('message');
      if (conversationIds.length > 0) {
        recentMessagesQuery = recentMessagesQuery
          .where('message.conversationId IN (:...conversationIds)', { conversationIds })
          .andWhere('message.createdAt > :last24h', { last24h })
          .orderBy('message.createdAt', 'ASC');
      }
      const recentMessages = conversationIds.length > 0 ? await recentMessagesQuery.getMany() : [];

      const responseTime = this.calculateAverageResponseTime(recentMessages);
      
      // Calculate stats for dashboard
      const connectedSessions = sessions.filter(s => s.status === 'connected');
      const stats = {
        totalConversations: conversations,
        activeConversations: activeConversations,
        totalAgents: agents.length,
        activeAgents: connectedSessions.length,
        responseTime: responseTime,
        satisfactionRate: null, // Not yet tracked - requires feedback system
        messagesThisMonth: messages,
        conversionRate: null, // Not yet tracked - requires conversion events
      };

      // Get real agent statuses from AI Agents only (not WhatsApp sessions)
      const agentStatuses = agents.slice(0, 5).map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status === 'active' ? 'online' : 'offline',
        conversations: agent.metrics?.totalConversations || 0, // Use real conversation count
        lastActive: this.getRelativeTime(agent.updatedAt)
      }));


      // Generate real chart data for last 7 days
      const chartData = await this.generateRealChartData(agents, period);


      // Get quota information
      let messageQuota: QuotaCheck | null = null;
      let agentQuota: QuotaCheck | null = null;

      try {
        if (organizationId) {
          messageQuota = await this.quotaEnforcementService.checkWhatsAppMessageQuota(organizationId);
          agentQuota = await this.quotaEnforcementService.checkAgentQuota(organizationId);
        } else if (userId) {
          messageQuota = await this.quotaEnforcementService.checkUserWhatsAppMessageQuota(userId);
          agentQuota = await this.quotaEnforcementService.checkUserAgentQuota(userId);
        }
        this.logger.log(`📊 Quota info - Messages: ${messageQuota?.current}/${messageQuota?.limit}, Agents: ${agentQuota?.current}/${agentQuota?.limit}`);
      } catch (quotaError) {
        this.logger.warn(`Failed to get quota info: ${quotaError.message}`);
      }

      return {
        stats,
        chartData,
        agentStatuses, // Now only contains AI Agents
        quota: {
          messages: messageQuota,
          agents: agentQuota,
        },
        organizationId,
        userId,
        isRealData: true, // Flag to verify this is real data
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Return ZERO data on error - don't show fake numbers
      return {
        stats: {
          totalConversations: 0,
          activeConversations: 0,
          totalAgents: 0,
          activeAgents: 0,
          responseTime: 0,
          satisfactionRate: 0,
          messagesThisMonth: 0,
          conversionRate: 0,
        },
        chartData: [],
        agentStatuses: [],
        quota: {
          messages: null,
          agents: null,
        },
        organizationId,
        userId,
        isRealData: false,
        error: error.message,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  async getOverview(organizationId: string, userId: string) {
    try {
      const agentWhere = organizationId
        ? [{ organizationId }, { createdBy: userId }]
        : [{ createdBy: userId }];

      const agents = await this.agentRepository.find({ where: agentWhere });
      const agentIds = agents.map(a => a.id);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalConversations = agentIds.length > 0
        ? await this.conversationRepository.count({ where: agentIds.map(id => ({ agentId: id })) })
        : 0;

      const todayConversations = agentIds.length > 0
        ? await this.conversationRepository.createQueryBuilder('c')
            .where('c.agentId IN (:...agentIds)', { agentIds })
            .andWhere('c.createdAt >= :today', { today })
            .getCount()
        : 0;

      const totalMessages = agentIds.length > 0
        ? await this.messageRepository.createQueryBuilder('m')
            .innerJoin('m.conversation', 'c')
            .where('c.agentId IN (:...agentIds)', { agentIds })
            .getCount()
        : 0;

      const todayMessages = agentIds.length > 0
        ? await this.messageRepository.createQueryBuilder('m')
            .innerJoin('m.conversation', 'c')
            .where('c.agentId IN (:...agentIds)', { agentIds })
            .andWhere('m.createdAt >= :today', { today })
            .getCount()
        : 0;

      // Recent activity from real messages
      const recentMessages = agentIds.length > 0
        ? await this.messageRepository.createQueryBuilder('m')
            .innerJoinAndSelect('m.conversation', 'c')
            .innerJoinAndSelect('c.agent', 'a')
            .where('c.agentId IN (:...agentIds)', { agentIds })
            .orderBy('m.createdAt', 'DESC')
            .limit(5)
            .getMany()
        : [];

      const recentActivity = recentMessages.map(m => ({
        time: m.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        event: m.role === 'user' ? 'Message received' : 'Response sent',
        agent: m.conversation?.agent?.name || 'Unknown',
      }));

      return {
        summary: {
          totalAgents: agents.length,
          activeAgents: agents.filter(a => a.status === 'active').length,
          totalConversations,
          todayConversations,
          totalMessages,
          todayMessages,
          averageResponseTime: 0,
          customerSatisfaction: null,
        },
        recentActivity,
        organizationId,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`getOverview error: ${error.message}`);
      return {
        summary: { totalAgents: 0, activeAgents: 0, totalConversations: 0, todayConversations: 0, totalMessages: 0, todayMessages: 0, averageResponseTime: 0, customerSatisfaction: null },
        recentActivity: [],
        organizationId,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  async getAgentAnalytics(
    organizationId: string,
    userId: string,
    period?: string,
  ) {
    try {
      const agentWhere = organizationId
        ? [{ organizationId }, { createdBy: userId }]
        : [{ createdBy: userId }];

      const agents = await this.agentRepository.find({ where: agentWhere });
      const dateFilter = this.getDateFilter(period || '7d');

      const agentStats = await Promise.all(agents.map(async (agent) => {
        const conversations = await this.conversationRepository.count({
          where: { agentId: agent.id },
        });

        const messages = await this.messageRepository.createQueryBuilder('m')
          .innerJoin('m.conversation', 'c')
          .where('c.agentId = :agentId', { agentId: agent.id })
          .andWhere('m.createdAt >= :dateFilter', { dateFilter })
          .getCount();

        return {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          conversations,
          messages,
          satisfaction: null,
          responseTime: 0,
          resolutionRate: null,
        };
      }));

      return {
        period: period || "7d",
        agents: agentStats,
        organizationId,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`getAgentAnalytics error: ${error.message}`);
      return { period: period || "7d", agents: [], organizationId, generatedAt: new Date().toISOString() };
    }
  }

  async getConversationAnalytics(
    organizationId: string,
    userId: string,
    period?: string,
  ) {
    try {
      const agentWhere = organizationId
        ? [{ organizationId }, { createdBy: userId }]
        : [{ createdBy: userId }];

      const agents = await this.agentRepository.find({ where: agentWhere });
      const agentIds = agents.map(a => a.id);
      const dateFilter = this.getDateFilter(period || '7d');

      if (agentIds.length === 0) {
        return {
          period: period || "7d",
          totalConversations: 0, completedConversations: 0,
          averageDuration: 0, conversionRate: null,
          channelBreakdown: { whatsapp: 0, web: 0, api: 0 },
          hourlyDistribution: [],
          organizationId, generatedAt: new Date().toISOString(),
        };
      }

      const totalConversations = await this.conversationRepository.createQueryBuilder('c')
        .where('c.agentId IN (:...agentIds)', { agentIds })
        .andWhere('c.createdAt >= :dateFilter', { dateFilter })
        .getCount();

      const completedConversations = await this.conversationRepository.createQueryBuilder('c')
        .where('c.agentId IN (:...agentIds)', { agentIds })
        .andWhere('c.createdAt >= :dateFilter', { dateFilter })
        .andWhere('c.status = :status', { status: 'completed' })
        .getCount();

      // Real hourly distribution
      const hourlyRaw = await this.conversationRepository.createQueryBuilder('c')
        .select('EXTRACT(HOUR FROM c.createdAt)', 'hour')
        .addSelect('COUNT(*)', 'count')
        .where('c.agentId IN (:...agentIds)', { agentIds })
        .andWhere('c.createdAt >= :dateFilter', { dateFilter })
        .groupBy('EXTRACT(HOUR FROM c.createdAt)')
        .getRawMany();

      const hourlyMap = new Map(hourlyRaw.map(r => [parseInt(r.hour), parseInt(r.count)]));
      const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        conversations: hourlyMap.get(i) || 0,
      }));

      // Channel breakdown from real data
      const channelRaw = await this.conversationRepository.createQueryBuilder('c')
        .select('c.channel', 'channel')
        .addSelect('COUNT(*)', 'count')
        .where('c.agentId IN (:...agentIds)', { agentIds })
        .andWhere('c.createdAt >= :dateFilter', { dateFilter })
        .groupBy('c.channel')
        .getRawMany();

      const channelBreakdown = { whatsapp: 0, web: 0, api: 0 };
      for (const row of channelRaw) {
        const ch = (row.channel || '').toLowerCase();
        if (ch in channelBreakdown) channelBreakdown[ch] = parseInt(row.count);
        else channelBreakdown.whatsapp += parseInt(row.count); // default to whatsapp
      }

      return {
        period: period || "7d",
        totalConversations,
        completedConversations,
        averageDuration: 0,
        conversionRate: null,
        channelBreakdown,
        hourlyDistribution,
        organizationId,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`getConversationAnalytics error: ${error.message}`);
      return {
        period: period || "7d",
        totalConversations: 0, completedConversations: 0, averageDuration: 0, conversionRate: null,
        channelBreakdown: { whatsapp: 0, web: 0, api: 0 }, hourlyDistribution: [],
        organizationId, generatedAt: new Date().toISOString(),
      };
    }
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  private getDateFilter(period: string, startDate?: string, endDate?: string): Date {
    if (startDate && endDate) {
      return new Date(startDate);
    }

    const now = new Date();
    const days = period === "30d" ? 30 : period === "7d" ? 7 : 1;
    return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  }

  private calculateAverageResponseTime(messages: any[]): number {
    if (messages.length === 0) return 0;

    // Group messages by conversation and calculate response times
    const conversationMessages = new Map();
    messages.forEach(message => {
      if (!conversationMessages.has(message.conversationId)) {
        conversationMessages.set(message.conversationId, []);
      }
      conversationMessages.get(message.conversationId).push(message);
    });

    const responseTimes = [];
    conversationMessages.forEach(convMessages => {
      for (let i = 1; i < convMessages.length; i++) {
        const prevMessage = convMessages[i - 1];
        const currentMessage = convMessages[i];
        
        // Calculate time difference if switching between user and bot
        if (prevMessage.sender !== currentMessage.sender) {
          const timeDiff = (new Date(currentMessage.createdAt).getTime() - 
                           new Date(prevMessage.createdAt).getTime()) / 1000; // in seconds
          if (timeDiff > 0 && timeDiff < 300) { // Only reasonable response times (< 5 minutes)
            responseTimes.push(timeDiff);
          }
        }
      }
    });

    if (responseTimes.length === 0) return 0;
    
    const average = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    return Math.round(average * 10) / 10; // Round to 1 decimal
  }

  private async generateRealChartData(agents: any[], period: string) {
    const days = period === "30d" ? 30 : period === "7d" ? 7 : 1;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const agentIds = agents.map(agent => agent.id);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    // Build date-indexed map for the period
    const dateMap = new Map<string, { name: string; conversations: number; messages: number; responseTime: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
      dateMap.set(key, { name: dayNames[d.getDay()], conversations: 0, messages: 0, responseTime: 0 });
    }

    if (agentIds.length === 0) {
      return Array.from(dateMap.values());
    }

    // Single aggregated query for conversations per day
    const convByDay = await this.conversationRepository.createQueryBuilder('c')
      .select("TO_CHAR(c.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('c.agentId IN (:...agentIds)', { agentIds })
      .andWhere('c.createdAt >= :startDate', { startDate })
      .groupBy("TO_CHAR(c.createdAt, 'YYYY-MM-DD')")
      .getRawMany();

    for (const row of convByDay) {
      const entry = dateMap.get(row.day);
      if (entry) entry.conversations = parseInt(row.count);
    }

    // Single aggregated query for messages per day (join through conversation)
    const msgByDay = await this.messageRepository.createQueryBuilder('m')
      .select("TO_CHAR(m.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('m.conversation', 'c')
      .where('c.agentId IN (:...agentIds)', { agentIds })
      .andWhere('m.createdAt >= :startDate', { startDate })
      .groupBy("TO_CHAR(m.createdAt, 'YYYY-MM-DD')")
      .getRawMany();

    for (const row of msgByDay) {
      const entry = dateMap.get(row.day);
      if (entry) entry.messages = parseInt(row.count);
    }

    return Array.from(dateMap.values());
  }
}
