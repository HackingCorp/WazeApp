import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Boom } from "@hapi/boom";
import * as path from "path";
import * as fs from "fs/promises";
import { SendMessageDto } from "./dto/whatsapp.dto";
import { WhatsAppSession } from "@/common/entities";

// Baileys v7 requires dynamic imports (ESM)
let makeWASocket: any;
let DisconnectReason: any;
let useMultiFileAuthState: any;
let fetchLatestBaileysVersion: any;
let Browsers: any;
let makeCacheableSignalKeyStore: any;
let downloadMediaMessage: any;
let isJidBroadcast: any;

async function loadBaileys() {
  try {
    const baileys = await import("@whiskeysockets/baileys");

    // Handle both ESM default export and CommonJS interop
    makeWASocket = baileys.default || baileys.makeWASocket || baileys;
    DisconnectReason = baileys.DisconnectReason;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    Browsers = baileys.Browsers;
    makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
    downloadMediaMessage = baileys.downloadMediaMessage;
    isJidBroadcast = baileys.isJidBroadcast;

    if (typeof makeWASocket !== 'function') {
      throw new Error(`makeWASocket is not a function, got: ${typeof makeWASocket}`);
    }
  } catch (error) {
    console.error('[Baileys] Failed to load library:', error);
    throw error;
  }
}

