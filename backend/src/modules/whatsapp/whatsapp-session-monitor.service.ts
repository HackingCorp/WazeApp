import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
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
      // Get all sessions that have been used (have a phone number)
      // This includes both active and inactive sessions to detect disconnections
      const sessions = await this.sessionRepository
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.organization', 'organization')
        .where('session.phoneNumber IS NOT NULL')
        .andWhere("session.phoneNumber != ''")
        .getMany();

      this.logger.log(`Found ${sessions.length} sessions to monitor`);

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
        // First time checking this session - use DB status as baseline
        // If DB says connected but Baileys says disconnected, send alert
        const dbSaysConnected = session.status === WhatsAppSessionStatus.CONNECTED;

        cache = {
          sessionId: session.id,
          lastStatus: dbSaysConnected ? 'connected' : 'disconnected',
          lastChecked: new Date(),
          disconnectAlertSent: !dbSaysConnected, // If already disconnected in DB, assume alert was sent
          reconnectAlertSent: true, // Don't send reconnect alert on first check
          disconnectedAt: dbSaysConnected ? null : new Date(),
        };
        this.sessionStatusCache.set(session.id, cache);

        // If DB says connected but actually disconnected, this is a newly detected disconnection
        if (dbSaysConnected && !isConnected) {
          this.logger.warn(`📵 Session ${session.id} (${session.phoneNumber}) detected DISCONNECTED on first check`);
          cache.lastStatus = 'disconnected';
          cache.disconnectedAt = new Date();

          // Send disconnect alert
          await this.sendDisconnectionAlert(session);
          cache.disconnectAlertSent = true;

          // Update session status in database
          await this.sessionRepository.update(session.id, {
            status: WhatsAppSessionStatus.DISCONNECTED,
          });
        }
        return;
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
  async sendDisconnectionAlert(session: WhatsAppSession): Promise<void> {
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
  async sendReconnectionAlert(
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

  /**
   * Handle real-time connection updates from Baileys
   * This is the primary method for detecting disconnections instantly
   */
  @OnEvent('whatsapp.connection.update')
  async handleConnectionUpdate(data: { sessionId: string; update: any }): Promise<void> {
    const { sessionId, update } = data;
    const { connection, lastDisconnect } = update;

    this.logger.log(`📡 Monitor received connection update for session ${sessionId}: ${connection}`);

    // Only handle close (disconnection) events
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Unknown reason';

      this.logger.warn(`📵 Session ${sessionId} disconnected - Status: ${statusCode}, Reason: ${reason}`);

      // Check if this is a permanent disconnection (logout or conflict)
      // Status codes: 401 = logged out, 403 = conflict (same session on another device), 515 = restart required
      const isPermanentDisconnect = statusCode === 401 || statusCode === 403;

      try {
        // Get the session from database
        const session = await this.sessionRepository.findOne({
          where: { id: sessionId },
          relations: ['organization'],
        });

        if (!session) {
          this.logger.warn(`Session ${sessionId} not found in database`);
          return;
        }

        // Get or create cache entry
        let cache = this.sessionStatusCache.get(sessionId);

        // Only send alert if:
        // 1. Cache doesn't exist (first time seeing this session) and session was previously connected
        // 2. OR Cache exists and last status was 'connected' and we haven't sent disconnect alert yet
        const shouldSendAlert =
          (!cache && session.status === WhatsAppSessionStatus.CONNECTED) ||
          (cache && cache.lastStatus === 'connected' && !cache.disconnectAlertSent);

        if (shouldSendAlert) {
          this.logger.log(`📧 Sending disconnection alert for session ${sessionId}`);

          // Update or create cache
          if (!cache) {
            cache = {
              sessionId,
              lastStatus: 'disconnected',
              lastChecked: new Date(),
              disconnectAlertSent: false,
              reconnectAlertSent: false,
              disconnectedAt: new Date(),
            };
          } else {
            cache.lastStatus = 'disconnected';
            cache.disconnectedAt = new Date();
          }

          // Send the alert
          await this.sendDisconnectionAlert(session);
          cache.disconnectAlertSent = true;
          cache.reconnectAlertSent = false;

          this.sessionStatusCache.set(sessionId, cache);

          // Update session status in database
          await this.sessionRepository.update(sessionId, {
            status: WhatsAppSessionStatus.DISCONNECTED,
          });
        } else {
          this.logger.log(`Skipping alert for session ${sessionId} - already sent or not previously connected`);
        }

      } catch (error) {
        this.logger.error(`Error handling connection update for session ${sessionId}: ${error.message}`);
      }
    }
    // Handle successful connection (open)
    else if (connection === 'open') {
      this.logger.log(`✅ Session ${sessionId} connected`);

      try {
        const session = await this.sessionRepository.findOne({
          where: { id: sessionId },
          relations: ['organization'],
        });

        if (!session) {
          return;
        }

        const cache = this.sessionStatusCache.get(sessionId);

        // Send reconnection alert if we previously sent a disconnect alert
        if (cache && cache.disconnectAlertSent && !cache.reconnectAlertSent) {
          this.logger.log(`📧 Sending reconnection alert for session ${sessionId}`);
          await this.sendReconnectionAlert(session, cache.disconnectedAt);
          cache.reconnectAlertSent = true;
        }

        // Update cache
        if (cache) {
          cache.lastStatus = 'connected';
          cache.disconnectedAt = null;
          this.sessionStatusCache.set(sessionId, cache);
        } else {
          this.sessionStatusCache.set(sessionId, {
            sessionId,
            lastStatus: 'connected',
            lastChecked: new Date(),
            disconnectAlertSent: false,
            reconnectAlertSent: true,
            disconnectedAt: null,
          });
        }

        // Update session status in database
        await this.sessionRepository.update(sessionId, {
          status: WhatsAppSessionStatus.CONNECTED,
          lastSeenAt: new Date(),
        });

      } catch (error) {
        this.logger.error(`Error handling reconnection for session ${sessionId}: ${error.message}`);
      }
    }
  }
}
