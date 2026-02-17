import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppSession, User, OrganizationMember } from '../../common/entities';
import { WhatsAppSessionStatus, UserRole } from '../../common/enums';
import { EmailService } from '../email/email.service';
import { BaileysService } from './baileys.service';

interface SessionStatusCache {
  sessionId: string;
  lastStatus: 'connected' | 'disconnected' | 'connecting';
  lastChecked: Date;
  disconnectAlertSent: boolean;
  reconnectAlertSent: boolean;
  disconnectedAt: Date | null;
  // Track reconnection loop attempts
  reconnectAttempts: number;
  firstDisconnectAt: Date | null;
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
          reconnectAttempts: 0,
          firstDisconnectAt: dbSaysConnected ? null : new Date(),
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
        cache.firstDisconnectAt = new Date();
        cache.reconnectAttempts = 0;
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
        cache.firstDisconnectAt = null;
        cache.reconnectAttempts = 0;

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
    this.logger.log(`🔔 Preparing disconnection alert for session ${session.id} (${session.phoneNumber})`);
    this.logger.log(`   Organization ID: ${session.organizationId}`);
    this.logger.log(`   Session name: ${session.name}`);

    try {
      const recipients = await this.getSessionRecipients(session.organizationId);

      this.logger.log(`   Found ${recipients.length} recipient(s) for notification`);

      if (recipients.length === 0) {
        this.logger.warn(`❌ No recipients found for session ${session.id} disconnection alert - organizationId: ${session.organizationId}`);
        return;
      }

      for (const recipient of recipients) {
        this.logger.log(`   Sending alert to: ${recipient.email} (${recipient.firstName})`);

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
      this.logger.error(`Failed to send disconnection alert: ${error.message}`, error.stack);
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
    this.logger.log(`🔍 Looking for recipients for organizationId: ${organizationId}`);

    try {
      // Get admin and owner members of the organization
      const members = await this.orgMemberRepository.find({
        where: {
          organizationId,
          role: In([UserRole.OWNER, UserRole.ADMIN]),
        },
        relations: ['user'],
      });

      this.logger.log(`   Found ${members.length} admin/owner members`);
      members.forEach((m, i) => {
        this.logger.log(`   Member ${i + 1}: role=${m.role}, userId=${m.userId}, email=${m.user?.email || 'N/A'}`);
      });

      const users = members
        .map(m => m.user)
        .filter(u => u && u.email);

      // If no admins/owners, get any user from the organization
      if (users.length === 0) {
        this.logger.log(`   No admin/owner found, looking for any member...`);
        const anyMember = await this.orgMemberRepository.findOne({
          where: { organizationId },
          relations: ['user'],
        });
        this.logger.log(`   Any member found: ${anyMember ? `userId=${anyMember.userId}, email=${anyMember.user?.email}` : 'No'}`);
        if (anyMember?.user?.email) {
          return [anyMember.user];
        }
      }

      this.logger.log(`   Returning ${users.length} user(s) as recipients`);
      return users;

    } catch (error) {
      this.logger.error(`Error getting session recipients: ${error.message}`, error.stack);
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
   * Handle when a session needs QR code re-authentication
   * This means credentials are lost and manual intervention is required
   */
  @OnEvent('whatsapp.reconnect.needs.qr')
  async handleNeedsQRCode(data: { sessionId: string; message: string }): Promise<void> {
    const { sessionId } = data;

    this.logger.warn(`🔐 Session ${sessionId} requires QR code - credentials expired/lost`);

    try {
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

      if (!cache) {
        cache = {
          sessionId,
          lastStatus: 'disconnected',
          lastChecked: new Date(),
          disconnectAlertSent: false,
          reconnectAlertSent: false,
          disconnectedAt: new Date(),
          reconnectAttempts: 0,
          firstDisconnectAt: new Date(),
        };
      }

      // Send alert if not already sent
      if (!cache.disconnectAlertSent) {
        this.logger.log(`📧 Sending disconnection alert for session ${sessionId} (QR code required)`);

        cache.lastStatus = 'disconnected';
        cache.disconnectedAt = new Date();

        await this.sendDisconnectionAlert(session);
        cache.disconnectAlertSent = true;
        cache.reconnectAlertSent = false;

        this.sessionStatusCache.set(sessionId, cache);

        // Update session status in database
        await this.sessionRepository.update(sessionId, {
          status: WhatsAppSessionStatus.DISCONNECTED,
          isActive: false,
        });

        this.logger.log(`✅ Session ${sessionId} marked as disconnected and alert sent`);
      } else {
        this.logger.log(`Skipping alert for session ${sessionId} - already sent`);
      }

    } catch (error) {
      this.logger.error(`Error handling QR code needed for session ${sessionId}: ${error.message}`);
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

      // Check if this is a temporary disconnect that will auto-reconnect (428 = Connection Terminated by Server)
      const isTemporaryDisconnect = statusCode === 428;

      // For permanent disconnects, clean up cache immediately after handling
      const cleanupCacheAfter = isPermanentDisconnect;

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

        if (!cache) {
          // First time seeing this session - initialize cache
          cache = {
            sessionId,
            lastStatus: session.status === WhatsAppSessionStatus.CONNECTED ? 'connected' : 'disconnected',
            lastChecked: new Date(),
            disconnectAlertSent: false,
            reconnectAlertSent: false,
            disconnectedAt: null,
            reconnectAttempts: 0,
            firstDisconnectAt: null,
          };
        }

        // Track reconnection attempts for temporary disconnects (428)
        if (isTemporaryDisconnect) {
          cache.reconnectAttempts++;
          if (!cache.firstDisconnectAt) {
            cache.firstDisconnectAt = new Date();
          }

          // Calculate time since first disconnect
          const timeSinceFirstDisconnect = Date.now() - cache.firstDisconnectAt.getTime();
          const minutesSinceDisconnect = Math.floor(timeSinceFirstDisconnect / (1000 * 60));

          this.logger.log(`Session ${sessionId} reconnect attempt #${cache.reconnectAttempts}, ${minutesSinceDisconnect} minutes since first disconnect`);

          // Send alert if:
          // - More than 3 reconnect attempts AND more than 2 minutes have passed
          // - OR more than 5 minutes have passed regardless of attempts
          // - AND we haven't sent an alert yet
          const shouldSendAlertForReconnectLoop =
            !cache.disconnectAlertSent &&
            ((cache.reconnectAttempts >= 3 && minutesSinceDisconnect >= 2) || minutesSinceDisconnect >= 5);

          if (shouldSendAlertForReconnectLoop) {
            this.logger.log(`📧 Sending disconnection alert for session ${sessionId} after ${cache.reconnectAttempts} reconnect attempts over ${minutesSinceDisconnect} minutes`);

            cache.lastStatus = 'disconnected';
            cache.disconnectedAt = cache.firstDisconnectAt;

            await this.sendDisconnectionAlert(session);
            cache.disconnectAlertSent = true;
            cache.reconnectAlertSent = false;

            // Update session status in database
            await this.sessionRepository.update(sessionId, {
              status: WhatsAppSessionStatus.DISCONNECTED,
            });
          }

          this.sessionStatusCache.set(sessionId, cache);
          return;
        }

        // For permanent disconnects or first-time disconnects, use original logic
        const shouldSendAlert =
          !cache.disconnectAlertSent &&
          (cache.lastStatus === 'connected' || session.status === WhatsAppSessionStatus.CONNECTED);

        if (shouldSendAlert) {
          this.logger.log(`📧 Sending disconnection alert for session ${sessionId}`);

          cache.lastStatus = 'disconnected';
          cache.disconnectedAt = new Date();
          cache.firstDisconnectAt = new Date();
          cache.reconnectAttempts = 0;

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

        // Clean up cache for permanent disconnects to avoid stale entries
        if (cleanupCacheAfter) {
          this.sessionStatusCache.delete(sessionId);
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

        // Update cache - reset reconnect tracking
        if (cache) {
          cache.lastStatus = 'connected';
          cache.disconnectedAt = null;
          cache.reconnectAttempts = 0;
          cache.firstDisconnectAt = null;
          this.sessionStatusCache.set(sessionId, cache);
        } else {
          this.sessionStatusCache.set(sessionId, {
            sessionId,
            lastStatus: 'connected',
            lastChecked: new Date(),
            disconnectAlertSent: false,
            reconnectAlertSent: true,
            disconnectedAt: null,
            reconnectAttempts: 0,
            firstDisconnectAt: null,
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