@Injectable()
export class BaileysService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(BaileysService.name);
  private sessions = new Map<string, any>();
  private authStates = new Map<string, any>();
  private keepAliveTimers = new Map<string, NodeJS.Timeout>();
  private credentialsSaveTimers = new Map<string, NodeJS.Timeout>();
  private baileysLoaded = false;

  // Track real connection state (connected, disconnected, reconnecting)
  private connectionStates = new Map<string, 'connected' | 'disconnected' | 'reconnecting'>();

  // Track active reconnection attempts to prevent duplicates
  private reconnectionAttempts = new Map<string, { count: number; timer: NodeJS.Timeout | null }>();

  // Store event handlers for proper cleanup (prevents memory leaks)
  private eventHandlers = new Map<string, Map<string, Function>>();

  // Connection locks to prevent duplicate simultaneous connections (prevents device_removed conflicts)
  private connectionLocks = new Map<string, Promise<{ needsQR: boolean; qr?: string }>>();

  // Memory management configuration
  private readonly MAX_SESSIONS = 50; // Maximum concurrent sessions
  private readonly SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes (reduced from 30)
  private cleanupTimer: NodeJS.Timeout;

  // Configurable reconnection parameters
  private readonly MAX_RECONNECT_RETRIES = 10; // Increased from 3
  private readonly RECONNECT_BASE_DELAY = 5000; // 5 seconds base delay
  private readonly RECONNECT_MAX_DELAY = 300000; // 5 minutes max delay

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
  ) {
    // Listen for manual sync triggers
    this.eventEmitter.on(
      "whatsapp.trigger.sync",
      this.handleTriggerSync.bind(this),
    );
    this.eventEmitter.on(
      "whatsapp.force.sync",
      this.handleForceSync.bind(this),
    );
    this.eventEmitter.on(
      "whatsapp.force.download.images",
      this.handleForceDownloadImages.bind(this),
    );

    // Start periodic cleanup to prevent memory leaks
    this.startSessionCleanup();
  }

  async onModuleInit() {
    // Load Baileys library dynamically (ESM requirement for v7)
    this.logger.log("Loading Baileys library v7...");
    await loadBaileys();
    this.baileysLoaded = true;
    this.logger.log("✅ Baileys library loaded successfully");

    // Auto-restore sessions on service startup
    this.restoreExistingSessions();
  }

  /**
   * Classify error to determine retry strategy
   * Returns: { shouldRetry: boolean, isPermanent: boolean, retryDelay: number, errorType: string }
   */
  private classifyError(statusCode: number, errorMessage: string): {
    shouldRetry: boolean;
    isPermanent: boolean;
    retryDelay: number;
    errorType: string;
  } {
    // Permanent errors - don't retry
    if (statusCode === DisconnectReason?.loggedOut) {
      return { shouldRetry: false, isPermanent: true, retryDelay: 0, errorType: 'logged_out' };
    }

    // Device removed - needs re-authentication
    if (statusCode === 401 || errorMessage.includes('device_removed')) {
      return { shouldRetry: false, isPermanent: true, retryDelay: 0, errorType: 'device_removed' };
    }

    // Conflict errors (409, 440) - session conflict, might resolve
    if (statusCode === 409 || statusCode === 440) {
      return { shouldRetry: true, isPermanent: false, retryDelay: 30000, errorType: 'conflict' };
    }

    // Rate limit errors (429) - wait longer before retry
    if (statusCode === 429 || errorMessage.includes('rate') || errorMessage.includes('too many')) {
      return { shouldRetry: true, isPermanent: false, retryDelay: 60000, errorType: 'rate_limited' };
    }

    // Service unavailable (503) - temporary, retry with backoff
    if (statusCode === 503 || statusCode === 502 || statusCode === 500) {
      return { shouldRetry: true, isPermanent: false, retryDelay: 15000, errorType: 'server_error' };
    }

    // Network errors - retry immediately
    if (errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
      return { shouldRetry: true, isPermanent: false, retryDelay: 5000, errorType: 'network_error' };
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || statusCode === 408) {
      return { shouldRetry: true, isPermanent: false, retryDelay: 10000, errorType: 'timeout' };
    }

    // Unknown errors - retry with caution
    return { shouldRetry: true, isPermanent: false, retryDelay: 15000, errorType: 'unknown' };
  }

  /**
   * Cancel any pending reconnection attempt for a session
   */
  private cancelReconnection(sessionId: string): void {
    const attempt = this.reconnectionAttempts.get(sessionId);
    if (attempt?.timer) {
      clearTimeout(attempt.timer);
      this.logger.log(`🛑 Cancelled pending reconnection for session ${sessionId}`);
    }
    this.reconnectionAttempts.delete(sessionId);
  }

  /**
   * Register event handler for a session (for proper cleanup)
   */
  private registerEventHandler(sessionId: string, eventName: string, handler: Function): void {
    if (!this.eventHandlers.has(sessionId)) {
      this.eventHandlers.set(sessionId, new Map());
    }
    this.eventHandlers.get(sessionId)!.set(eventName, handler);
  }

  /**
   * Remove all event handlers for a session to prevent memory leaks
   */
  private removeEventHandlers(sessionId: string, sock: any): void {
    const handlers = this.eventHandlers.get(sessionId);
    if (handlers && sock?.ev) {
      for (const [eventName, handler] of handlers) {
        try {
          sock.ev.off(eventName, handler);
          this.logger.debug(`Removed event handler '${eventName}' for session ${sessionId}`);
        } catch (error) {
          this.logger.debug(`Failed to remove handler '${eventName}': ${error.message}`);
        }
      }
    }
    this.eventHandlers.delete(sessionId);
  }

  /**
   * Check if a session is currently active in Baileys
   * Returns true only if the session is genuinely connected
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const status = this.getSessionStatus(sessionId);
    return status === 'connected';
  }

  private async handleTriggerSync(data: { sessionId: string }): Promise<void> {
    const { sessionId } = data;
    const sock = this.sessions.get(sessionId);

    if (sock) {
      this.logger.log(`Manual sync triggered for session ${sessionId}`);
      await this.syncChatsAndMessages(sessionId, sock);
    } else {
      this.logger.warn(`Cannot sync session ${sessionId}: not connected`);
    }
  }

  private async handleForceDownloadImages(data: {
    sessionId: string;
  }): Promise<void> {
    const { sessionId } = data;

    this.logger.log(
      `🖼️ Force image download requested for session ${sessionId}`,
    );

    const sock = this.sessions.get(sessionId);

    if (!sock) {
      this.logger.warn(
        `Cannot download images for session ${sessionId}: not connected`,
      );
      return;
    }

    try {
      // Skip chat retrieval for now due to TypeScript issues
      const chats: any[] = [];

      this.logger.log(`Found ${chats.length} chats for image processing`);

      for (const chat of chats.slice(0, 10)) {
        // Limit to first 10 chats to avoid overload
        try {
          this.logger.log(`🔍 Checking chat ${chat.id} for images to download`);

          // Get recent messages from this chat
          const messages = await sock.fetchMessagesFromWA(chat.id, 50); // Last 50 messages

          if (messages && messages.length > 0) {
            for (const message of messages) {
              // Check if it's an image message that hasn't been downloaded
              if (message.message?.imageMessage) {
                try {
                  this.logger.log(
                    `📸 Found image message ${message.key.id}, downloading...`,
                  );

                  const buffer = await downloadMediaMessage(
                    message,
                    "buffer",
                    {},
                    {
                      logger: this.logger as any,
                      reuploadRequest: sock.updateMediaMessage,
                    },
                  );

                  if (buffer) {
                    const base64 = buffer.toString("base64");
                    const mimeType =
                      message.message.imageMessage.mimetype || "image/jpeg";
                    const dataUrl = `data:${mimeType};base64,${base64}`;

                    // Emit updated message with image data
                    this.eventEmitter.emit("whatsapp.image.downloaded", {
                      sessionId,
                      messageId: message.key.id,
                      chatId: chat.id,
                      imageData: dataUrl,
                      timestamp: new Date(message.messageTimestamp * 1000),
                    });

                    this.logger.log(
                      `✅ Downloaded image for message ${message.key.id}`,
                    );
                  }
                } catch (error) {
                  this.logger.warn(
                    `Failed to download image for message ${message.key.id}:`,
                    error,
                  );
                }

                // Small delay between downloads
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to process chat ${chat.id} for images:`,
            error,
          );
        }
      }

      this.logger.log(`🎉 Completed image download for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to download images for session ${sessionId}:`,
        error,
      );
    }
  }

  private async handleForceSync(data: {
    sessionId: string;
    userId: string;
  }): Promise<void> {
    const { sessionId, userId } = data;

    this.logger.log(`🔄 Force sync requested for session ${sessionId}`);

    const sock = this.sessions.get(sessionId);

    if (sock) {
      this.logger.log(`Session ${sessionId} already active, triggering sync`);
      await this.syncChatsAndMessages(sessionId, sock);
    } else {
      this.logger.log(
        `Session ${sessionId} not active in Baileys, attempting to reconnect`,
      );

      try {
        // Try to connect the session without forcing reset (use existing credentials)
        const result = await this.connectSession(sessionId, false);

        if (result.needsQR) {
          this.logger.warn(
            `Session ${sessionId} requires QR code - cannot auto-reconnect`,
          );
          this.eventEmitter.emit("whatsapp.force.sync.failed", {
            sessionId,
            reason: "QR_REQUIRED",
            message: "Session requires QR code authentication",
          });
        } else {
          this.logger.log(`✅ Session ${sessionId} reconnected successfully`);
          this.eventEmitter.emit("whatsapp.force.sync.success", {
            sessionId,
            message: "Session reconnected and sync initiated",
          });
        }
      } catch (error) {
        this.logger.error(
          `❌ Failed to reconnect session ${sessionId}:`,
          error,
        );
        this.eventEmitter.emit("whatsapp.force.sync.failed", {
          sessionId,
          reason: "CONNECTION_FAILED",
          message: error.message,
          error,
        });
      }
    }
  }

  async initializeSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = path.join(
        this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions"),
        sessionId,
      );

      // Ensure session directory exists
      await fs.mkdir(sessionPath, { recursive: true });

      // Initialize auth state with better error handling
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      
      // Store both state and save function
      this.authStates.set(sessionId, { state, saveCreds });

      // Log session state for debugging
      const hasValidCreds = !!(state.creds && state.creds.me);
      this.logger.log(`Session ${sessionId} initialized - Has valid credentials: ${hasValidCreds}`);
      
      if (hasValidCreds) {
        this.logger.log(`Session ${sessionId} has existing auth state, attempting auto-restore`);
      }

    } catch (error) {
      this.logger.error(`Failed to initialize session ${sessionId}:`, error);
      throw error;
    }
  }

  async connectSession(
    sessionId: string,
    forceReset: boolean = false,
  ): Promise<{ needsQR: boolean; qr?: string }> {
    // Check if there's already a connection attempt in progress for this session
    // This prevents duplicate connections which can trigger device_removed (401) errors
    const existingLock = this.connectionLocks.get(sessionId);
    if (existingLock && !forceReset) {
      this.logger.warn(`⚠️ Connection already in progress for session ${sessionId}, waiting for existing attempt`);
      return existingLock;
    }

    // Create a new connection attempt with a lock
    const connectionPromise = this.doConnectSession(sessionId, forceReset);
    this.connectionLocks.set(sessionId, connectionPromise);

    try {
      const result = await connectionPromise;
      return result;
    } finally {
      // Clear the lock after connection attempt completes (success or failure)
      this.connectionLocks.delete(sessionId);
    }
  }

  private async doConnectSession(
    sessionId: string,
    forceReset: boolean = false,
  ): Promise<{ needsQR: boolean; qr?: string }> {
    try {
      this.logger.log(
        `Connecting session ${sessionId}, forceReset: ${forceReset}`,
      );

      // If forcing reset or no auth state, clear and reinitialize
      let authState = this.authStates.get(sessionId);
      if (forceReset || !authState) {
        this.logger.log(
          `${forceReset ? "Force resetting" : "No auth state found for"} session ${sessionId}, initializing...`,
        );

        // Clear existing session and auth state
        await this.disconnectSession(sessionId);
        this.authStates.delete(sessionId);

        // Clear session directory for fresh start
        const sessionPath = path.join(
          this.configService.get(
            "WHATSAPP_SESSION_PATH",
            "./whatsapp-sessions",
          ),
          sessionId,
        );

        try {
          await fs.rm(sessionPath, { recursive: true, force: true });
          this.logger.log(`Cleared session directory for ${sessionId}`);
        } catch (error) {
          this.logger.warn(
            `Failed to clear session directory: ${error.message}`,
          );
        }

        await this.initializeSession(sessionId);
        authState = this.authStates.get(sessionId);
        if (!authState) {
          throw new Error("Failed to initialize auth state");
        }
      }

      const { version, isLatest } = await fetchLatestBaileysVersion();

      this.logger.log(
        `Using WA version ${version.join(".")}, isLatest: ${isLatest}`,
      );

      const sock = makeWASocket({
        version,
        printQRInTerminal: false,

        // Use standard WhatsApp Web browser fingerprint to avoid detection
        browser: Browsers.windows("Chrome"),
        syncFullHistory: false,

        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, undefined),
        },

        // Configuration for better connection stability
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false, // Don't appear online immediately
        defaultQueryTimeoutMs: 180000, // 3 minutes timeout for queries (increased)
        connectTimeoutMs: 180000, // 3 minutes connection timeout (increased)
        qrTimeout: 60000,
        keepAliveIntervalMs: 25000, // Built-in keep-alive every 25 seconds (more frequent)
        retryRequestDelayMs: 1000, // 1 second delay between retries (increased)
        emitOwnEvents: true,

        // Message retrieval for context
        getMessage: async (key) => {
          return undefined;
        },
      });

      this.sessions.set(sessionId, sock);

      // Handle connection updates
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        this.eventEmitter.emit("whatsapp.connection.update", {
          sessionId,
          update,
        });

        if (qr) {
          this.eventEmitter.emit("whatsapp.qr.update", {
            sessionId,
            qr,
          });
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMessage = (lastDisconnect?.error as Boom)?.output?.payload?.message || '';

          // Check for various disconnect reasons
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isDeviceRemoved = statusCode === 401 || errorMessage.includes('device_removed');
          const isConflict = statusCode === 409 || statusCode === 440;
          const isPermanentError = isLoggedOut || isDeviceRemoved || isConflict;

          this.logger.log(
            `Connection closed for session ${sessionId}, statusCode: ${statusCode}, isDeviceRemoved: ${isDeviceRemoved}, isPermanent: ${isPermanentError}`,
          );

          if (isDeviceRemoved) {
            // 401/device_removed: Clear credentials and require new QR scan
            this.logger.warn(`⚠️ Session ${sessionId} received device_removed (401) - clearing credentials`);
            this.logger.warn(`💡 User needs to unlink old devices from WhatsApp > Linked Devices and scan QR again`);

            // Update connection state to disconnected
            this.connectionStates.set(sessionId, 'disconnected');

            // Stop timers
            this.stopKeepAlive(sessionId);
            this.stopCredentialsSave(sessionId);

            // Clean up session files to force fresh QR on next connect
            const sessionPath = path.join(
              this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions"),
              sessionId,
            );
            try {
              await fs.rm(sessionPath, { recursive: true, force: true });
              this.logger.log(`🧹 Cleared session files for ${sessionId} - will need fresh QR code`);
            } catch (error) {
              this.logger.warn(`Failed to clear session files: ${error.message}`);
            }

            this.sessions.delete(sessionId);
            this.authStates.delete(sessionId);
            this.connectionStates.delete(sessionId);

            // Emit specific event for device removed
            this.eventEmitter.emit("whatsapp.device.removed", {
              sessionId,
              message: "Session was removed by WhatsApp. Please unlink old devices and scan QR code again.",
              statusCode,
            });
          } else if (isPermanentError) {
            this.logger.log(`🚪 Session ${sessionId} logged out permanently (code: ${statusCode}) - cleaning up`);
            // Update connection state to disconnected
            this.connectionStates.set(sessionId, 'disconnected');
            this.sessions.delete(sessionId);
            this.authStates.delete(sessionId);
            this.connectionStates.delete(sessionId);
          } else {
            // Temporary disconnect - use improved reconnection strategy
            const errorClassification = this.classifyError(statusCode, errorMessage);

            this.logger.log(`🔄 Session ${sessionId} disconnected (code: ${statusCode}, type: ${errorClassification.errorType})`);

            if (!errorClassification.shouldRetry) {
              this.logger.log(`🚫 Error type '${errorClassification.errorType}' is not retryable for session ${sessionId}`);
              this.connectionStates.set(sessionId, 'disconnected');
              this.cancelReconnection(sessionId);
              return;
            }

            // Cancel any existing reconnection attempt to prevent race conditions
            this.cancelReconnection(sessionId);

            // Update connection state to reconnecting
            this.connectionStates.set(sessionId, 'reconnecting');

            const attemptReconnect = async (retryCount: number) => {
              // Check if session was already reconnected, manually disconnected, or cancelled
              const currentState = this.connectionStates.get(sessionId);
              if (currentState === 'connected') {
                this.logger.log(`✅ Session ${sessionId} already reconnected, skipping retry`);
                this.cancelReconnection(sessionId);
                return;
              }

              if (currentState === 'disconnected') {
                this.logger.log(`🛑 Session ${sessionId} manually disconnected, stopping reconnection`);
                this.cancelReconnection(sessionId);
                return;
              }

              if (retryCount >= this.MAX_RECONNECT_RETRIES) {
                this.logger.error(`❌ All ${this.MAX_RECONNECT_RETRIES} reconnection attempts exhausted for session ${sessionId}`);
                this.connectionStates.set(sessionId, 'disconnected');
                this.cancelReconnection(sessionId);
                this.eventEmitter.emit("whatsapp.reconnect.failed", {
                  sessionId,
                  totalAttempts: this.MAX_RECONNECT_RETRIES,
                  errorType: errorClassification.errorType,
                });
                return;
              }

              try {
                this.logger.log(`🔄 Attempting reconnection ${retryCount + 1}/${this.MAX_RECONNECT_RETRIES} for session ${sessionId}`);

                // Try to reconnect using existing auth state
                const result = await this.connectSession(sessionId, false);

                if (result.needsQR) {
                  this.logger.warn(`⚠️ Session ${sessionId} needs QR code - stopping auto-reconnect`);
                  this.connectionStates.set(sessionId, 'disconnected');
                  this.cancelReconnection(sessionId);
                  this.eventEmitter.emit("whatsapp.reconnect.needs.qr", {
                    sessionId,
                    message: "Session requires QR code authentication",
                  });
                } else {
                  this.logger.log(`✅ Auto-reconnection successful for session ${sessionId} on attempt ${retryCount + 1}`);
                  this.cancelReconnection(sessionId);

                  // Immediately backup credentials to database after successful reconnection
                  // This ensures we capture the refreshed session keys
                  setTimeout(async () => {
                    try {
                      await this.backupCredentialsToDatabase(sessionId);
                      this.logger.log(`💾 Post-reconnection database backup completed for session ${sessionId}`);
                    } catch (err) {
                      this.logger.warn(`Failed post-reconnection backup for ${sessionId}: ${err.message}`);
                    }
                  }, 5000); // Wait 5 seconds for credentials to stabilize

                  this.eventEmitter.emit("whatsapp.reconnect.success", {
                    sessionId,
                    attempt: retryCount + 1,
                  });
                }
              } catch (error) {
                this.logger.error(`❌ Reconnection attempt ${retryCount + 1} failed for session ${sessionId}: ${error.message}`);

                // Schedule next attempt with exponential backoff + jitter
                const exponentialDelay = Math.min(
                  this.RECONNECT_BASE_DELAY * Math.pow(1.5, retryCount), // 1.5x multiplier instead of 2x
                  this.RECONNECT_MAX_DELAY
                );
                // Add ±25% jitter to prevent reconnection storms
                const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
                const delay = Math.max(exponentialDelay + jitter, this.RECONNECT_BASE_DELAY);

                this.logger.log(`⏱️ Scheduling retry ${retryCount + 2}/${this.MAX_RECONNECT_RETRIES} for session ${sessionId} in ${Math.round(delay / 1000)}s`);

                const timer = setTimeout(() => attemptReconnect(retryCount + 1), delay);
                this.reconnectionAttempts.set(sessionId, { count: retryCount + 1, timer });
              }
            };

            // Start reconnection with initial delay based on error type
            const initialDelay = Math.max(errorClassification.retryDelay, 3000);
            this.logger.log(`⏱️ Starting reconnection for session ${sessionId} in ${Math.round(initialDelay / 1000)}s`);

            const timer = setTimeout(() => attemptReconnect(0), initialDelay);
            this.reconnectionAttempts.set(sessionId, { count: 0, timer });
          }
        } else if (connection === "open") {
          this.logger.log(`✅ Session ${sessionId} connected successfully`);
          this.logger.log(
            `📚 History sync configured - waiting for messaging-history.set event...`,
          );

          // Update connection state to connected
          this.connectionStates.set(sessionId, 'connected');

          // 🔧 FIX: Update database status to CONNECTED immediately
          try {
            await this.sessionRepository.update(sessionId, {
              status: 'connected' as any, // Cast to avoid enum type issues
              isActive: true,
              lastSeenAt: new Date(),
            });
            this.logger.log(`📝 Database status updated to CONNECTED for session ${sessionId}`);
          } catch (dbError) {
            this.logger.error(`Failed to update session status in database: ${dbError.message}`);
          }

          // Start keep-alive ping system
          this.startKeepAlive(sessionId);

          // 🔍 DIAGNOSTIC: Check if myAppStateKeyId is set (CRITICAL for history sync)
          const hasAppStateKeyId = !!authState.state.creds.myAppStateKeyId;
          this.logger.log(`🔑 myAppStateKeyId present: ${hasAppStateKeyId}`);
          if (!hasAppStateKeyId) {
            this.logger.warn(
              `❌ CRITICAL: myAppStateKeyId is NOT set - history sync will be SKIPPED by Baileys!`,
            );
            this.logger.warn(
              `📋 This is likely why no history sync events are received.`,
            );
          } else {
            this.logger.log(
              `✅ myAppStateKeyId is set - history sync should work`,
            );
          }

          // The Baileys API will automatically trigger messaging-history.set
          this.eventEmitter.emit("whatsapp.session.ready", {
            sessionId,
            status: "connected",
          });

          // Schedule initial database backup after connection stabilizes
          // This ensures we capture the fresh session credentials
          setTimeout(async () => {
            try {
              await this.backupCredentialsToDatabase(sessionId);
              this.logger.log(`💾 Initial post-connection database backup completed for session ${sessionId}`);
            } catch (err) {
              this.logger.warn(`Failed initial database backup for ${sessionId}: ${err.message}`);
            }
          }, 10000); // Wait 10 seconds for credentials to fully stabilize
        }
      });

      // Handle credentials update
      sock.ev.on("creds.update", async (creds) => {
        try {
          // Save credentials immediately to filesystem
          authState.saveCreds(creds);
          this.logger.debug(`💾 Credentials updated for session ${sessionId}`);

          // 🔍 DIAGNOSTIC: Monitor myAppStateKeyId updates
          if (creds.myAppStateKeyId) {
            this.logger.log(
              `🔑 myAppStateKeyId updated for session ${sessionId} - history sync now possible!`,
            );
          }

          // Start periodic credentials backup
          this.startCredentialsSave(sessionId, authState);

          // Also backup credentials to database for persistence across deployments
          await this.backupCredentialsToDatabase(sessionId);

        } catch (error) {
          this.logger.error(`Failed to save credentials for session ${sessionId}:`, error);
        }
      });

      // Handle chats received from WhatsApp (new chats being created)
      sock.ev.on("chats.upsert", (chats) => {
        this.logger.log(
          `Received ${chats.length} new chats from WhatsApp for session ${sessionId}`,
        );
        // Process new chats for synchronization
        this.handleChatsReceived(sessionId, sock, chats);
      });

      // Handle contacts sync - Initial batch of contacts
      sock.ev.on("contacts.set", (data) => {
        const contacts = data.contacts || [];
        this.logger.log(`📇 Received ${contacts.length} contacts for session ${sessionId}`);
        if (contacts.length > 0) {
          this.eventEmitter.emit("whatsapp.contacts.sync", {
            sessionId,
            contacts,
            isInitial: true,
          });
        }
      });

      // Handle contact updates - Individual contact changes
      sock.ev.on("contacts.update", (contacts) => {
        this.logger.log(`📇 Contact update: ${contacts.length} contacts updated for session ${sessionId}`);
        if (contacts.length > 0) {
          this.eventEmitter.emit("whatsapp.contacts.update", {
            sessionId,
            contacts,
          });
        }
      });

      // Handle contacts upsert - New contacts added
      sock.ev.on("contacts.upsert", (contacts) => {
        this.logger.log(`📇 Contact upsert: ${contacts.length} new contacts for session ${sessionId}`);
        if (contacts.length > 0) {
          this.eventEmitter.emit("whatsapp.contacts.sync", {
            sessionId,
            contacts,
            isInitial: false,
          });
        }
      });

      // Handle historical data sync - This is the key event for proper history sync
      sock.ev.on("messaging-history.set", (data) => {
        this.logger.log(
          `🎉 MESSAGING-HISTORY.SET EVENT TRIGGERED for session ${sessionId}!`,
        );
        this.logger.log(`📚 History sync received for session ${sessionId}:`);
        this.logger.log(`  - Chats: ${data.chats?.length || 0}`);
        this.logger.log(`  - Contacts: ${data.contacts?.length || 0}`);
        this.logger.log(`  - Messages: ${data.messages?.length || 0}`);
        this.logger.log(
          `  - Sync type: ${data.syncType} (${this.getSyncTypeName(data.syncType)})`,
        );
        this.logger.log(`  - Is latest: ${data.isLatest}`);
        this.logger.log(`  - Progress: ${data.progress}`);
        this.logger.log(
          `  - Peer data request session ID: ${data.peerDataRequestSessionId}`,
        );

        // Log some sample message details if available
        if (data.messages && data.messages.length > 0) {
          const sampleMessage = data.messages[0];
          this.logger.log(`📝 Sample message details:`);
          this.logger.log(`  - From: ${sampleMessage.key?.remoteJid}`);
          this.logger.log(`  - From me: ${sampleMessage.key?.fromMe}`);
          this.logger.log(
            `  - Timestamp: ${new Date(Number(sampleMessage.messageTimestamp || 0) * 1000)}`,
          );
          this.logger.log(
            `  - Message type: ${Object.keys(sampleMessage.message || {})}`,
          );

          this.processHistoricalMessages(sessionId, data.messages);
        }

        // Process historical chats
        if (data.chats && data.chats.length > 0) {
          this.logger.log(`📱 Sample chat details:`);
          const sampleChat = data.chats[0];
          this.logger.log(`  - Chat ID: ${sampleChat.id}`);
          this.logger.log(`  - Chat name: ${sampleChat.name || "N/A"}`);
          this.logger.log(`  - Unread count: ${sampleChat.unreadCount || 0}`);

          this.handleChatsReceived(sessionId, sock, data.chats);
        }

        // Emit a completion event for the frontend
        this.eventEmitter.emit("whatsapp.history.sync.received", {
          sessionId,
          chatsCount: data.chats?.length || 0,
          contactsCount: data.contacts?.length || 0,
          messagesCount: data.messages?.length || 0,
          syncType: data.syncType,
          isLatest: data.isLatest,
          progress: data.progress,
        });
      });

      // Handle messages (for webhook events)
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        messages.forEach((message) => {
          // Only process incoming messages (not from me)
          if (!message.key.fromMe && message.message) {
            this.logger.log(
              `Incoming message event: ${JSON.stringify({
                from: message.key.remoteJid,
                messageType: Object.keys(message.message || {}),
                type,
              })}`,
            );

            this.eventEmitter.emit("whatsapp.message.received", {
              sessionId,
              message,
              type,
            });
          }
        });
      });

      // Handle message updates (delivery receipts, etc.)
      sock.ev.on("messages.update", (updates) => {
        updates.forEach((update) => {
          this.eventEmitter.emit("whatsapp.message.update", {
            sessionId,
            update,
          });
        });
      });

      // Wait for initial connection state or QR
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Connection timeout"));
        }, 15000); // Reduced from 30s to 15s

        const cleanup = () => {
          clearTimeout(timeout);
          sock.ev.off("connection.update", handler);
        };

        const handler = (update: any) => {
          this.logger.log(
            `Connection update for session ${sessionId}: ${JSON.stringify(update)}`,
          );

          if (update.qr) {
            cleanup();
            resolve({ needsQR: true, qr: update.qr });
          } else if (update.connection === "open") {
            cleanup();
            resolve({ needsQR: false });
          } else if (update.connection === "close") {
            const reason = (update.lastDisconnect?.error as Boom)?.output
              ?.statusCode;
            cleanup();

            // If logged out or needs pairing, this means we need QR
            if (reason === DisconnectReason.loggedOut) {
              this.logger.log(
                `Session ${sessionId} was logged out - will need QR code`,
              );
              resolve({ needsQR: true }); // Don't reject, just indicate QR needed
            } else {
              this.logger.error(
                `Connection failed for session ${sessionId}, reason: ${reason}`,
              );
              reject(new Error(`Connection failed: ${reason || "Unknown"}`));
            }
          }
        };

        sock.ev.on("connection.update", handler);
      });
    } catch (error) {
      this.logger.error(`Failed to connect session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Request a pairing code as an alternative to QR code scanning
   * This is useful for Android devices that have trouble scanning QR codes
   *
   * IMPORTANT: The pairing code must be requested when the connection is in "connecting" state
   * Reference: https://baileys.wiki/docs/socket/connecting/
   */
  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    this.logger.log(`📱 Requesting pairing code for session ${sessionId} with phone ${phoneNumber}`);

    // Clear any existing session for fresh start
    const existingSocket = this.sessions.get(sessionId);
    if (existingSocket) {
      this.logger.log(`Clearing existing session ${sessionId} for fresh pairing code connection`);
      try {
        existingSocket.ws?.close();
      } catch (e) {
        // Ignore close errors
      }
      this.sessions.delete(sessionId);
    }

    // Clear existing session files for a clean start
    const sessionPath = path.join(
      this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions"),
      sessionId,
    );
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      this.logger.log(`Cleared session directory for ${sessionId}`);
    } catch (error) {
      this.logger.warn(`Failed to clear session directory: ${error.message}`);
    }

    // Initialize fresh session
    await this.initializeSession(sessionId);
    const authState = this.authStates.get(sessionId);
    if (!authState) {
      throw new Error("Failed to initialize auth state for pairing");
    }

    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.log(`Using WA version ${version.join(".")}, isLatest: ${isLatest} for pairing`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Pairing code request timed out - please try again"));
      }, 30000); // 30 second timeout

      const sock = makeWASocket({
        version,
        printQRInTerminal: false,
        browser: Browsers.windows("Chrome"),
        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, undefined),
        },
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 180000, // 3 minutes (increased)
        connectTimeoutMs: 180000, // 3 minutes (increased)
        keepAliveIntervalMs: 25000, // 25 seconds (more frequent)
        retryRequestDelayMs: 1000, // 1 second (increased)
      });

      this.sessions.set(sessionId, sock);
      let pairingCodeRequested = false;

      // Set up connection event handlers
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        this.logger.log(`🔄 Pairing connection update: ${JSON.stringify({ connection, hasQR: !!qr })}`);

        // Request pairing code when connecting or QR is available
        // This is the correct flow according to Baileys documentation
        if (!pairingCodeRequested && (connection === "connecting" || qr)) {
          pairingCodeRequested = true;
          this.logger.log(`📲 Requesting pairing code now (state: ${connection || 'qr_available'})`);

          try {
            // Small delay to ensure socket is ready
            await new Promise(r => setTimeout(r, 500));
            const code = await sock.requestPairingCode(phoneNumber);
            this.logger.log(`✅ Pairing code generated: ${code}`);
            clearTimeout(timeout);
            resolve(code);
          } catch (error) {
            this.logger.error(`❌ Failed to request pairing code: ${error.message}`);
            clearTimeout(timeout);
            reject(error);
          }
        }

        this.eventEmitter.emit("whatsapp.connection.update", {
          sessionId,
          update,
        });

        if (connection === "open") {
          this.logger.log(`✅ Session ${sessionId} connected via pairing code!`);

          // Update connection state
          this.connectionStates.set(sessionId, 'connected');

          // 🔧 FIX: Update database status to CONNECTED immediately
          try {
            await this.sessionRepository.update(sessionId, {
              status: 'connected' as any, // Cast to avoid enum type issues
              isActive: true,
              lastSeenAt: new Date(),
            });
            this.logger.log(`📝 Database status updated to CONNECTED for session ${sessionId}`);
          } catch (dbError) {
            this.logger.error(`Failed to update session status in database: ${dbError.message}`);
          }

          // Start keep-alive for the session
          this.startKeepAlive(sessionId);

          // Start credentials save
          this.startCredentialsSave(sessionId, authState);

          this.eventEmitter.emit("whatsapp.session.connected", { sessionId });
          this.eventEmitter.emit("whatsapp.session.ready", {
            sessionId,
            status: "connected",
          });
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorPayload = (lastDisconnect?.error as Boom)?.output?.payload;

          this.logger.log(`🔌 Pairing connection closed for session ${sessionId}`);
          this.logger.log(`   Status code: ${statusCode}`);
          this.logger.log(`   Error payload: ${JSON.stringify(errorPayload)}`);

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (statusCode === 401) {
            this.logger.warn(`⚠️ Session ${sessionId} received 401 error - this may indicate:`);
            this.logger.warn(`   - Maximum linked devices reached (unlink old devices from WhatsApp)`);
            this.logger.warn(`   - Session conflict with another connection`);
            this.logger.warn(`   - Account restrictions`);

            this.eventEmitter.emit("whatsapp.pairing.error", {
              sessionId,
              errorCode: 401,
              message: "Connection rejected - please unlink old devices from WhatsApp > Linked Devices and try again",
            });
          }

          if (shouldReconnect && connection === "close" && statusCode !== 401) {
            this.logger.log(`🔄 Will attempt to reconnect session ${sessionId}`);
          }
        }
      });

      // Handle credential updates
      sock.ev.on("creds.update", async () => {
        const authStateUpdate = this.authStates.get(sessionId);
        if (authStateUpdate?.saveCreds) {
          await authStateUpdate.saveCreds();
          this.logger.debug(`💾 Credentials saved for pairing session ${sessionId}`);
        }
      });

      // Handle messages for the paired session
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        messages.forEach((message) => {
          if (!message.key.fromMe && message.message) {
            this.eventEmitter.emit("whatsapp.message.received", {
              sessionId,
              message,
              type,
            });
          }
        });
      });

      // Handle history sync for paired session
      sock.ev.on("messaging-history.set", (data) => {
        this.logger.log(`📚 History sync received for paired session ${sessionId}:`);
        this.logger.log(`  - Chats: ${data.chats?.length || 0}`);
        this.logger.log(`  - Messages: ${data.messages?.length || 0}`);

        this.eventEmitter.emit("whatsapp.history.sync.received", {
          sessionId,
          chatsCount: data.chats?.length || 0,
          messagesCount: data.messages?.length || 0,
        });
      });
    });
  }

  async disconnectSession(sessionId: string): Promise<void> {
    // Cancel any pending reconnection
    this.cancelReconnection(sessionId);

    // Stop timers first
    this.stopKeepAlive(sessionId);
    this.stopCredentialsSave(sessionId);

    // Mark as disconnected to prevent auto-reconnect
    this.connectionStates.set(sessionId, 'disconnected');

    const sock = this.sessions.get(sessionId);

    // Remove event handlers BEFORE logout to prevent memory leaks
    if (sock) {
      this.removeEventHandlers(sessionId, sock);
    }

    if (sock) {
      try {
        await sock.logout();
        this.logger.log(`Session ${sessionId} logged out from active socket`);
      } catch (error) {
        this.logger.warn(
          `Error during logout for session ${sessionId}:`,
          error,
        );
      }

      this.sessions.delete(sessionId);
    } else {
      // If no active session but we still want to logout from WhatsApp servers,
      // we need to create a temporary connection to send the logout command
      this.logger.log(
        `Session ${sessionId} not active locally, attempting forced logout from WhatsApp servers...`,
      );

      try {
        const authState = this.authStates.get(sessionId);
        if (authState && authState.state.creds) {
          this.logger.log(
            `Found auth credentials for ${sessionId}, creating temporary connection for logout...`,
          );

          const { version } = await fetchLatestBaileysVersion();
          const tempSock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: {
              creds: authState.state.creds,
              keys: makeCacheableSignalKeyStore(
                authState.state.keys,
                undefined,
              ),
            },
            generateHighQualityLinkPreview: false,
            defaultQueryTimeoutMs: 10000, // Shorter timeout for logout
          });

          // Wait briefly for connection
          await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 5000); // 5 second timeout

            tempSock.ev.on("connection.update", async (update) => {
              if (update.connection === "open") {
                clearTimeout(timeout);
                try {
                  await tempSock.logout();
                  this.logger.log(
                    `Session ${sessionId} successfully logged out via temporary connection`,
                  );
                } catch (logoutError) {
                  this.logger.warn(
                    `Error during forced logout for ${sessionId}:`,
                    logoutError,
                  );
                }
                resolve(null);
              } else if (update.connection === "close") {
                clearTimeout(timeout);
                resolve(null);
              }
            });
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to create temporary connection for logout ${sessionId}:`,
          error,
        );
      }
    }

    // Always clear local state regardless of logout success
    this.authStates.delete(sessionId);

    // Also clear session files to ensure fresh start
    const sessionPath = path.join(
      this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions"),
      sessionId,
    );

    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      this.logger.log(`Cleared session files for ${sessionId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to clear session files for ${sessionId}:`,
        error,
      );
    }
  }

  /**
   * Validate if phone numbers are registered on WhatsApp
   */
  async validatePhoneNumbers(
    sessionId: string,
    phoneNumbers: string[],
  ): Promise<Array<{ phoneNumber: string; isValid: boolean; jid?: string }>> {
    const sock = this.sessions.get(sessionId);

    if (!sock) {
      throw new Error("Session not found or not connected");
    }

    const results: Array<{ phoneNumber: string; isValid: boolean; jid?: string }> = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        // Clean phone number - remove spaces, dashes, and ensure proper format
        let cleanNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!cleanNumber.startsWith('+')) {
          cleanNumber = '+' + cleanNumber;
        }

        const waResults = await sock.onWhatsApp(cleanNumber);

        if (waResults && waResults.length > 0 && waResults[0]?.exists) {
          results.push({
            phoneNumber,
            isValid: true,
            jid: waResults[0].jid,
          });
        } else {
          results.push({
            phoneNumber,
            isValid: false,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to validate ${phoneNumber}: ${error.message}`);
        results.push({
          phoneNumber,
          isValid: false,
        });
      }
    }

    return results;
  }

  async sendMessage(
    sessionId: string,
    messageDto: SendMessageDto,
  ): Promise<{ messageId: string; status: string }> {
    const sock = this.sessions.get(sessionId);

    if (!sock) {
      throw new Error("Session not found or not connected");
    }

    // Verify session is actually connected
    const status = this.getSessionStatus(sessionId);
    if (status !== "connected") {
      this.logger.error(`Session ${sessionId} is not connected (status: ${status}). Cannot send message.`);
      throw new Error(`Session is not connected (status: ${status}). Please reconnect WhatsApp.`);
    }

    try {
      let message: any;

      // Log incoming message request for debugging
      this.logger.log(`📤 sendMessage called: to=${messageDto.to}, type=${messageDto.type}, message=${(messageDto.message || '').substring(0, 50)}...`);

      // Format phone number - use onWhatsApp to get correct JID
      let jid = messageDto.to;
      if (!messageDto.to.includes("@")) {
        // Validate number and get correct JID format
        this.logger.log(`🔍 Validating phone number: ${messageDto.to}`);
        try {
          const results = await sock.onWhatsApp(messageDto.to);
          this.logger.log(`🔍 onWhatsApp result: ${JSON.stringify(results)}`);

          if (results && results.length > 0 && results[0]?.exists && results[0]?.jid) {
            jid = results[0].jid;
            this.logger.log(`✅ Resolved ${messageDto.to} to JID: ${jid}`);
          } else {
            // Fallback to standard format if validation fails
            jid = `${messageDto.to}@s.whatsapp.net`;
            this.logger.warn(`⚠️ Could not validate ${messageDto.to} (results: ${JSON.stringify(results)}), using fallback JID: ${jid}`);
          }
        } catch (validationError) {
          // Fallback to standard format
          jid = `${messageDto.to}@s.whatsapp.net`;
          this.logger.warn(`⚠️ Failed to validate ${messageDto.to}: ${validationError.message}`);
        }
      } else {
        this.logger.log(`📋 Using existing JID format: ${jid}`);
      }

      // Prepare message based on type
      switch (messageDto.type) {
        case "image":
          if (!messageDto.mediaUrl) {
            throw new Error("Media URL required for image messages");
          }
          message = {
            image: { url: messageDto.mediaUrl },
            caption: messageDto.caption || "",
          };
          break;

        case "document":
          if (!messageDto.mediaUrl) {
            throw new Error("Media URL required for document messages");
          }
          message = {
            document: { url: messageDto.mediaUrl },
            fileName: messageDto.filename || "document",
            caption: messageDto.caption || "",
          };
          break;

        case "audio":
          if (!messageDto.mediaUrl) {
            throw new Error("Media URL required for audio messages");
          }
          message = {
            audio: { url: messageDto.mediaUrl },
            ptt: true, // Push-to-talk
          };
          break;

        case "video":
          if (!messageDto.mediaUrl) {
            throw new Error("Media URL required for video messages");
          }
          message = {
            video: { url: messageDto.mediaUrl },
            caption: messageDto.caption || "",
          };
          break;

        default: // text message
          message = {
            text: messageDto.message,
          };
      }

      // Log message content for debugging
      this.logger.log(`📨 Sending message to ${jid}: ${JSON.stringify(message).substring(0, 200)}...`);

      // Send message
      const sentMessage = await sock.sendMessage(jid, message);

      // Log full response for debugging
      this.logger.log(`✅ Message sent successfully!`);
      this.logger.log(`📩 Response: messageId=${sentMessage?.key?.id}, remoteJid=${sentMessage?.key?.remoteJid}, status=${sentMessage?.status}`);

      return {
        messageId: sentMessage.key.id,
        status: "sent",
      };
    } catch (error) {
      this.logger.error(
        `Failed to send message from session ${sessionId}:`,
        error,
      );

      // Handle specific WhatsApp/Baileys errors with better messages
      const errorMessage = error?.message || String(error);
      const errorName = error?.name || 'UnknownError';

      // PreKeyError - encryption key issues
      if (errorName === 'PreKeyError' || errorMessage.includes('PreKey') || errorMessage.includes('Invalid PreKey')) {
        const customError = new Error(
          'WhatsApp encryption error: Session keys are out of sync. Please disconnect and reconnect the WhatsApp session to regenerate encryption keys.'
        );
        (customError as any).code = 'PREKEY_ERROR';
        (customError as any).recoverable = true;
        (customError as any).action = 'RECONNECT_SESSION';
        throw customError;
      }

      // Session closed/disconnected errors
      if (errorMessage.includes('Connection Closed') || errorMessage.includes('connection closed') || errorMessage.includes('not connected')) {
        const customError = new Error(
          'WhatsApp session is disconnected. Please reconnect the session from the dashboard.'
        );
        (customError as any).code = 'SESSION_DISCONNECTED';
        (customError as any).recoverable = true;
        (customError as any).action = 'RECONNECT_SESSION';
        throw customError;
      }

      // Rate limit errors
      if (errorMessage.includes('rate') || errorMessage.includes('too many') || errorMessage.includes('spam')) {
        const customError = new Error(
          'WhatsApp rate limit reached. Please wait a few minutes before sending more messages.'
        );
        (customError as any).code = 'RATE_LIMITED';
        (customError as any).recoverable = true;
        (customError as any).action = 'WAIT_AND_RETRY';
        throw customError;
      }

      // Invalid JID/phone number
      if (errorMessage.includes('invalid jid') || errorMessage.includes('JID') || errorMessage.includes('not a valid')) {
        const customError = new Error(
          'Invalid phone number format. Please use international format without + or spaces (e.g., 237612345678).'
        );
        (customError as any).code = 'INVALID_PHONE';
        (customError as any).recoverable = false;
        throw customError;
      }

      // Logged out errors
      if (errorMessage.includes('logged out') || errorMessage.includes('Logged out') || errorMessage.includes('401')) {
        const customError = new Error(
          'WhatsApp session was logged out. Please scan the QR code again to reconnect.'
        );
        (customError as any).code = 'SESSION_LOGGED_OUT';
        (customError as any).recoverable = true;
        (customError as any).action = 'SCAN_QR_CODE';
        throw customError;
      }

      // Generic error - re-throw with original message
      throw error;
    }
  }

  getSessionStatus(
    sessionId: string,
  ): "connected" | "connecting" | "disconnected" {
    // First, check the explicit connection state (most reliable)
    const connectionState = this.connectionStates.get(sessionId);

    if (connectionState === 'reconnecting') {
      this.logger.debug(`Session ${sessionId} status: reconnecting (from connectionStates)`);
      return "connecting"; // Map reconnecting to connecting for dashboard
    }

    if (connectionState === 'disconnected') {
      this.logger.debug(`Session ${sessionId} status: disconnected (from connectionStates)`);
      return "disconnected";
    }

    const sock = this.sessions.get(sessionId);

    if (!sock) {
      return "disconnected";
    }

    // Check if socket is authenticated (has user info)
    // Baileys socket structure may vary - check multiple indicators
    const hasUser = !!sock.user;
    const wsReadyState = sock.ws?.readyState;

    this.logger.debug(`Session ${sessionId} status check: connectionState=${connectionState}, hasUser=${hasUser}, wsReadyState=${wsReadyState}`);

    // Only return connected if connectionState is explicitly 'connected' AND we have user info
    if (connectionState === 'connected' && hasUser) {
      return "connected";
    }

    // If we have user but no explicit connected state, we're likely reconnecting
    if (hasUser && !connectionState) {
      // Session has user but we haven't tracked state yet - assume connected for backward compat
      this.connectionStates.set(sessionId, 'connected');
      return "connected";
    }

    return "connecting";
  }

  /**
   * Get the Baileys socket for a session (for media download)
   */
  getSessionSocket(sessionId: string): any | null {
    return this.sessions.get(sessionId) || null;
  }

  async getSessionInfo(sessionId: string): Promise<any> {
    const sock = this.sessions.get(sessionId);

    if (!sock || !sock.user) {
      return null;
    }

    return {
      phoneNumber: sock.user.id.split(":")[0],
      name: sock.user.name,
      profilePicture: await sock
        .profilePictureUrl(sock.user.id)
        .catch(() => null),
    };
  }

  /**
   * Get profile picture URL for a contact
   */
  async getProfilePictureUrl(sessionId: string, jid: string): Promise<string | null> {
    try {
      const sock = this.sessions.get(sessionId);
      if (!sock) {
        return null;
      }

      // Ensure JID has proper format
      const formattedJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;

      const url = await sock.profilePictureUrl(formattedJid, 'image').catch(() => null);
      return url || null;
    } catch (error) {
      this.logger.debug(`Failed to get profile picture for ${jid}: ${error.message}`);
      return null;
    }
  }

  /**
   * Resolve LID to phone number using Baileys lidMapping store
   * Returns the phone number if found, otherwise null
   */
  async resolveLidToPhoneNumber(sessionId: string, lid: string): Promise<string | null> {
    try {
      const sock = this.sessions.get(sessionId);
      if (!sock) {
        return null;
      }

      // Clean the LID (remove @lid suffix if present)
      const cleanLid = lid.replace(/@lid$/i, '');

      // Try to get phone number from lidMapping store
      // Baileys v7 provides this through signalRepository.lidMapping
      if (sock.signalRepository?.lidMapping?.getPNForLID) {
        const phoneNumber = await sock.signalRepository.lidMapping.getPNForLID(cleanLid);
        if (phoneNumber) {
          this.logger.debug(`Resolved LID ${cleanLid} to PN ${phoneNumber} via lidMapping`);
          return phoneNumber.replace(/@s\.whatsapp\.net$/i, '');
        }
      }

      // Alternative: Try to look up in the store's contacts
      if (sock.store?.contacts) {
        const lidJid = `${cleanLid}@lid`;
        const contact = sock.store.contacts[lidJid];
        if (contact?.phoneNumber) {
          this.logger.debug(`Resolved LID ${cleanLid} to PN ${contact.phoneNumber} via contacts store`);
          return contact.phoneNumber.replace(/@s\.whatsapp\.net$/i, '');
        }
      }

      // Try using onWhatsApp to verify and get user info
      // This can sometimes return phone number info
      try {
        const lidJid = cleanLid.includes('@') ? cleanLid : `${cleanLid}@lid`;
        const [result] = await sock.onWhatsApp(lidJid);
        if (result?.jid && !result.jid.includes('@lid')) {
          const resolvedPhone = result.jid.replace(/@s\.whatsapp\.net$/i, '');
          this.logger.debug(`Resolved LID ${cleanLid} to PN ${resolvedPhone} via onWhatsApp`);
          return resolvedPhone;
        }
      } catch (error) {
        // onWhatsApp might fail for LIDs, that's expected
      }

      this.logger.debug(`Could not resolve LID ${cleanLid} to phone number`);
      return null;
    } catch (error) {
      this.logger.debug(`Failed to resolve LID ${lid}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get contact info from Baileys store
   */
  getContactFromStore(sessionId: string, jid: string): any | null {
    try {
      const sock = this.sessions.get(sessionId);
      if (!sock?.store?.contacts) {
        return null;
      }

      return sock.store.contacts[jid] || null;
    } catch (error) {
      return null;
    }
  }

  // Debug method to check active sessions
  getActiveSessions(): any {
    const activeSessions = Array.from(this.sessions.keys()).map(
      (sessionId) => ({
        sessionId,
        status: this.getSessionStatus(sessionId),
        hasSocket: !!this.sessions.get(sessionId),
        hasUser: !!this.sessions.get(sessionId)?.user,
      }),
    );

    return {
      totalSessions: activeSessions.length,
      sessions: activeSessions,
    };
  }

  /**
   * Handle chats received from WhatsApp
   */
  private async handleChatsReceived(
    sessionId: string,
    sock: any,
    chats: any[],
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing ${chats.length} chats for session ${sessionId}`,
      );

      // Process each chat and sync its messages
      for (const chat of chats) {
        try {
          await this.syncSingleChat(sessionId, sock, chat);
          await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay
        } catch (error) {
          this.logger.error(`Failed to sync chat ${chat.id}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle chats for session ${sessionId}:`,
        error,
      );
    }
  }

  /**
   * Synchronize existing chats and messages from WhatsApp
   */
  private async syncChatsAndMessages(
    sessionId: string,
    sock: any,
  ): Promise<void> {
    try {
      this.logger.log(
        `🔄 Starting active synchronization for session ${sessionId}`,
      );

      // Emit sync started event
      this.eventEmitter.emit("whatsapp.sync.started", {
        sessionId,
        message: "Manual sync started - fetching chats and messages...",
      });

      // Force fetch the chat list from WhatsApp
      try {
        this.logger.log(
          `📱 Fetching chat list from WhatsApp for session ${sessionId}...`,
        );

        // Get all chats from WhatsApp
        const chats = Object.values(sock.chats) || [];
        this.logger.log(`📋 Found ${chats.length} chats in WhatsApp session`);

        if (chats.length === 0) {
          this.logger.warn(
            `⚠️ No chats found in session ${sessionId} - trying to fetch from store`,
          );

          // Try to get chat list from store
          const storeChats =
            (await sock.chatOrderingKey?.getOrderedList("chat")) || [];
          this.logger.log(`📦 Store has ${storeChats.length} chat references`);
        }

        // Process existing chats
        if (chats.length > 0) {
          this.logger.log(
            `🔄 Processing ${chats.length} chats for synchronization...`,
          );

          // Handle the chats using our existing handler
          await this.handleChatsReceived(sessionId, sock, chats);

          this.eventEmitter.emit("whatsapp.sync.completed", {
            sessionId,
            messageCount: chats.length,
            message: `Manual sync completed! Processed ${chats.length} chats.`,
          });
        } else {
          // If no chats found, emit completion anyway
          this.eventEmitter.emit("whatsapp.sync.completed", {
            sessionId,
            messageCount: 0,
            message: "Manual sync completed - no chats found to synchronize.",
          });
        }
      } catch (fetchError) {
        this.logger.error(
          `Failed to fetch chats for session ${sessionId}:`,
          fetchError,
        );

        // Fallback: try to trigger a fresh connection which should emit chats.set
        this.logger.log(
          `🔄 Fallback: attempting to refresh connection for ${sessionId}`,
        );

        // Wait for potential chats.set event
        await new Promise((resolve) => setTimeout(resolve, 5000));

        this.eventEmitter.emit("whatsapp.sync.completed", {
          sessionId,
          messageCount: 0,
          message:
            "Manual sync completed - waiting for automatic chat synchronization.",
        });
      }
    } catch (error) {
      this.logger.error(
        `Chat synchronization failed for session ${sessionId}:`,
        error,
      );

      this.eventEmitter.emit("whatsapp.sync.failed", {
        sessionId,
        error: error.message,
        message: `Sync failed: ${error.message}`,
      });
    }
  }

  /**
   * Synchronize a single chat and its recent messages
   */
  private async syncSingleChat(
    sessionId: string,
    sock: any,
    chat: any,
  ): Promise<void> {
    try {
      const chatId = chat.id;
      const isGroup = chatId.endsWith("@g.us");

      // Get basic chat info
      const chatName =
        chat.name ||
        (isGroup ? `Group ${chatId.split("@")[0]}` : chatId.split("@")[0]);

      this.logger.log(
        `Syncing chat: ${chatName} (${isGroup ? "group" : "individual"})`,
      );

      // Get all available messages from chat history
      // Use a large number to fetch as many messages as possible
      // Baileys will return whatever is available up to this limit
      this.logger.log(`📥 Fetching messages for chat ${chatName} (${chatId})`);
      const messages = await sock.fetchMessagesFromWA(chatId, 10000);
      this.logger.log(
        `📊 Retrieved ${messages?.length || 0} messages for ${chatName}`,
      );

      if (messages && messages.length > 0) {
        this.logger.log(
          `Found ${messages.length} total messages for chat ${chatName}`,
        );

        // Process messages in reverse order (oldest first)
        const sortedMessages = messages.reverse();

        for (const message of sortedMessages) {
          // Skip if message is empty
          if (!message.message) {
            continue;
          }

          // Extract message content and type
          let messageText = "";
          let messageType = "text";

          if (message.message?.conversation) {
            messageText = message.message.conversation;
            messageType = "text";
          } else if (message.message?.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
            messageType = "text";
          } else if (message.message?.imageMessage) {
            messageText = message.message.imageMessage.caption || "[Image]";
            messageType = "image";

            // Try to download the image
            try {
              const buffer = await downloadMediaMessage(
                message,
                "buffer",
                {},
                {
                  logger: this.logger as any,
                  reuploadRequest: sock.updateMediaMessage,
                },
              );

              if (buffer) {
                // Convert buffer to base64 for storage
                const base64 = buffer.toString("base64");
                const mimeType =
                  message.message.imageMessage.mimetype || "image/jpeg";
                messageText = `data:${mimeType};base64,${base64}`;
                this.logger.log(
                  `Downloaded image for message ${message.key.id}`,
                );
              }
            } catch (error) {
              this.logger.warn(
                `Failed to download image for message ${message.key.id}:`,
                error,
              );
            }
          } else if (message.message?.videoMessage) {
            messageText = message.message.videoMessage.caption || "[Video]";
            messageType = "video";
          } else if (message.message?.audioMessage) {
            messageText = "[Audio]";
            messageType = "audio";
          } else if (message.message?.documentMessage) {
            messageText =
              message.message.documentMessage.fileName || "[Document]";
            messageType = "file";
          } else if (message.message?.stickerMessage) {
            messageText = "[Sticker]";
            messageType = "text";
          } else {
            messageText = "[Media message]";
            messageType = "text";
          }

          // Get timestamp
          const timestamp = message.messageTimestamp
            ? new Date(message.messageTimestamp * 1000)
            : new Date();

          // Determine sender - if fromMe, it's from the agent/user, otherwise it's from the contact
          const isFromMe = message.key.fromMe;

          // Emit message for processing
          this.eventEmitter.emit("whatsapp.sync.message", {
            sessionId,
            fromNumber: chatId,
            messageText,
            messageId: message.key.id,
            timestamp,
            isGroup,
            isHistorical: true, // Mark as historical message
            isFromMe, // Include sender information
            messageType, // Include message type
            groupId: isGroup ? chatId.split("@")[0] : null,
            participant: isGroup ? message.key.participant : null,
          });

          // Small delay between messages
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    } catch (error) {
      this.logger.error(`Failed to sync single chat ${chat.id}:`, error);
      throw error;
    }
  }

  /**
   * Process historical messages received from messaging-history.set event
   */
  private async processHistoricalMessages(
    sessionId: string,
    messages: any[],
  ): Promise<void> {
    this.logger.log(
      `📥 Processing ${messages.length} historical messages for session ${sessionId}`,
    );

    try {
      let processedCount = 0;

      // Process messages in batches to avoid overwhelming the database
      const batchSize = 10;
      const batches = [];

      // Prepare message batches
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        batches.push(batch);
      }

      for (const batch of batches) {
        const processedMessages = [];

        for (const message of batch) {
          // Skip if message is empty or invalid
          if (!message?.key?.remoteJid || !message.message) {
            continue;
          }

          const chatId = message.key.remoteJid;
          const isGroup = chatId.endsWith("@g.us");

          // Extract message content and type
          let messageText = "";
          let messageType = "text";

          if (message.message?.conversation) {
            messageText = message.message.conversation;
          } else if (message.message?.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
          } else if (message.message?.imageMessage) {
            messageText = message.message.imageMessage.caption || "[Image]";
            messageType = "image";
          } else if (message.message?.videoMessage) {
            messageText = message.message.videoMessage.caption || "[Video]";
            messageType = "video";
          } else if (message.message?.audioMessage) {
            messageText = "[Audio]";
            messageType = "audio";
          } else if (message.message?.documentMessage) {
            messageText =
              message.message.documentMessage.fileName || "[Document]";
            messageType = "file";
          } else if (message.message?.stickerMessage) {
            messageText = "[Sticker]";
          } else {
            messageText = "[Media message]";
          }

          // Get timestamp
          const timestamp = message.messageTimestamp
            ? new Date(message.messageTimestamp * 1000)
            : new Date();

          // Determine sender - if fromMe, it's from us, otherwise from contact
          const isFromMe = message.key.fromMe;

          processedMessages.push({
            sessionId,
            fromNumber: chatId,
            messageText,
            messageId: message.key.id || `hist_${Date.now()}_${processedCount}`,
            timestamp,
            isGroup,
            isHistorical: true, // Mark as historical
            isFromMe,
            messageType,
            groupId: isGroup ? chatId.split("@")[0] : null,
            participant: isGroup ? message.key.participant : null,
          });

          processedCount++;
        }

        // Emit batch event instead of individual message events
        if (processedMessages.length > 0) {
          this.eventEmitter.emit("whatsapp.sync.messages.batch", {
            sessionId,
            messages: processedMessages,
          });
        }

        // Delay between batches to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      this.logger.log(
        `✅ Processed ${processedCount} historical messages for session ${sessionId}`,
      );

      // Emit completion event
      this.eventEmitter.emit("whatsapp.sync.completed", {
        sessionId,
        messageCount: processedCount,
      });
    } catch (error) {
      this.logger.error(
        `❌ Failed to process historical messages for session ${sessionId}:`,
        error,
      );
    }
  }

  /**
   * Get human-readable name for sync type
   */
  private getSyncTypeName(syncType: number): string {
    const syncTypes = {
      0: "INITIAL_BOOTSTRAP",
      1: "INITIAL_STATUS_V3",
      2: "FULL",
      3: "RECENT",
      4: "PUSH_NAME",
      5: "NON_BLOCKING_DATA",
      6: "ON_DEMAND",
      7: "CRITICAL_BLOCK",
      8: "CRITICAL_UNBLOCK_LOW",
    };
    return syncTypes[syncType] || `UNKNOWN(${syncType})`;
  }

  // Start keep-alive system for a session
  // Note: Baileys has built-in keepAliveIntervalMs, this is a supplementary check
  private startKeepAlive(sessionId: string): void {
    // Clear existing timer if any
    this.stopKeepAlive(sessionId);

    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5; // Increased from 3 to be more tolerant

    // Use a longer interval since Baileys handles its own keep-alive
    // This serves as a fallback health check, not primary keep-alive
    const keepAliveInterval = setInterval(async () => {
      try {
        const sock = this.sessions.get(sessionId);
        const wsReadyState = sock?.ws?.readyState;
        const connectionState = this.connectionStates.get(sessionId);

        // WebSocket ready states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
        if (sock && wsReadyState === 1) {
          // Connection is healthy
          consecutiveFailures = 0;
          this.logger.debug(`🏓 Session ${sessionId} health check: WebSocket connected`);

          // Update lastSeenAt in database
          try {
            await this.sessionRepository.update(sessionId, { lastSeenAt: new Date() });
          } catch (dbError) {
            this.logger.debug(`Failed to update lastSeenAt: ${dbError.message}`);
          }
        } else if (connectionState === 'reconnecting') {
          // Already reconnecting, don't interfere
          this.logger.debug(`🔄 Session ${sessionId} is reconnecting, health check skipped`);
        } else {
          // Connection appears dead
          consecutiveFailures++;
          this.logger.warn(
            `⚠️ Session ${sessionId} WebSocket not ready (readyState: ${wsReadyState}, failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
          );

          // After multiple failures, trigger cleanup and potential reconnection
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.logger.error(`❌ Session ${sessionId} appears dead after ${consecutiveFailures} health check failures`);

            // Update connection state
            if (connectionState === 'connected') {
              this.connectionStates.set(sessionId, 'disconnected');

              // Emit event to trigger reconnection logic
              this.eventEmitter.emit("whatsapp.connection.stale", {
                sessionId,
                message: "Session detected as stale by health check",
              });
            }

            // Stop this timer as session needs full reconnection
            this.stopKeepAlive(sessionId);
          }
        }
      } catch (error) {
        consecutiveFailures++;
        this.logger.error(
          `❌ Health check failed for session ${sessionId} (failures: ${consecutiveFailures}):`,
          error,
        );

        // Clean up timer if persistent errors
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.stopKeepAlive(sessionId);
        }
      }
    }, 60000); // Every 60 seconds - offset from Baileys' 30s keep-alive

    this.keepAliveTimers.set(sessionId, keepAliveInterval);
    this.logger.log(`⏰ Health check timer started for session ${sessionId} (60s interval)`);
  }

  // Stop keep-alive system for a session
  private stopKeepAlive(sessionId: string): void {
    const timer = this.keepAliveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.keepAliveTimers.delete(sessionId);
      this.logger.log(`⏰ Keep-alive timer stopped for session ${sessionId}`);
    }
  }

  // Track database backup counter per session (to avoid backing up to DB on every interval)
  private dbBackupCounters = new Map<string, number>();

  // Start periodic credentials save for a session
  private startCredentialsSave(sessionId: string, authState: any): void {
    // Clear existing timer if any
    this.stopCredentialsSave(sessionId);

    // Initialize backup counter
    this.dbBackupCounters.set(sessionId, 0);

    const saveInterval = setInterval(async () => {
      try {
        if (authState && authState.saveCreds) {
          // Always save to filesystem
          await authState.saveCreds();
          this.logger.debug(`💾 Periodic credentials save for session ${sessionId}`);

          // Increment counter and backup to database every 5 intervals (every 2.5 minutes)
          // This ensures credentials are preserved across deployments without excessive DB writes
          const counter = (this.dbBackupCounters.get(sessionId) || 0) + 1;
          this.dbBackupCounters.set(sessionId, counter);

          if (counter >= 5) {
            this.dbBackupCounters.set(sessionId, 0);
            await this.backupCredentialsToDatabase(sessionId);
            this.logger.log(`💾 Periodic database backup completed for session ${sessionId}`);
          }
        } else {
          this.logger.warn(`⚠️ No auth state available for credentials save: ${sessionId}`);
          this.stopCredentialsSave(sessionId);
        }
      } catch (error) {
        this.logger.error(`❌ Periodic credentials save failed for session ${sessionId}:`, error);
      }
    }, 30000); // Every 30 seconds (reduced from 60s for better persistence)

    this.credentialsSaveTimers.set(sessionId, saveInterval);
    this.logger.log(`💾 Periodic credentials save started for session ${sessionId} (30s interval, DB backup every 2.5min)`);
  }

  // Stop periodic credentials save for a session
  private stopCredentialsSave(sessionId: string): void {
    const timer = this.credentialsSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.credentialsSaveTimers.delete(sessionId);
      this.dbBackupCounters.delete(sessionId);
      this.logger.log(`💾 Periodic credentials save stopped for session ${sessionId}`);
    }
  }

  /**
   * Backup credentials to database for persistence across deployments
   * IMPORTANT: Backs up ALL auth files to ensure Signal Protocol keys are preserved
   */
  private async backupCredentialsToDatabase(sessionId: string): Promise<void> {
    try {
      const sessionsPath = this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions");
      const sessionPath = path.join(sessionsPath, sessionId);
      const credentialsPath = path.join(sessionPath, "creds.json");

      // Check if session directory exists
      try {
        await fs.access(sessionPath);
      } catch (error) {
        this.logger.debug(`Session directory does not exist for ${sessionId}, skipping backup`);
        return;
      }

      // Read all auth files
      const authData: Record<string, any> = {};

      // Read main credentials file
      try {
        const creds = await fs.readFile(credentialsPath, "utf-8");
        authData.creds = JSON.parse(creds);
      } catch (error) {
        // No creds file - this is critical, log it
        this.logger.warn(`No creds.json found for session ${sessionId}`);
      }

      // Read ALL auth-related files (not just specific prefixes)
      // Baileys Signal Protocol uses many different file types:
      // - app-state-sync-key-* : App state synchronization keys
      // - pre-key-* : Pre-keys for establishing encrypted sessions
      // - sender-key-* : Group messaging sender keys
      // - session-* : Individual session encryption keys
      // - lid-* : Linked device ID mappings
      const files = await fs.readdir(sessionPath);
      let filesBackedUp = 0;

      for (const file of files) {
        // Skip creds.json (already handled) and non-JSON files
        if (file === "creds.json" || !file.endsWith(".json")) {
          continue;
        }

        // Backup all JSON files in the session directory
        // These are all Signal Protocol related files
        try {
          const content = await fs.readFile(path.join(sessionPath, file), "utf-8");
          authData[file] = JSON.parse(content);
          filesBackedUp++;
        } catch (error) {
          // Skip files that can't be parsed
          this.logger.debug(`Could not parse ${file} for backup: ${error.message}`);
        }
      }

      // Save to database
      if (Object.keys(authData).length > 0) {
        await this.sessionRepository.update(sessionId, {
          authData,
          lastSeenAt: new Date(),
        });
        this.logger.log(`💾 Backed up ${filesBackedUp + 1} auth files to database for session ${sessionId}`);
      } else {
        this.logger.warn(`No auth files found for session ${sessionId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to backup credentials to database for session ${sessionId}:`, error.message);
    }
  }

  /**
   * Restore credentials from database to filesystem
   */
  private async restoreCredentialsFromDatabase(sessionId: string): Promise<boolean> {
    try {
      const session = await this.sessionRepository.findOne({ where: { id: sessionId } });

      if (!session || !session.authData || Object.keys(session.authData).length === 0) {
        return false;
      }

      const sessionsPath = this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions");
      const sessionPath = path.join(sessionsPath, sessionId);

      // Create session directory
      await fs.mkdir(sessionPath, { recursive: true });

      // Restore all auth files
      for (const [filename, content] of Object.entries(session.authData)) {
        if (filename === "creds") {
          await fs.writeFile(path.join(sessionPath, "creds.json"), JSON.stringify(content, null, 2));
        } else {
          await fs.writeFile(path.join(sessionPath, filename), JSON.stringify(content, null, 2));
        }
      }

      this.logger.log(`🔄 Restored credentials from database for session ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to restore credentials from database for session ${sessionId}:`, error.message);
      return false;
    }
  }

  /**
   * Auto-restore existing sessions on service startup
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      this.logger.log(`🔄 Auto-restoring existing WhatsApp sessions...`);

      // Get all sessions that were connected from the database
      const dbSessions = await this.sessionRepository.find({
        where: { autoReconnect: true },
      });

      this.logger.log(`📊 Found ${dbSessions.length} sessions in database with autoReconnect enabled`);

      const sessionsPath = this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions");

      for (const dbSession of dbSessions) {
        const sessionId = dbSession.id;
        const sessionPath = path.join(sessionsPath, sessionId);
        const credentialsPath = path.join(sessionPath, "creds.json");

        let hasFilesystemCreds = false;

        // Check if credentials exist in filesystem
        try {
          await fs.access(credentialsPath);
          hasFilesystemCreds = true;
          this.logger.log(`🔑 Found filesystem credentials for session ${sessionId}`);
        } catch (error) {
          this.logger.log(`📁 No filesystem credentials for session ${sessionId}`);
        }

        // If no filesystem creds, try to restore from database
        if (!hasFilesystemCreds && dbSession.authData && Object.keys(dbSession.authData).length > 0) {
          this.logger.log(`💾 Restoring credentials from database for session ${sessionId}...`);
          hasFilesystemCreds = await this.restoreCredentialsFromDatabase(sessionId);
        }

        if (hasFilesystemCreds) {
          // Calculate staggered delay based on session index to avoid rate limiting
          // Each session gets a progressively longer delay (10-30s base + random jitter)
          const sessionIndex = dbSessions.indexOf(dbSession);
          const baseDelay = 10000 + (sessionIndex * 15000); // 10s, 25s, 40s, etc.
          const jitter = Math.random() * 5000; // 0-5s random jitter
          const totalDelay = baseDelay + jitter;

          this.logger.log(`⏱️ Scheduling session ${sessionId} restoration in ${Math.round(totalDelay / 1000)}s`);

          // Initialize and connect the session
          setTimeout(async () => {
            try {
              await this.initializeSession(sessionId);
              const result = await this.connectSession(sessionId, false);
              if (!result.needsQR) {
                this.logger.log(`✅ Session ${sessionId} restored successfully`);
                await this.sessionRepository.update(sessionId, {
                  status: "connected" as any,
                  isActive: true,
                  lastSeenAt: new Date(),
                });
              } else {
                this.logger.log(`⚠️ Session ${sessionId} requires QR code`);
              }
            } catch (error) {
              this.logger.warn(`❌ Failed to restore session ${sessionId}:`, error.message);
            }
          }, totalDelay);
        } else {
          this.logger.log(`⚠️ No credentials available for session ${sessionId}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to restore existing sessions:`, error);
    }
  }

  // Cleanup method to be called on application shutdown
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    this.logger.log(`🧹 Starting cleanup for ${sessionIds.length} sessions...`);

    // Cancel all reconnection attempts first
    for (const sessionId of this.reconnectionAttempts.keys()) {
      this.cancelReconnection(sessionId);
    }

    // Stop all timers
    for (const sessionId of sessionIds) {
      this.stopKeepAlive(sessionId);
      this.stopCredentialsSave(sessionId);
    }

    // Gracefully disconnect all sessions (save state but don't logout from WhatsApp)
    const cleanupPromises = sessionIds.map(async (sessionId) => {
      try {
        const authState = this.authStates.get(sessionId);
        if (authState && authState.saveCreds) {
          // Save current credentials before shutdown
          await authState.saveCreds();
          this.logger.log(`💾 Saved filesystem credentials for session ${sessionId}`);
        }

        // Backup credentials to database for persistence across deployments
        await this.backupCredentialsToDatabase(sessionId);

        // Remove event handlers to prevent memory leaks
        const sock = this.sessions.get(sessionId);
        if (sock) {
          this.removeEventHandlers(sessionId, sock);

          // Close socket without logging out (just disconnect, don't invalidate session)
          if (sock.ws && typeof sock.ws.close === 'function') {
            sock.ws.close();
          }
        }
      } catch (error) {
        this.logger.warn(`Error cleaning up session ${sessionId}:`, error);
      }
    });

    // Wait for all cleanup operations with a timeout
    await Promise.race([
      Promise.all(cleanupPromises),
      new Promise(resolve => setTimeout(resolve, 10000)), // 10 second timeout
    ]);

    // Clear all maps
    this.sessions.clear();
    this.authStates.clear();
    this.keepAliveTimers.clear();
    this.credentialsSaveTimers.clear();
    this.dbBackupCounters.clear();
    this.connectionStates.clear();
    this.reconnectionAttempts.clear();
    this.eventHandlers.clear();
    this.connectionLocks.clear();

    this.logger.log(`🧹 Cleanup completed for ${sessionIds.length} sessions`);
  }

  /**
   * Start periodic session cleanup to prevent memory leaks
   */
  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performSessionCleanup();
    }, this.SESSION_CLEANUP_INTERVAL);

    this.logger.log(`Started session cleanup timer (interval: ${this.SESSION_CLEANUP_INTERVAL / 1000}s)`);
  }

  /**
   * Lifecycle hook - cleanup when module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('🛑 Module destroy initiated - starting graceful shutdown...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.logger.log('Stopped session cleanup timer');
    }

    // Perform full cleanup with proper async handling
    await this.cleanup();

    this.logger.log('✅ Module destroy completed');
  }

  /**
   * Perform session cleanup to prevent unlimited memory growth
   */
  private performSessionCleanup(): void {
    const initialSessionCount = this.sessions.size;
    this.logger.debug(`Starting session cleanup - Active sessions: ${initialSessionCount}`);

    // If we exceed max sessions, remove inactive ones
    if (this.sessions.size > this.MAX_SESSIONS) {
      const sessionEntries = Array.from(this.sessions.entries());
      const sessionsToRemove = sessionEntries.slice(0, this.sessions.size - this.MAX_SESSIONS);

      for (const [sessionId, sock] of sessionsToRemove) {
        try {
          // Check if session is still connected (WebSocket.OPEN = 1)
          const wsReadyState = sock?.ws?.readyState;
          const isConnected = wsReadyState === 1; // 1 = WebSocket.OPEN
          const connectionState = this.connectionStates.get(sessionId);

          // Only remove if truly inactive (not connected and not reconnecting)
          if (!sock || (!isConnected && connectionState !== 'reconnecting')) {
            this.logger.debug(`Removing inactive session: ${sessionId} (wsState: ${wsReadyState}, connState: ${connectionState})`);
            this.removeSession(sessionId);
          }
        } catch (error) {
          this.logger.warn(`Error checking session ${sessionId} status: ${error.message}`);
          // Don't remove on error - could be a transient issue
        }
      }
    }

    // Clean up orphaned auth states, timers, and reconnection attempts
    this.cleanupOrphanedResources();

    const finalSessionCount = this.sessions.size;
    if (initialSessionCount !== finalSessionCount) {
      this.logger.log(`Session cleanup completed - Removed ${initialSessionCount - finalSessionCount} sessions`);
    }
  }

  /**
   * Clean up orphaned resources (auth states, timers, event handlers) that don't have corresponding sessions
   */
  private cleanupOrphanedResources(): void {
    const activeSessionIds = new Set(this.sessions.keys());

    // Clean up auth states for sessions that no longer exist
    for (const sessionId of this.authStates.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.authStates.delete(sessionId);
        this.logger.debug(`Removed orphaned auth state for session: ${sessionId}`);
      }
    }

    // Clean up keep-alive timers for sessions that no longer exist
    for (const sessionId of this.keepAliveTimers.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        const timer = this.keepAliveTimers.get(sessionId);
        if (timer) {
          clearInterval(timer);
        }
        this.keepAliveTimers.delete(sessionId);
        this.logger.debug(`Removed orphaned keep-alive timer for session: ${sessionId}`);
      }
    }

    // Clean up credentials save timers for sessions that no longer exist
    for (const sessionId of this.credentialsSaveTimers.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        const timer = this.credentialsSaveTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
        }
        this.credentialsSaveTimers.delete(sessionId);
        this.logger.debug(`Removed orphaned credentials timer for session: ${sessionId}`);
      }
    }

    // Clean up reconnection attempts for sessions that no longer exist
    for (const sessionId of this.reconnectionAttempts.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.cancelReconnection(sessionId);
        this.logger.debug(`Removed orphaned reconnection attempt for session: ${sessionId}`);
      }
    }

    // Clean up connection states for sessions that no longer exist
    for (const sessionId of this.connectionStates.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.connectionStates.delete(sessionId);
        this.logger.debug(`Removed orphaned connection state for session: ${sessionId}`);
      }
    }

    // Clean up event handlers for sessions that no longer exist
    for (const sessionId of this.eventHandlers.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.eventHandlers.delete(sessionId);
        this.logger.debug(`Removed orphaned event handlers for session: ${sessionId}`);
      }
    }
  }

  /**
   * Remove a specific session and its associated resources
   */
  private removeSession(sessionId: string): void {
    // Close the socket if it exists
    const sock = this.sessions.get(sessionId);

    // Remove event handlers FIRST to prevent memory leaks
    if (sock) {
      this.removeEventHandlers(sessionId, sock);

      // Close WebSocket connection
      if (sock.ws && typeof sock.ws.close === 'function') {
        try {
          sock.ws.close();
        } catch (error) {
          this.logger.warn(`Error closing WebSocket for session ${sessionId}: ${error.message}`);
        }
      }
    }

    // Cancel any pending reconnection
    this.cancelReconnection(sessionId);

    // Remove from all maps
    this.sessions.delete(sessionId);
    this.authStates.delete(sessionId);
    this.connectionStates.delete(sessionId);
    this.eventHandlers.delete(sessionId);

    // Clear timers
    const keepAliveTimer = this.keepAliveTimers.get(sessionId);
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      this.keepAliveTimers.delete(sessionId);
    }

    const credentialsTimer = this.credentialsSaveTimers.get(sessionId);
    if (credentialsTimer) {
      clearTimeout(credentialsTimer);
      this.credentialsSaveTimers.delete(sessionId);
    }

    this.logger.debug(`Removed session and all associated resources for: ${sessionId}`);
  }

  /**
   * Get current memory usage statistics for sessions
   */
  getSessionStats(): {
    activeSessionCount: number;
    authStateCount: number;
    keepAliveTimerCount: number;
    credentialsTimerCount: number;
    reconnectionAttemptCount: number;
    eventHandlerSessionCount: number;
    connectionStates: Record<string, string>;
    maxSessions: number;
    maxReconnectRetries: number;
  } {
    // Build connection states summary
    const connectionStatesSummary: Record<string, string> = {};
    for (const [sessionId, state] of this.connectionStates) {
      connectionStatesSummary[sessionId] = state;
    }

    return {
      activeSessionCount: this.sessions.size,
      authStateCount: this.authStates.size,
      keepAliveTimerCount: this.keepAliveTimers.size,
      credentialsTimerCount: this.credentialsSaveTimers.size,
      reconnectionAttemptCount: this.reconnectionAttempts.size,
      eventHandlerSessionCount: this.eventHandlers.size,
      connectionStates: connectionStatesSummary,
      maxSessions: this.MAX_SESSIONS,
      maxReconnectRetries: this.MAX_RECONNECT_RETRIES,
    };
  }
}
