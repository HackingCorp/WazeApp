import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsAppSession, User, OrganizationMember } from '../../common/entities';
import { WhatsAppSessionStatus } from '../../common/enums';
import { EmailService } from '../email/email.service';
import { BaileysService } from './baileys.service';

interface SessionStatusCache {
  sessionId: string;
  lastStatus: 'connected' | 'disconnected' | 'connecting';
  lastChecked: Date;
  disconnectAlertSent: boolean;
  reconnectAlertSent: boolean;
  disconnectedAt: Date | null;
}

@Injectable()
export class WhatsAppSessionMonitorService {
  private readonly logger = new Logger(WhatsAppSessionMonitorService.name);
  private sessionStatusCache: Map<string, SessionStatusCache> = new Map();

  constructor(
    @InjectRepository(WhatsAppSession)
    private readonly sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private readonly orgMemberRepository: Repository<OrganizationMember>,
    private readonly emailService: EmailService,
    private readonly baileysService: BaileysService,
  ) {
    this.logger.log('WhatsApp Session Monitor Service initialized');
  }

  /**
   * Check WhatsApp sessions status every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSessionsStatus(): Promise<void> {
    this.logger.log('🔍 Checking WhatsApp sessions status...');

    try {
      // Get all sessions that should be monitored
      const sessions = await this.sessionRepository.find({
        where: { isActive: true },
        relations: ['organization'],
      });

      this.logger.log(`Found ${sessions.length} active sessions to monitor`);

      for (const session of sessions) {
        await this.checkSessionStatus(session);
      }

      // Clean up cache for deleted sessions
      this.cleanupCache(sessions.map(s => s.id));

    } catch (error) {
      this.logger.error(`Error checking sessions status: ${error.message}`);
    }
  }

  /**
   * Check individual session status
   */
  private async checkSessionStatus(session: WhatsAppSession): Promise<void> {
    try {
      const currentStatus = this.baileysService.getSessionStatus(session.id);
      const isConnected = currentStatus === 'connected';

      // Get or create cache entry
      let cache = this.sessionStatusCache.get(session.id);
      if (!cache) {
        cache = {
          sessionId: session.id,
          lastStatus: isConnected ? 'connected' : 'disconnected',
          lastChecked: new Date(),
          disconnectAlertSent: false,
          reconnectAlertSent: true, // Don't send reconnect alert on first check
          disconnectedAt: null,
        };
        this.sessionStatusCache.set(session.id, cache);
        return; // Skip first check to establish baseline
      }

      const previousStatus = cache.lastStatus;
      cache.lastChecked = new Date();

      // Status changed from connected to disconnected
      if (previousStatus === 'connected' && !isConnected) {
        this.logger.warn(`📵 Session ${session.id} (${session.phoneNumber}) DISCONNECTED`);
        cache.lastStatus = 'disconnected';
        cache.disconnectedAt = new Date();
        cache.disconnectAlertSent = false;
        cache.reconnectAlertSent = false;

        // Send disconnect alert
        await this.sendDisconnectionAlert(session);
        cache.disconnectAlertSent = true;

        // Update session status in database
        await this.sessionRepository.update(session.id, {
          status: WhatsAppSessionStatus.DISCONNECTED,
        });
      }
      // Status changed from disconnected to connected
      else if (previousStatus === 'disconnected' && isConnected) {
        this.logger.log(`✅ Session ${session.id} (${session.phoneNumber}) RECONNECTED`);
        cache.lastStatus = 'connected';

        // Send reconnection alert if disconnect alert was sent
        if (cache.disconnectAlertSent && !cache.reconnectAlertSent) {
          await this.sendReconnectionAlert(session, cache.disconnectedAt);
          cache.reconnectAlertSent = true;
        }

        cache.disconnectedAt = null;

        // Update session status in database
        await this.sessionRepository.update(session.id, {
          status: WhatsAppSessionStatus.CONNECTED,
          lastSeenAt: new Date(),
        });
      }
      // Still disconnected - check if we need to send reminder
      else if (!isConnected && cache.disconnectedAt) {
        const disconnectedMinutes = Math.floor(
          (Date.now() - cache.disconnectedAt.getTime()) / (1000 * 60)
        );

        // Send reminder every 30 minutes if still disconnected
        if (disconnectedMinutes > 0 && disconnectedMinutes % 30 === 0) {
          this.logger.warn(`📵 Session ${session.id} still disconnected for ${disconnectedMinutes} minutes`);
          // Optionally send reminder (disabled by default to avoid spam)
          // await this.sendDisconnectionReminder(session, disconnectedMinutes);
        }
      }

      // Update cache
      cache.lastStatus = isConnected ? 'connected' : 'disconnected';
      this.sessionStatusCache.set(session.id, cache);

    } catch (error) {
      this.logger.error(`Error checking session ${session.id}: ${error.message}`);
    }
  }

