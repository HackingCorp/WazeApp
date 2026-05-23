import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan, IsNull, Not, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  User,
  Subscription,
  AiAgent,
  WhatsAppSession,
  KnowledgeBase,
  AgentConversation,
  AgentMessage,
  OrganizationMember,
} from '../../common/entities';
import {
  SubscriptionStatus,
  WhatsAppSessionStatus,
  UserRole,
} from '../../common/enums';
import { EmailService } from '../email/email.service';

@Injectable()
export class EngagementNotificationService {
  private readonly logger = new Logger(EngagementNotificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(AiAgent)
    private readonly aiAgentRepository: Repository<AiAgent>,
    @InjectRepository(WhatsAppSession)
    private readonly whatsAppSessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private readonly messageRepository: Repository<AgentMessage>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepository: Repository<OrganizationMember>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Onboarding notifications - runs every 2 hours
   */
  @Cron('0 */2 * * *')
  async checkOnboardingNotifications(): Promise<void> {
    this.logger.log('Starting onboarding notification check...');
    let sentCount = 0;

    try {
      // a) Users created > 24h ago with no login
      sentCount += await this.checkNeverLoggedIn();

      // b) Users who logged in but have 0 agents (created > 48h ago)
      sentCount += await this.checkNoAgent();

      // c) Users with agents but 0 active WhatsApp sessions (agent created > 24h ago)
      sentCount += await this.checkNoSession();

      // d) Users with active sessions but 0 messages received (session created > 72h ago)
      sentCount += await this.checkNoMessages();

      // e) Users with agents but 0 knowledge bases (agent created > 72h ago)
      sentCount += await this.checkNoKnowledgeBase();

      this.logger.log(`Onboarding check complete: ${sentCount} notifications sent`);
    } catch (error) {
      this.logger.error(`Onboarding check failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Re-engagement notifications - runs daily at 10am
   */
  @Cron('0 10 * * *')
  async checkReEngagementNotifications(): Promise<void> {
    this.logger.log('Starting re-engagement notification check...');
    let sentCount = 0;

    try {
      // a) Users inactive for 7 days
      sentCount += await this.checkInactive7Days();

      // b) Users inactive for 30 days
      sentCount += await this.checkInactive30Days();

      // c) Disconnected WhatsApp sessions > 3 days
      sentCount += await this.checkSessionDisconnected();

      this.logger.log(`Re-engagement check complete: ${sentCount} notifications sent`);
    } catch (error) {
      this.logger.error(`Re-engagement check failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Trial conversion notifications - runs daily at 11am
   */
  @Cron('0 11 * * *')
  async checkTrialConversionNotifications(): Promise<void> {
    this.logger.log('Starting trial conversion notification check...');
    let sentCount = 0;

    try {
      // a) Trialing subscriptions at mid-point with active usage
      sentCount += await this.checkTrialMidpointActive();

      // b) Trialing subscriptions at mid-point with no usage
      sentCount += await this.checkTrialMidpointInactive();

      this.logger.log(`Trial conversion check complete: ${sentCount} notifications sent`);
    } catch (error) {
      this.logger.error(`Trial conversion check failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Success celebrations - runs every hour
   */
  @Cron('0 * * * *')
  async checkSuccessCelebrations(): Promise<void> {
    this.logger.log('Starting success celebration check...');
    let sentCount = 0;

    try {
      // a) First message ever
      sentCount += await this.checkFirstMessage();

      // b) Milestones: 100, 500, 1000 messages
      sentCount += await this.checkMilestones();

      this.logger.log(`Success celebration check complete: ${sentCount} notifications sent`);
    } catch (error) {
      this.logger.error(`Success celebration check failed: ${error.message}`, error.stack);
    }
  }

  // ==================== ONBOARDING CHECKS ====================

  private async checkNeverLoggedIn(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const users = await this.userRepository.find({
      where: {
        createdAt: LessThanOrEqual(cutoffDate),
        lastLoginAt: IsNull(),
        isActive: true,
      },
    });

    let count = 0;
    for (const user of users) {
      try {
        const subscription = await this.getUserSubscription(user.id);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 'onboarding_never_logged_in')) {
          continue;
        }

        await this.emailService.sendOnboardingNeverLoggedInEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
        );

        await this.markNotificationSent(subscription, 'onboarding_never_logged_in');
        this.logger.log(`Sent never_logged_in notification to ${user.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send never_logged_in notification to ${user.email}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkNoAgent(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 48);

    const users = await this.userRepository.find({
      where: {
        createdAt: LessThanOrEqual(cutoffDate),
        lastLoginAt: Not(IsNull()),
        isActive: true,
      },
    });

    let count = 0;
    for (const user of users) {
      try {
        // Get user's organizations
        const memberships = await this.memberRepository.find({
          where: { userId: user.id, isActive: true },
          relations: ['organization'],
        });

        if (memberships.length === 0) continue;

        // Check if any org has agents
        let hasAgent = false;
        for (const membership of memberships) {
          const agentCount = await this.aiAgentRepository.count({
            where: { organizationId: membership.organizationId },
          });
          if (agentCount > 0) {
            hasAgent = true;
            break;
          }
        }

        if (hasAgent) continue;

        const subscription = await this.getUserSubscription(user.id);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 'onboarding_no_agent')) {
          continue;
        }

        await this.emailService.sendOnboardingNoAgentEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
        );

        await this.markNotificationSent(subscription, 'onboarding_no_agent');
        this.logger.log(`Sent no_agent notification to ${user.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send no_agent notification to ${user.email}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkNoSession(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const agents = await this.aiAgentRepository.find({
      where: {
        createdAt: LessThanOrEqual(cutoffDate),
      },
      relations: ['organization'],
    });

    let count = 0;
    for (const agent of agents) {
      try {
        // Check if agent has any active sessions
        const sessionCount = await this.whatsAppSessionRepository.count({
          where: {
            agentId: agent.id,
            status: WhatsAppSessionStatus.CONNECTED,
          },
        });

        if (sessionCount > 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(agent.organizationId);
        if (!owner) continue;

        const subscription = await this.getOrgSubscription(agent.organizationId);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 'onboarding_no_session')) {
          continue;
        }

        await this.emailService.sendOnboardingNoSessionEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
          agent.name,
        );

        await this.markNotificationSent(subscription, 'onboarding_no_session');
        this.logger.log(`Sent no_session notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send no_session notification for agent ${agent.id}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkNoMessages(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 72);

    const sessions = await this.whatsAppSessionRepository.find({
      where: {
        createdAt: LessThanOrEqual(cutoffDate),
        status: WhatsAppSessionStatus.CONNECTED,
      },
      relations: ['agent', 'agent.organization'],
    });

    let count = 0;
    for (const session of sessions) {
      try {
        if (!session.agent) continue;

        // Check if agent has any conversations with messages
        const messageCount = await this.messageRepository
          .createQueryBuilder('msg')
          .innerJoin('msg.conversation', 'conv')
          .where('conv.agentId = :agentId', { agentId: session.agentId })
          .getCount();

        if (messageCount > 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(session.agent.organizationId);
        if (!owner) continue;

        const subscription = await this.getOrgSubscription(session.agent.organizationId);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 'onboarding_no_messages')) {
          continue;
        }

        await this.emailService.sendOnboardingNoMessagesEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
        );

        await this.markNotificationSent(subscription, 'onboarding_no_messages');
        this.logger.log(`Sent no_messages notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send no_messages notification for session ${session.id}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkNoKnowledgeBase(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 72);

    const agents = await this.aiAgentRepository.find({
      where: {
        createdAt: LessThanOrEqual(cutoffDate),
      },
      relations: ['organization'],
    });

    let count = 0;
    for (const agent of agents) {
      try {
        // Check if org has any knowledge bases
        const kbCount = await this.knowledgeBaseRepository.count({
          where: { organizationId: agent.organizationId },
        });

        if (kbCount > 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(agent.organizationId);
        if (!owner) continue;

        const subscription = await this.getOrgSubscription(agent.organizationId);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 'onboarding_no_knowledge_base')) {
          continue;
        }

        await this.emailService.sendOnboardingNoKnowledgeBaseEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
        );

        await this.markNotificationSent(subscription, 'onboarding_no_knowledge_base');
        this.logger.log(`Sent no_knowledge_base notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send no_knowledge_base notification for agent ${agent.id}: ${error.message}`);
      }
    }

    return count;
  }

  // ==================== RE-ENGAGEMENT CHECKS ====================

  private async checkInactive7Days(): Promise<number> {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const eightDaysAgo = new Date(now);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.lastLoginAt >= :eightDaysAgo', { eightDaysAgo })
      .andWhere('user.lastLoginAt <= :sevenDaysAgo', { sevenDaysAgo })
      .andWhere('user.isActive = :active', { active: true })
      .getMany();

    let count = 0;
    for (const user of users) {
      try {
        const subscription = await this.getUserSubscription(user.id);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 're_engagement_inactive_7_days')) {
          continue;
        }

        // Get stats for user's orgs
        const memberships = await this.memberRepository.find({
          where: { userId: user.id, isActive: true },
        });

        let totalMessages = 0;
        let totalConversations = 0;

        for (const membership of memberships) {
          const msgCount = await this.messageRepository
            .createQueryBuilder('msg')
            .innerJoin('msg.conversation', 'conv')
            .innerJoin('conv.agent', 'agent')
            .where('agent.organizationId = :orgId', { orgId: membership.organizationId })
            .andWhere('msg.createdAt >= :sevenDaysAgo', { sevenDaysAgo })
            .getCount();

          const convCount = await this.conversationRepository
            .createQueryBuilder('conv')
            .innerJoin('conv.agent', 'agent')
            .where('agent.organizationId = :orgId', { orgId: membership.organizationId })
            .andWhere('conv.createdAt >= :sevenDaysAgo', { sevenDaysAgo })
            .getCount();

          totalMessages += msgCount;
          totalConversations += convCount;
        }

        await this.emailService.sendReEngagementInactive7DaysEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
          {
            messagesHandled: totalMessages,
            conversationsCount: totalConversations,
          },
        );

        await this.markNotificationSent(subscription, 're_engagement_inactive_7_days');
        this.logger.log(`Sent inactive_7_days notification to ${user.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send inactive_7_days notification to ${user.email}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkInactive30Days(): Promise<number> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyOneDaysAgo = new Date(now);
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.lastLoginAt >= :thirtyOneDaysAgo', { thirtyOneDaysAgo })
      .andWhere('user.lastLoginAt <= :thirtyDaysAgo', { thirtyDaysAgo })
      .andWhere('user.isActive = :active', { active: true })
      .getMany();

    let count = 0;
    for (const user of users) {
      try {
        const subscription = await this.getUserSubscription(user.id);
        if (!subscription) continue;

        if (this.wasNotificationSent(subscription, 're_engagement_inactive_30_days')) {
          continue;
        }

        await this.emailService.sendReEngagementInactive30DaysEmail(
          user.email,
          user.firstName || user.email.split('@')[0],
        );

        await this.markNotificationSent(subscription, 're_engagement_inactive_30_days');
        this.logger.log(`Sent inactive_30_days notification to ${user.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send inactive_30_days notification to ${user.email}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkSessionDisconnected(): Promise<number> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const disconnectedSessions = await this.whatsAppSessionRepository.find({
      where: {
        status: WhatsAppSessionStatus.DISCONNECTED,
        updatedAt: LessThanOrEqual(threeDaysAgo),
      },
      relations: ['agent', 'agent.organization'],
    });

    let count = 0;
    for (const session of disconnectedSessions) {
      try {
        if (!session.agent) continue;

        // Check if there's a replacement connected session for the same agent
        const replacementCount = await this.whatsAppSessionRepository.count({
          where: {
            agentId: session.agentId,
            status: WhatsAppSessionStatus.CONNECTED,
          },
        });

        if (replacementCount > 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(session.agent.organizationId);
        if (!owner) continue;

        const subscription = await this.getOrgSubscription(session.agent.organizationId);
        if (!subscription) continue;

        const notificationKey = `session_disconnected_${session.id}`;
        if (this.wasNotificationSent(subscription, notificationKey)) {
          continue;
        }

        const daysSinceDisconnect = Math.ceil(
          (Date.now() - new Date(session.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        await this.emailService.sendReEngagementSessionDisconnectedEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
          daysSinceDisconnect,
        );

        await this.markNotificationSent(subscription, notificationKey);
        this.logger.log(`Sent session_disconnected notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send session_disconnected notification for session ${session.id}: ${error.message}`);
      }
    }

    return count;
  }

  // ==================== TRIAL CONVERSION CHECKS ====================

  private async checkTrialMidpointActive(): Promise<number> {
    const trialingSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.TRIALING,
      },
    });

    let count = 0;
    for (const subscription of trialingSubscriptions) {
      try {
        if (!subscription.trialEndsAt) continue;

        // Check if at midpoint (within +/- 12 hours of halfway)
        const now = new Date();
        const trialStart = subscription.createdAt;
        const trialEnd = subscription.trialEndsAt;
        const trialDuration = trialEnd.getTime() - trialStart.getTime();
        const midpoint = new Date(trialStart.getTime() + trialDuration / 2);
        const twelveHours = 12 * 60 * 60 * 1000;

        if (Math.abs(now.getTime() - midpoint.getTime()) > twelveHours) {
          continue;
        }

        if (this.wasNotificationSent(subscription, 'trial_midpoint_active')) {
          continue;
        }

        // Check if has usage (messages)
        const messageCount = await this.messageRepository
          .createQueryBuilder('msg')
          .innerJoin('msg.conversation', 'conv')
          .innerJoin('conv.agent', 'agent')
          .where('agent.organizationId = :orgId', { orgId: subscription.organizationId })
          .getCount();

        if (messageCount === 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(subscription.organizationId);
        if (!owner) continue;

        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        await this.emailService.sendTrialMidpointActiveEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
          {
            messagesHandled: messageCount,
            daysRemaining,
          },
        );

        await this.markNotificationSent(subscription, 'trial_midpoint_active');
        this.logger.log(`Sent trial_midpoint_active notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send trial_midpoint_active notification for subscription ${subscription.id}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkTrialMidpointInactive(): Promise<number> {
    const trialingSubscriptions = await this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.TRIALING,
      },
    });

    let count = 0;
    for (const subscription of trialingSubscriptions) {
      try {
        if (!subscription.trialEndsAt) continue;

        // Check if at midpoint (within +/- 12 hours of halfway)
        const now = new Date();
        const trialStart = subscription.createdAt;
        const trialEnd = subscription.trialEndsAt;
        const trialDuration = trialEnd.getTime() - trialStart.getTime();
        const midpoint = new Date(trialStart.getTime() + trialDuration / 2);
        const twelveHours = 12 * 60 * 60 * 1000;

        if (Math.abs(now.getTime() - midpoint.getTime()) > twelveHours) {
          continue;
        }

        if (this.wasNotificationSent(subscription, 'trial_midpoint_inactive')) {
          continue;
        }

        // Check if has NO usage (messages)
        const messageCount = await this.messageRepository
          .createQueryBuilder('msg')
          .innerJoin('msg.conversation', 'conv')
          .innerJoin('conv.agent', 'agent')
          .where('agent.organizationId = :orgId', { orgId: subscription.organizationId })
          .getCount();

        if (messageCount > 0) continue;

        // Get org owner
        const owner = await this.getOrgOwner(subscription.organizationId);
        if (!owner) continue;

        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        await this.emailService.sendTrialMidpointInactiveEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
          daysRemaining,
        );

        await this.markNotificationSent(subscription, 'trial_midpoint_inactive');
        this.logger.log(`Sent trial_midpoint_inactive notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send trial_midpoint_inactive notification for subscription ${subscription.id}: ${error.message}`);
      }
    }

    return count;
  }

  // ==================== SUCCESS CELEBRATIONS ====================

  private async checkFirstMessage(): Promise<number> {
    const organizations = await this.subscriptionRepository.find({
      where: {
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    let count = 0;
    for (const subscription of organizations) {
      try {
        if (!subscription.organizationId) continue;

        if (this.wasNotificationSent(subscription, 'first_message_celebration')) {
          continue;
        }

        // Check total message count
        const messageCount = await this.messageRepository
          .createQueryBuilder('msg')
          .innerJoin('msg.conversation', 'conv')
          .innerJoin('conv.agent', 'agent')
          .where('agent.organizationId = :orgId', { orgId: subscription.organizationId })
          .getCount();

        if (messageCount === 0 || messageCount > 5) continue; // Allow small window around first message

        // Get org owner
        const owner = await this.getOrgOwner(subscription.organizationId);
        if (!owner) continue;

        // Get first agent name
        const firstAgent = await this.aiAgentRepository.findOne({
          where: { organizationId: subscription.organizationId },
          order: { createdAt: 'ASC' },
        });

        await this.emailService.sendFirstMessageCelebrationEmail(
          owner.email,
          owner.firstName || owner.email.split('@')[0],
          firstAgent?.name || 'Votre agent',
        );

        await this.markNotificationSent(subscription, 'first_message_celebration');
        this.logger.log(`Sent first_message_celebration notification to ${owner.email}`);
        count++;
      } catch (error) {
        this.logger.error(`Failed to send first_message_celebration notification for subscription ${subscription.id}: ${error.message}`);
      }
    }

    return count;
  }

  private async checkMilestones(): Promise<number> {
    const milestones = [100, 500, 1000];
    const organizations = await this.subscriptionRepository.find({
      where: {
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    let count = 0;
    for (const subscription of organizations) {
      try {
        if (!subscription.organizationId) continue;

        // Get total message count
        const messageCount = await this.messageRepository
          .createQueryBuilder('msg')
          .innerJoin('msg.conversation', 'conv')
          .innerJoin('conv.agent', 'agent')
          .where('agent.organizationId = :orgId', { orgId: subscription.organizationId })
          .getCount();

        for (const milestone of milestones) {
          const notificationKey = `milestone_${milestone}`;

          if (this.wasNotificationSent(subscription, notificationKey)) {
            continue;
          }

          // Check if recently crossed this milestone (within last hour)
          const oneHourAgo = new Date();
          oneHourAgo.setHours(oneHourAgo.getHours() - 1);

          const recentCount = await this.messageRepository
            .createQueryBuilder('msg')
            .innerJoin('msg.conversation', 'conv')
            .innerJoin('conv.agent', 'agent')
            .where('agent.organizationId = :orgId', { orgId: subscription.organizationId })
            .andWhere('msg.createdAt >= :oneHourAgo', { oneHourAgo })
            .getCount();

          const previousCount = messageCount - recentCount;

          // Check if milestone was crossed in the last hour
          if (previousCount < milestone && messageCount >= milestone) {
            const owner = await this.getOrgOwner(subscription.organizationId);
            if (!owner) continue;

            await this.emailService.sendMilestoneEmail(
              owner.email,
              owner.firstName || owner.email.split('@')[0],
              milestone,
            );

            await this.markNotificationSent(subscription, notificationKey);
            this.logger.log(`Sent milestone_${milestone} notification to ${owner.email}`);
            count++;
          }
        }
      } catch (error) {
        this.logger.error(`Failed to check milestones for subscription ${subscription.id}: ${error.message}`);
      }
    }

    return count;
  }

  // ==================== HELPER METHODS ====================

  private async getOrgOwner(organizationId: string): Promise<User | null> {
    const member = await this.memberRepository.findOne({
      where: {
        organizationId,
        role: In([UserRole.OWNER, UserRole.ADMIN]),
        isActive: true,
      },
      relations: ['user'],
    });
    return member?.user || null;
  }

  private async getUserSubscription(userId: string): Promise<Subscription | null> {
    // Try direct user subscription first
    let subscription = await this.subscriptionRepository.findOne({
      where: {
        userId,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    if (subscription) return subscription;

    // Try organization subscription
    const membership = await this.memberRepository.findOne({
      where: { userId, isActive: true },
    });

    if (!membership) return null;

    subscription = await this.subscriptionRepository.findOne({
      where: {
        organizationId: membership.organizationId,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });

    return subscription;
  }

  private async getOrgSubscription(organizationId: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findOne({
      where: {
        organizationId,
        status: In([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]),
      },
    });
  }

  private wasNotificationSent(subscription: Subscription, type: string): boolean {
    return !!subscription.metadata?.engagementSent?.[type];
  }

  private async markNotificationSent(subscription: Subscription, type: string): Promise<void> {
    subscription.metadata = {
      ...subscription.metadata,
      engagementSent: {
        ...subscription.metadata?.engagementSent,
        [type]: new Date().toISOString(),
      },
    };
    await this.subscriptionRepository.save(subscription);
  }
}
