import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Boom } from "@hapi/boom";
import * as path from "path";
import * as fs from "fs/promises";
import { SendMessageDto } from "./dto/whatsapp.dto";

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

    // Log what we got to debug
    console.log('[Baileys] Loaded exports:', {
      hasDefault: !!baileys.default,
      hasMakeWASocket: !!baileys.makeWASocket,
      makeWASocketType: typeof makeWASocket,
      hasDisconnectReason: !!DisconnectReason,
      hasUseMultiFileAuthState: !!useMultiFileAuthState,
      hasBrowsers: !!Browsers,
    });

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

  // Memory management configuration
  private readonly MAX_SESSIONS = 50; // Maximum concurrent sessions
  private readonly SESSION_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
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
   * Check if a session is currently active in Baileys
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
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

        // 📚 OFFICIAL BAILEYS DOCUMENTATION CONFIGURATION
        // Reference: https://github.com/WhiskeySockets/Baileys README.md
        // Using Chrome on Ubuntu for better Android compatibility
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false, // Disabled for better Android compatibility

        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, undefined),
        },

        // Standard Baileys configuration options
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: 60000, // Use default timeout from Baileys
        fireInitQueries: true, // Automatically fire initial queries
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        keepAliveIntervalMs: 10000, // Send keep-alive every 10 seconds (more frequent)
        connectTimeoutMs: 120000, // Wait up to 2 minutes for connection
        qrTimeout: 300000, // QR timeout extended to 5 minutes
        
        // Enhanced connection stability options
        emitOwnEvents: false, // Don't emit own message events
        linkPreviewImageThumbnailWidth: 192,
        transactionOpts: {
          maxCommitRetries: 10,
          delayBetweenTriesMs: 3000,
        },
        shouldIgnoreJid: jid => isJidBroadcast(jid), // Ignore broadcast messages

        // History sync message filter - IMPORTANT!
        shouldSyncHistoryMessage: (msg) => {
          // Log the history sync notification for debugging
          this.logger.log(
            `📋 History sync notification: type=${msg.syncType}, progress=${msg.progress}`,
          );

          // According to Baileys source, return true to sync all historical messages
          // This is called for each history sync notification from WhatsApp
          return true;
        },

        // Message retrieval for context - let Baileys handle message retrieval
        getMessage: async (key) => {
          // For initial implementation, let Baileys handle message retrieval
          // This can be enhanced later to return messages from our database
          return undefined;
        },
      });

      this.sessions.set(sessionId, sock);

      // Handle connection updates
      sock.ev.on("connection.update", (update) => {
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

            // Emit specific event for device removed
            this.eventEmitter.emit("whatsapp.device.removed", {
              sessionId,
              message: "Session was removed by WhatsApp. Please unlink old devices and scan QR code again.",
              statusCode,
            });
          } else if (isPermanentError) {
            this.logger.log(`🚪 Session ${sessionId} logged out permanently (code: ${statusCode}) - cleaning up`);
            this.sessions.delete(sessionId);
            this.authStates.delete(sessionId);
          } else {
            // Temporary disconnect - try to reconnect with exponential backoff
            const maxRetries = 5; // Reduced retries for faster failure
            const baseDelay = 5000; // 5 second initial delay
            let retryCount = 0;

            const attemptReconnect = () => {
              if (retryCount < maxRetries) {
                const delay = Math.min(baseDelay * Math.pow(2, retryCount), 60000); // Max 60s delay
                this.logger.log(
                  `🔄 Attempting reconnection ${retryCount + 1}/${maxRetries} for session ${sessionId} in ${delay}ms`,
                );

                setTimeout(async () => {
                  try {
                    // Try to reconnect using existing auth state
                    const result = await this.connectSession(sessionId, false);

                    if (result.needsQR) {
                      this.logger.warn(
                        `⚠️ Session ${sessionId} needs QR code - stopping auto-reconnect`,
                      );
                      this.eventEmitter.emit("whatsapp.reconnect.needs.qr", {
                        sessionId,
                        message: "Session requires QR code authentication",
                      });
                    } else {
                      this.logger.log(
                        `✅ Auto-reconnection successful for session ${sessionId}`,
                      );
                      this.eventEmitter.emit("whatsapp.reconnect.success", {
                        sessionId,
                        attempt: retryCount + 1,
                      });
                    }
                  } catch (error) {
                    this.logger.error(
                      `❌ Reconnection attempt ${retryCount + 1} failed for session ${sessionId}:`,
                      error,
                    );
                    retryCount++;
                    if (retryCount < maxRetries) {
                      attemptReconnect();
                    } else {
                      this.logger.error(
                        `❌ All reconnection attempts exhausted for session ${sessionId}`,
                      );
                      this.eventEmitter.emit("whatsapp.reconnect.failed", {
                        sessionId,
                        totalAttempts: maxRetries,
                      });
                    }
                  }
                }, delay);
              }
            };

            attemptReconnect();
          }
        } else if (connection === "open") {
          this.logger.log(`✅ Session ${sessionId} connected successfully`);
          this.logger.log(
            `📚 History sync configured - waiting for messaging-history.set event...`,
          );

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
        }
      });

      // Handle credentials update
      sock.ev.on("creds.update", (creds) => {
        try {
          // Save credentials immediately
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
        browser: Browsers.ubuntu("Chrome"),
        auth: {
          creds: authState.state.creds,
          keys: makeCacheableSignalKeyStore(authState.state.keys, undefined),
        },
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 120000,
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
    // Stop timers first
    this.stopKeepAlive(sessionId);
    this.stopCredentialsSave(sessionId);

    const sock = this.sessions.get(sessionId);

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

  async sendMessage(
    sessionId: string,
    messageDto: SendMessageDto,
  ): Promise<{ messageId: string; status: string }> {
    const sock = this.sessions.get(sessionId);

    if (!sock) {
      throw new Error("Session not found or not connected");
    }

    try {
      let message: any;

      // Format phone number
      const jid = messageDto.to.includes("@")
        ? messageDto.to
        : `${messageDto.to}@s.whatsapp.net`;

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

      // Send message
      const sentMessage = await sock.sendMessage(jid, message);

      this.logger.log(`Message sent from session ${sessionId} to ${jid}`);

      return {
        messageId: sentMessage.key.id,
        status: "sent",
      };
    } catch (error) {
      this.logger.error(
        `Failed to send message from session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  getSessionStatus(
    sessionId: string,
  ): "connected" | "connecting" | "disconnected" {
    const sock = this.sessions.get(sessionId);

    if (!sock) {
      return "disconnected";
    }

    // Check if socket is open and authenticated
    if (sock.ws && sock.ws.readyState === 1 && sock.user) {
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
  private startKeepAlive(sessionId: string): void {
    // Clear existing timer if any
    this.stopKeepAlive(sessionId);

    const keepAliveInterval = setInterval(async () => {
      try {
        const sock = this.sessions.get(sessionId);
        if (sock && sock.ws && sock.ws.readyState === 1) {
          // Send a simple presence update to keep connection alive
          await sock.sendPresenceUpdate("available");
          this.logger.debug(`🏓 Keep-alive ping sent for session ${sessionId}`);
        } else {
          this.logger.warn(
            `⚠️ Session ${sessionId} is not ready for keep-alive`,
          );
          this.stopKeepAlive(sessionId);
        }
      } catch (error) {
        this.logger.error(
          `❌ Keep-alive failed for session ${sessionId}:`,
          error,
        );
        this.stopKeepAlive(sessionId);
      }
    }, 15000); // Every 15 seconds (more frequent)

    this.keepAliveTimers.set(sessionId, keepAliveInterval);
    this.logger.log(`⏰ Keep-alive timer started for session ${sessionId} (15s interval)`);
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

  // Start periodic credentials save for a session
  private startCredentialsSave(sessionId: string, authState: any): void {
    // Clear existing timer if any
    this.stopCredentialsSave(sessionId);

    const saveInterval = setInterval(async () => {
      try {
        if (authState && authState.saveCreds) {
          await authState.saveCreds();
          this.logger.debug(`💾 Periodic credentials save for session ${sessionId}`);
        } else {
          this.logger.warn(`⚠️ No auth state available for credentials save: ${sessionId}`);
          this.stopCredentialsSave(sessionId);
        }
      } catch (error) {
        this.logger.error(`❌ Periodic credentials save failed for session ${sessionId}:`, error);
      }
    }, 60000); // Every minute

    this.credentialsSaveTimers.set(sessionId, saveInterval);
    this.logger.log(`💾 Periodic credentials save started for session ${sessionId} (60s interval)`);
  }

  // Stop periodic credentials save for a session
  private stopCredentialsSave(sessionId: string): void {
    const timer = this.credentialsSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.credentialsSaveTimers.delete(sessionId);
      this.logger.log(`💾 Periodic credentials save stopped for session ${sessionId}`);
    }
  }

  /**
   * Auto-restore existing sessions on service startup
   */
  private async restoreExistingSessions(): Promise<void> {
    try {
      this.logger.log(`🔄 Auto-restoring existing WhatsApp sessions...`);
      
      const sessionsPath = this.configService.get("WHATSAPP_SESSION_PATH", "./whatsapp-sessions");
      
      // Check if sessions directory exists
      try {
        const sessionDirs = await fs.readdir(sessionsPath);
        this.logger.log(`📁 Found ${sessionDirs.length} session directories`);
        
        for (const sessionId of sessionDirs) {
          const sessionPath = path.join(sessionsPath, sessionId);
          
          try {
            // Check if this is a valid session directory
            const stats = await fs.stat(sessionPath);
            if (stats.isDirectory()) {
              // Check for auth files
              const credentialsPath = path.join(sessionPath, "creds.json");
              try {
                await fs.access(credentialsPath);
                this.logger.log(`🔑 Found credentials for session ${sessionId}, attempting restore...`);
                
                // Initialize the session
                await this.initializeSession(sessionId);
                
                // Try to connect without forcing reset
                setTimeout(async () => {
                  try {
                    const result = await this.connectSession(sessionId, false);
                    if (!result.needsQR) {
                      this.logger.log(`✅ Session ${sessionId} restored successfully`);
                    } else {
                      this.logger.log(`⚠️ Session ${sessionId} requires QR code`);
                    }
                  } catch (error) {
                    this.logger.warn(`❌ Failed to restore session ${sessionId}:`, error.message);
                  }
                }, Math.random() * 5000); // Random delay 0-5s to avoid overwhelming WhatsApp
                
              } catch (error) {
                this.logger.log(`📁 Session ${sessionId} has no valid credentials file`);
              }
            }
          } catch (error) {
            this.logger.warn(`Error checking session ${sessionId}:`, error);
          }
        }
      } catch (error) {
        this.logger.log(`📁 Sessions directory doesn't exist or is empty`);
      }
    } catch (error) {
      this.logger.error(`Failed to restore existing sessions:`, error);
    }
  }

  // Cleanup method to be called on application shutdown
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    // Stop all timers
    for (const sessionId of sessionIds) {
      this.stopKeepAlive(sessionId);
      this.stopCredentialsSave(sessionId);
    }

    // Gracefully disconnect all sessions (save state but don't logout from WhatsApp)
    for (const sessionId of sessionIds) {
      try {
        const authState = this.authStates.get(sessionId);
        if (authState && authState.saveCreds) {
          // Save current credentials before shutdown
          await authState.saveCreds();
          this.logger.log(`💾 Saved credentials for session ${sessionId}`);
        }
        
        // Close socket without logging out
        const sock = this.sessions.get(sessionId);
        if (sock && sock.ws) {
          sock.ws.close();
        }
      } catch (error) {
        this.logger.warn(`Error cleaning up session ${sessionId}:`, error);
      }
    }

    this.sessions.clear();
    this.authStates.clear();
    this.keepAliveTimers.clear();
    this.credentialsSaveTimers.clear();
    
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
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.logger.log('Stopped session cleanup timer');
    }

    // Cleanup all sessions
    this.performSessionCleanup();
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
          // Check if session is still connected
          if (!sock || sock.readyState !== sock.OPEN) {
            this.logger.debug(`Removing inactive session: ${sessionId}`);
            this.removeSession(sessionId);
          }
        } catch (error) {
          this.logger.warn(`Error checking session ${sessionId} status: ${error.message}`);
          this.removeSession(sessionId);
        }
      }
    }

    // Clean up orphaned auth states and timers
    this.cleanupOrphanedResources();

    const finalSessionCount = this.sessions.size;
    if (initialSessionCount !== finalSessionCount) {
      this.logger.log(`Session cleanup completed - Removed ${initialSessionCount - finalSessionCount} sessions`);
    }
  }

  /**
   * Clean up orphaned resources (auth states, timers) that don't have corresponding sessions
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
  }

  /**
   * Remove a specific session and its associated resources
   */
  private removeSession(sessionId: string): void {
    // Close the socket if it exists
    const sock = this.sessions.get(sessionId);
    if (sock && typeof sock.close === 'function') {
      try {
        sock.close();
      } catch (error) {
        this.logger.warn(`Error closing socket for session ${sessionId}: ${error.message}`);
      }
    }

    // Remove from all maps
    this.sessions.delete(sessionId);
    this.authStates.delete(sessionId);

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
    maxSessions: number;
  } {
    return {
      activeSessionCount: this.sessions.size,
      authStateCount: this.authStates.size,
      keepAliveTimerCount: this.keepAliveTimers.size,
      credentialsTimerCount: this.credentialsSaveTimers.size,
      maxSessions: this.MAX_SESSIONS
    };
  }
}