  /**
   * Send disconnection alert email to organization admins/owners
   */
  private async sendDisconnectionAlert(session: WhatsAppSession): Promise<void> {
    try {
      const recipients = await this.getSessionRecipients(session.organizationId);

      if (recipients.length === 0) {
        this.logger.warn(`No recipients found for session ${session.id} disconnection alert`);
        return;
      }

      for (const recipient of recipients) {
        await this.emailService.sendWhatsAppDisconnectionAlert(
          recipient.email,
          recipient.firstName || recipient.email.split('@')[0],
          {
            sessionName: session.name || session.phoneNumber || 'Session WhatsApp',
            phoneNumber: session.phoneNumber || 'Non défini',
            organizationName: session.organization?.name || 'Votre organisation',
            disconnectedAt: new Date(),
          },
        );

        this.logger.log(`📧 Disconnection alert sent to ${recipient.email} for session ${session.phoneNumber}`);
      }

    } catch (error) {
      this.logger.error(`Failed to send disconnection alert: ${error.message}`);
    }
  }

  /**
   * Send reconnection alert email to organization admins/owners
   */
  private async sendReconnectionAlert(
    session: WhatsAppSession,
    disconnectedAt: Date | null,
  ): Promise<void> {
    try {
      const recipients = await this.getSessionRecipients(session.organizationId);

      if (recipients.length === 0) {
        return;
      }

      const downtime = disconnectedAt
        ? Math.floor((Date.now() - disconnectedAt.getTime()) / (1000 * 60))
        : 0;

      for (const recipient of recipients) {
        await this.emailService.sendWhatsAppReconnectionAlert(
          recipient.email,
          recipient.firstName || recipient.email.split('@')[0],
          {
            sessionName: session.name || session.phoneNumber || 'Session WhatsApp',
            phoneNumber: session.phoneNumber || 'Non défini',
            organizationName: session.organization?.name || 'Votre organisation',
            reconnectedAt: new Date(),
            downtimeMinutes: downtime,
          },
        );

        this.logger.log(`📧 Reconnection alert sent to ${recipient.email} for session ${session.phoneNumber}`);
      }

    } catch (error) {
      this.logger.error(`Failed to send reconnection alert: ${error.message}`);
    }
  }

  /**
   * Get organization admins/owners to notify
   */
  private async getSessionRecipients(organizationId: string): Promise<User[]> {
    try {
      // Get admin and owner members of the organization
      const members = await this.orgMemberRepository.find({
        where: {
          organizationId,
          role: In(['owner', 'admin']),
        },
        relations: ['user'],
      });

      const users = members
        .map(m => m.user)
        .filter(u => u && u.email);

      // If no admins/owners, get any user from the organization
      if (users.length === 0) {
        const anyMember = await this.orgMemberRepository.findOne({
          where: { organizationId },
          relations: ['user'],
        });
        if (anyMember?.user?.email) {
          return [anyMember.user];
        }
      }

      return users;

    } catch (error) {
      this.logger.error(`Error getting session recipients: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up cache entries for deleted sessions
   */
  private cleanupCache(activeSessionIds: string[]): void {
    const cacheKeys = Array.from(this.sessionStatusCache.keys());
    for (const key of cacheKeys) {
      if (!activeSessionIds.includes(key)) {
        this.sessionStatusCache.delete(key);
      }
    }
  }

  /**
   * Get monitoring status for all sessions
   */
  getMonitoringStatus(): Array<{
    sessionId: string;
    status: string;
    lastChecked: Date;
    disconnectedAt: Date | null;
  }> {
    const status = [];
    for (const [sessionId, cache] of this.sessionStatusCache) {
      status.push({
        sessionId,
        status: cache.lastStatus,
        lastChecked: cache.lastChecked,
        disconnectedAt: cache.disconnectedAt,
      });
    }
    return status;
  }

  /**
   * Force check a specific session
   */
  async forceCheckSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['organization'],
    });

    if (session) {
      await this.checkSessionStatus(session);
    }
  }
}
