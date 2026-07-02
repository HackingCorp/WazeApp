import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { v4 as uuidv4 } from "uuid";
import { BaileysService } from "./baileys.service";
import {
  WhatsAppSession,
  WhatsAppContact,
  User,
  AgentConversation,
  AgentMessage,
  AiAgent,
  Organization,
} from "@/common/entities";
import {
  ConversationStatus,
  MessageRole,
  MessageStatus,
  ConversationChannel,
  AgentStatus,
  AgentLanguage,
  AgentTone,
} from "@/common/enums";

export interface ConversationData {
  id: string;
  phoneNumber: string;
  name: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  isOnline: boolean;
  userId: string;
  sessionId: string;
  profilePictureUrl?: string;
}

export interface MessageData {
  id: string;
  content: string;
  timestamp: Date;
  sender: "user" | "agent" | "client";
  type: "text" | "image" | "audio" | "file" | "video";
  status: "sending" | "sent" | "delivered" | "read";
  mediaUrl?: string;
  mediaType?: string;
  mediaCaption?: string;
  metadata?: {
    whatsappMessageId?: string;
    fromWhatsApp?: boolean;
    originalSender?: string;
    [key: string]: any;
  };
}

@Injectable()
export class SimpleConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(SimpleConversationService.name);

  // In-memory storage for quick access (in production, use Redis or database)
  private conversations = new Map<string, ConversationData>();
  private messages = new Map<string, MessageData[]>();

  // Memory management configuration
  private readonly MAX_CONVERSATIONS_IN_MEMORY = 1000; // Maximum conversations to keep in memory
  private readonly MAX_MESSAGES_PER_CONVERSATION = 100; // Maximum messages per conversation in memory
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes
  private readonly CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000; // Remove conversations older than 24 hours from memory
  private cleanupTimer: NodeJS.Timeout;

  // Serializes sync batch processing to avoid saturating the DB connection pool
  private syncQueue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(WhatsAppContact)
    private contactRepository: Repository<WhatsAppContact>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => BaileysService))
    private baileysService: BaileysService,
  ) {
    // Load existing conversations from database on startup
    this.loadPersistedConversations();

    // Listen for persistence events
    this.eventEmitter.on(
      "whatsapp.persist.conversations",
      this.handlePersistConversations.bind(this),
    );

    // Start periodic cleanup to prevent memory leaks
    this.startMemoryCleanup();
  }

  @OnEvent("whatsapp.sync.messages.batch")
  async handleWhatsAppSyncMessagesBatch(data: {
    sessionId: string;
    messages: Array<{
      sessionId: string;
      fromNumber: string;
      messageText: string;
      messageId: string;
      timestamp: Date;
      isGroup?: boolean;
      groupId?: string;
      participant?: string;
      isHistorical?: boolean;
      isFromMe?: boolean;
      messageType?: string;
    }>;
  }) {
    const { sessionId, messages } = data;

    // Queue this batch behind any currently-processing batch to avoid
    // saturating the DB connection pool when multiple batches arrive rapidly
    this.syncQueue = this.syncQueue.then(async () => {
      // Fetch session once for the entire batch
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!session) {
        this.logger.warn(
          `Session ${sessionId} not found for sync messages batch`,
        );
        return;
      }

      this.logger.log(
        `Processing batch of ${messages.length} sync messages for session ${sessionId}`,
      );

      // Process messages sequentially to avoid DB connection issues
      for (const messageData of messages) {
        try {
          // Convert sync message to conversation message format
          const conversationMessageData = {
            sessionId: messageData.sessionId,
            userId: session.userId,
            organizationId: session.organizationId,
            fromNumber: messageData.fromNumber,
            messageText: messageData.messageText,
            messageId: messageData.messageId,
            timestamp: messageData.timestamp,
            isGroup: messageData.isGroup,
            groupId: messageData.groupId,
            participant: messageData.participant,
            isHistorical: messageData.isHistorical,
            isFromMe: messageData.isFromMe,
            messageType: messageData.messageType,
          };

          await this.handleWhatsAppMessage(conversationMessageData);
        } catch (error) {
          this.logger.error(
            `Error processing sync message ${messageData.messageId}:`,
            error,
          );
        }
      }

      this.logger.log(`Completed processing batch for session ${sessionId}`);
    }).catch(err => this.logger.error('Sync queue error:', err));
  }

  @OnEvent("whatsapp.sync.message")
  async handleWhatsAppSyncMessage(data: {
    sessionId: string;
    fromNumber: string;
    messageText: string;
    messageId: string;
    timestamp: Date;
    isGroup?: boolean;
    groupId?: string;
    participant?: string;
    isHistorical?: boolean;
    isFromMe?: boolean;
    messageType?: string;
  }) {
    // Handle individual messages (for backwards compatibility)
    const session = await this.sessionRepository.findOne({
      where: { id: data.sessionId },
    });

    if (session) {
      const conversationMessageData = {
        sessionId: data.sessionId,
        userId: session.userId,
        organizationId: session.organizationId,
        fromNumber: data.fromNumber,
        messageText: data.messageText,
        messageId: data.messageId,
        timestamp: data.timestamp,
        isGroup: data.isGroup,
        groupId: data.groupId,
        participant: data.participant,
        isHistorical: data.isHistorical,
        isFromMe: data.isFromMe,
        messageType: data.messageType,
      };

      await this.handleWhatsAppMessage(conversationMessageData);
    } else {
      this.logger.warn(`Session ${data.sessionId} not found for sync message`);
    }
  }

  @OnEvent("whatsapp.session.ready")
  async handleWhatsAppSessionReady(data: {
    sessionId: string;
    status: string;
  }) {
    const { sessionId, status } = data;
    this.logger.log(`📱 WhatsApp session ${sessionId} is ready (${status})`);

    // Emit notification to frontend that sync is starting
    this.eventEmitter.emit("whatsapp.sync.started", {
      sessionId,
      status: "started",
      message: "Starting historical message sync...",
    });
  }

  @OnEvent("whatsapp.sync.completed")
  async handleWhatsAppSyncCompleted(data: {
    sessionId: string;
    messageCount: number;
  }) {
    try {
      const { sessionId, messageCount } = data;
      this.logger.log(
        `✅ WhatsApp sync completed for session ${sessionId}: ${messageCount} messages processed`,
      );

      // Emit notification to frontend that sync is complete
      this.eventEmitter.emit("whatsapp.sync.completed", {
        sessionId,
        status: "completed",
        messageCount,
        message: `Sync completed! ${messageCount} messages processed.`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle sync completion for session ${data?.sessionId}: ${error?.message}`,
      );
    }
  }

  @OnEvent("whatsapp.image.downloaded")
  async handleImageDownloaded(data: {
    sessionId: string;
    messageId: string;
    chatId: string;
    imageData: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      // Find the message by messageId and update its mediaUrl
      const message = await this.messageRepository.findOne({
        where: { externalMessageId: data.messageId },
      });

      if (message) {
        message.mediaUrl = data.imageData;
        message.mediaType = 'image/jpeg';
        // If content was placeholder, keep it
        await this.messageRepository.save(message);
        this.logger.log(
          `📸 Updated media URL for message ${data.messageId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update image for message ${data.messageId}:`,
        error,
      );
    }
  }

  @OnEvent("whatsapp.conversation.message")
  async handleWhatsAppMessage(data: {
    sessionId: string;
    userId: string;
    organizationId?: string;
    fromNumber: string;
    messageText: string;
    messageId: string;
    timestamp: Date;
    isGroup?: boolean;
    groupId?: string;
    participant?: string;
    isHistorical?: boolean;
    isFromMe?: boolean;
    messageType?: string;
  }) {
    const {
      sessionId,
      userId,
      fromNumber,
      messageText,
      messageId,
      timestamp,
      isGroup,
      groupId,
      participant,
      isHistorical,
      isFromMe,
      messageType,
    } = data;

    this.logger.log(
      `Handling WhatsApp ${isGroup ? "group" : "individual"} message from ${fromNumber}: ${messageText}`,
    );

    try {
      // Get or create conversation
      let conversation = await this.findConversationByPhone(fromNumber, userId, sessionId);

      if (!conversation) {
        conversation = await this.createConversation(
          sessionId,
          userId,
          fromNumber,
          isGroup,
        );
        // Persist new conversation to database
        await this.persistConversation(conversation);
      }

      // Generate UUID for message ID while preserving original WhatsApp message ID in metadata
      const messageUUID = uuidv4();

      // Determine the message sender and type based on isFromMe and messageType
      // Use 'client' for WhatsApp clients (left side), 'user' for sent by us (right side)
      const isMediaMessage = messageType && ["image", "video", "audio", "file"].includes(messageType);
      const isDataUrl = messageText && (messageText.startsWith('data:') || messageText.startsWith('http'));

      // For media messages, set mediaUrl and mediaType properly
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      let mediaCaption: string | undefined;
      let content = messageText;

      if (isMediaMessage && isDataUrl) {
        mediaUrl = messageText;
        // Extract mime type from data URL if present
        if (messageText.startsWith('data:')) {
          const mimeMatch = messageText.match(/^data:([^;]+);/);
          mediaType = mimeMatch ? mimeMatch[1] : `${messageType}/*`;
        } else {
          mediaType = `${messageType}/*`;
        }
        content = `[${messageType}]`; // Placeholder content for media
      } else if (isMediaMessage) {
        // Media message but no data URL - set mediaType anyway for proper frontend display
        // The caption or placeholder text might be in messageText
        mediaType = `${messageType}/*`; // e.g., "image/*", "video/*", etc.

        // If messageText looks like a caption (not a placeholder), save it as caption
        if (messageText && !messageText.startsWith('[') && messageText !== 'Media message') {
          mediaCaption = messageText;
          content = `[${messageType}]`; // Placeholder content since we have a caption
        } else {
          content = messageText || `[${messageType}]`;
        }
      }

      const message: MessageData = {
        id: messageUUID,
        content,
        timestamp,
        sender: isFromMe ? "user" : "client", // If fromMe, it's sent by us (user), otherwise from WhatsApp client (client)
        type: (messageType || "text") as "text" | "image" | "audio" | "file" | "video",
        status: "read",
        mediaUrl,
        mediaType,
        mediaCaption,
        metadata: {
          whatsappMessageId: messageId,
          fromWhatsApp: true,
          originalSender: isFromMe ? "user" : "client",
        },
      };

      this.addMessage(conversation.id, message);

      // Persist message to database
      await this.persistMessage(conversation.id, message);

      // Update conversation
      conversation.lastMessage = messageText;
      conversation.lastMessageTime = timestamp;
      conversation.unreadCount += 1;

      this.conversations.set(conversation.id, conversation);

      // Persist conversation updates
      await this.persistConversationUpdate(conversation.id, {
        lastMessage: messageText,
        lastMessageTime: timestamp,
        unreadCount: conversation.unreadCount,
      });

      // Emit WebSocket event for real-time updates (UI only, not triggering AI)
      this.logger.log(
        `🚀 EMITTING whatsapp.ui.message.update event for user ${userId}, conversation ${conversation.id}`,
      );
      this.logger.log(
        `🚀 EventEmitter instance: ${this.eventEmitter.constructor.name}`,
      );
      this.logger.log(
        `🚀 Event listeners count: ${this.eventEmitter.listenerCount("whatsapp.ui.message.update")}`,
      );

      // Emit UI update event (different from whatsapp.message.received to avoid triggering AI responder twice)
      this.eventEmitter.emit("whatsapp.ui.message.update", {
        userId,
        conversationId: conversation.id,
        message: message,
        contact: {
          id: conversation.id,
          name: conversation.name,
          phone: conversation.phoneNumber,
          lastMessage: messageText,
          lastMessageTime: timestamp,
          unreadCount: conversation.unreadCount,
          isOnline: conversation.isOnline,
        },
      });

      // AI responses are now handled by WhatsAppAIResponderService, not here
      // This prevents duplicate AI responses
      this.logger.log(
        `🤖 AI Generation Decision: fromNumber=${fromNumber}, isHistorical=${isHistorical}, isFromMe=${isFromMe}, shouldGenerateAI=false (handled by WhatsAppAIResponderService)`,
      );

      const aiResponse = null; // Disabled - AI responses handled by dedicated service

      if (aiResponse) {
        // Generate UUID for consistent ID between memory and database
        const messageId = uuidv4();
        const agentMessage: MessageData = {
          id: messageId,
          content: aiResponse,
          timestamp: new Date(),
          sender: "agent",
          type: "text",
          status: "sent",
        };

        this.addMessage(conversation.id, agentMessage);

        // Persist agent message to database
        await this.persistMessage(conversation.id, agentMessage);

        // Send the response back via WhatsApp
        this.eventEmitter.emit("whatsapp.send.message", {
          sessionId,
          phoneNumber: fromNumber,
          message: aiResponse,
        });

        // Update conversation with AI response
        conversation.lastMessage = aiResponse;
        conversation.lastMessageTime = new Date();
        this.conversations.set(conversation.id, conversation);

        // Persist conversation updates
        await this.persistConversationUpdate(conversation.id, {
          lastMessage: aiResponse,
          lastMessageTime: new Date(),
        });

        // Emit WebSocket event for AI response (UI update only)
        this.eventEmitter.emit("whatsapp.ui.message.update", {
          userId,
          conversationId: conversation.id,
          message: agentMessage,
          contact: {
            id: conversation.id,
            name: conversation.name,
            phone: conversation.phoneNumber,
            lastMessage: aiResponse,
            lastMessageTime: new Date(),
            unreadCount: conversation.unreadCount,
            isOnline: conversation.isOnline,
          },
        });
      }

      this.logger.log(`Processed message from ${fromNumber}: ${messageText}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle WhatsApp message from ${fromNumber}:`,
        error,
      );
    }
  }

  /**
   * Normalize phone number to consistent format for comparison
   * Removes WhatsApp suffixes (including @lid) and ensures consistent formatting
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber
      .replace(/@s\.whatsapp\.net$/i, "")
      .replace(/@g\.us$/i, "")
      .replace(/@lid$/i, "")
      .replace(/\s+/g, "")
      .replace(/^\+/, "")
      .trim();
  }

  private async findConversationByPhone(
    phoneNumber: string,
    userId: string,
    sessionId?: string,
  ): Promise<ConversationData | undefined> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    // First check in-memory conversations with normalized comparison
    for (const [id, conversation] of this.conversations.entries()) {
      if (
        conversation.phoneNumber === normalizedPhone &&
        conversation.userId === userId &&
        (!sessionId || conversation.sessionId === sessionId)
      ) {
        return conversation;
      }
    }

    // Then check database for persisted conversations with normalized comparison
    try {
      const whereConditions: any = {
        userId: userId,
        channel: ConversationChannel.WHATSAPP,
      };
      if (sessionId) {
        whereConditions.sessionId = sessionId;
      }
      const dbConversations = await this.conversationRepository.find({
        where: whereConditions,
        order: { updatedAt: "DESC" },
        take: 100,
      });

      // Find matching conversation by normalizing the externalId
      let dbConversation = dbConversations.find((conv) => {
        const normalizedExternalId = this.normalizePhoneNumber(
          conv.externalId || "",
        );
        return normalizedExternalId === normalizedPhone;
      });

      // Also check context.sessionId for older conversations
      if (!dbConversation && sessionId) {
        const contextMatches = await this.conversationRepository
          .createQueryBuilder('conv')
          .where('conv.userId = :userId', { userId })
          .andWhere('conv.channel = :channel', { channel: ConversationChannel.WHATSAPP })
          .andWhere("conv.context->>'sessionId' = :sessionId", { sessionId })
          .orderBy('conv.updatedAt', 'DESC')
          .take(100)
          .getMany();
        dbConversation = contextMatches.find((conv) => {
          const normalizedExternalId = this.normalizePhoneNumber(conv.externalId || "");
          return normalizedExternalId === normalizedPhone;
        });
      }

      if (dbConversation) {
        // Get last message and unread count with targeted queries instead of loading all messages
        const lastMessage = await this.messageRepository.findOne({
          where: { conversationId: dbConversation.id },
          order: { createdAt: "DESC" },
        });
        const unreadCount = await this.messageRepository.count({
          where: { conversationId: dbConversation.id, status: MessageStatus.DELIVERED },
        });

        // Convert to ConversationData format and cache in memory
        const conversationData: ConversationData = {
          id: dbConversation.id,
          phoneNumber: dbConversation.externalId || "Unknown",
          name:
            dbConversation.context?.userProfile?.name ||
            dbConversation.externalId ||
            "Unknown",
          lastMessage: lastMessage?.content || "",
          lastMessageTime: lastMessage?.createdAt || dbConversation.updatedAt,
          unreadCount,
          isOnline: true, // Default to online for found conversations
          userId: dbConversation.userId || "",
          sessionId: dbConversation.sessionId || dbConversation.context?.sessionId || "",
        };

        this.conversations.set(conversationData.id, conversationData);
        return conversationData;
      }
    } catch (error) {
      this.logger.error(
        `Error finding conversation by phone ${phoneNumber}:`,
        error,
      );
    }

    return undefined;
  }

  private async createConversation(
    sessionId: string,
    userId: string,
    phoneNumber: string,
    isGroup?: boolean,
  ): Promise<ConversationData> {
    // Generate proper UUID for conversation ID
    const conversationId = uuidv4();

    // Normalize the phone number for consistent storage
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    // Format display name for groups vs individuals
    let displayName;
    if (isGroup) {
      const groupId = phoneNumber.includes("@g.us")
        ? phoneNumber.split("@")[0]
        : phoneNumber;
      displayName = `📱 Group ${groupId}`;
    } else {
      // Check if this looks like a LID (too many digits for a real phone number)
      // Real international phone numbers are typically 7-13 digits
      const digitsOnly = normalizedPhone.replace(/\D/g, '');
      const isLikelyLID = normalizedPhone.startsWith('lid_') ||
        normalizedPhone.startsWith('lid') ||
        digitsOnly.length > 13;

      if (isLikelyLID) {
        // This is likely a LID, use a generic name
        displayName = 'Contact WhatsApp';
      } else {
        // For individual chats with real phone numbers, use the normalized phone number as display name
        displayName = normalizedPhone.startsWith("+")
          ? normalizedPhone
          : `+${normalizedPhone}`;
      }
    }

    const conversation: ConversationData = {
      id: conversationId,
      phoneNumber: normalizedPhone, // Store normalized phone number
      name: displayName,
      lastMessage: "",
      lastMessageTime: new Date(),
      unreadCount: 0,
      isOnline: true,
      userId,
      sessionId,
    };

    this.conversations.set(conversationId, conversation);
    this.messages.set(conversationId, []);

    return conversation;
  }

  private addMessage(conversationId: string, message: MessageData): void {
    const existingMessages = this.messages.get(conversationId) || [];
    existingMessages.push(message);
    
    // Limit messages per conversation to prevent memory growth
    if (existingMessages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
      // Keep only the most recent messages
      const recentMessages = existingMessages.slice(-this.MAX_MESSAGES_PER_CONVERSATION);
      this.logger.debug(`Trimmed conversation ${conversationId} to ${this.MAX_MESSAGES_PER_CONVERSATION} messages`);
      this.messages.set(conversationId, recentMessages);
    } else {
      this.messages.set(conversationId, existingMessages);
    }
  }

  private async generateAIResponse(
    message: string,
    phoneNumber: string,
  ): Promise<string> {
    // Simple AI responses - in production, integrate with OpenAI, Claude, etc.
    const responses = [
      "Hello! I'm an AI assistant. How can I help you today?",
      "Thanks for your message! I'm here to assist you.",
      "I understand you're reaching out. Let me help you with that.",
      "Great question! Let me provide you with some information.",
      "I'm here to help! What would you like to know?",
    ];

    // Simple keyword-based responses
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("hello") ||
      lowerMessage.includes("hi") ||
      lowerMessage.includes("hey")
    ) {
      return "Hello! Welcome to our WhatsApp AI assistant. How can I help you today?";
    }

    if (lowerMessage.includes("help")) {
      return "I'm here to help! You can ask me questions about our services, get support, or just chat. What do you need assistance with?";
    }

    if (lowerMessage.includes("thank")) {
      return "You're very welcome! Is there anything else I can help you with?";
    }

    if (lowerMessage.includes("bye") || lowerMessage.includes("goodbye")) {
      return "Goodbye! Feel free to message me anytime if you need help. Have a great day! 👋";
    }

    if (lowerMessage.includes("price") || lowerMessage.includes("cost")) {
      return "I'd be happy to help you with pricing information. Could you tell me more about what you're interested in?";
    }

    // Default response
    const randomResponse =
      responses[Math.floor(Math.random() * responses.length)];
    return `${randomResponse} You said: "${message}" - How can I assist you further?`;
  }

  // Check if a phone number looks like a LID (Linked Identity) instead of a real phone
  private isLikelyLID(phone: string): boolean {
    if (!phone) return false;
    const cleaned = phone.replace(/\D/g, ''); // Remove non-digits

    // LID identifiers typically:
    // - Are 14+ digits long (real phone numbers are typically 7-13 digits)
    // - Start with lid_ prefix
    if (phone.startsWith('lid_') || phone.startsWith('lid')) {
      return true;
    }

    // Real international phone numbers are typically 7-13 digits
    // Numbers with 14+ digits are almost certainly WhatsApp LIDs
    return cleaned.length > 13;
  }

  // API methods for frontend
  async getConversationsForUser(
    userId: string,
    sessionId?: string,
  ): Promise<ConversationData[]> {
    try {
      this.logger.log(
        `📋 Getting conversations for user ${userId}${sessionId ? `, sessionId: ${sessionId}` : ""}`,
      );

      // Get conversations from database (filter by sessionId at DB level if provided)
      let dbConversations: AgentConversation[];
      if (sessionId && sessionId.trim() !== "") {
        // Filter by sessionId in BOTH the entity column AND the context JSONB field
        // (older conversations may only have sessionId in context)
        dbConversations = await this.conversationRepository
          .createQueryBuilder('conv')
          .where('conv.channel = :channel', { channel: ConversationChannel.WHATSAPP })
          .andWhere('conv.userId = :userId', { userId })
          .andWhere(
            '(conv.sessionId = :sessionId OR (conv.sessionId IS NULL AND conv.context->>\'sessionId\' = :sessionId))',
            { sessionId },
          )
          .orderBy('conv.updatedAt', 'DESC')
          .take(100)
          .getMany();
      } else {
        dbConversations = await this.conversationRepository.find({
          where: {
            channel: ConversationChannel.WHATSAPP,
            userId: userId,
          },
          order: { updatedAt: "DESC" },
          take: 100,
        });
      }

      this.logger.log(
        `💾 Found ${dbConversations.length} persisted conversations in database`,
      );

      // Get all contacts for enrichment (if we have a sessionId)
      let contactsMap = new Map<string, WhatsAppContact>();
      let contactsByLid = new Map<string, WhatsAppContact>();
      if (sessionId) {
        try {
          const contacts = await this.contactRepository.find({
            where: { sessionId },
          });
          contacts.forEach(contact => {
            if (contact.phoneNumber) {
              contactsMap.set(contact.phoneNumber, contact);
              // Also map with + prefix
              if (!contact.phoneNumber.startsWith('+')) {
                contactsMap.set(`+${contact.phoneNumber}`, contact);
              }
              // Also map without + prefix
              if (contact.phoneNumber.startsWith('+')) {
                contactsMap.set(contact.phoneNumber.substring(1), contact);
              }
              // If phoneNumber looks like a LID, also index it in contactsByLid
              if (this.isLikelyLID(contact.phoneNumber)) {
                contactsByLid.set(contact.phoneNumber, contact);
                contactsByLid.set(contact.phoneNumber.replace(/^lid_?/i, ''), contact);
              }
            }
            // Also index by LID for LID-based lookups
            if (contact.lid) {
              contactsByLid.set(contact.lid, contact);
              // Also try without any prefix
              contactsByLid.set(contact.lid.replace(/^lid_?/i, ''), contact);
            }
          });
          this.logger.debug(`Loaded ${contacts.length} contacts for enrichment (${contactsByLid.size} with LID)`);
        } catch (error) {
          this.logger.debug(`Could not load contacts for enrichment: ${error.message}`);
        }
      }

      // Get last messages and unread counts for all conversations with targeted queries
      const convIds = dbConversations.map(c => c.id);

      // Batch queries: last message + unread count per conversation (run in parallel)
      const lastMessagesMap = new Map<string, AgentMessage>();
      const unreadCountsMap = new Map<string, number>();
      if (convIds.length > 0) {
        const [lastMessages, unreadCounts] = await Promise.all([
          // Last message per conversation using DISTINCT ON (single pass, no correlated subquery)
          this.messageRepository
            .createQueryBuilder('m')
            .distinctOn(['m.conversationId'])
            .where('m.conversationId IN (:...convIds)', { convIds })
            .orderBy('m.conversationId')
            .addOrderBy('m.createdAt', 'DESC')
            .getMany(),
          // Unread count per conversation
          this.messageRepository
            .createQueryBuilder('m')
            .select('m.conversationId', 'conversationId')
            .addSelect('COUNT(*)', 'count')
            .where('m.conversationId IN (:...convIds)', { convIds })
            .andWhere('m.status = :status', { status: MessageStatus.DELIVERED })
            .groupBy('m.conversationId')
            .getRawMany(),
        ]);
        for (const msg of lastMessages) {
          lastMessagesMap.set(msg.conversationId, msg);
        }
        for (const row of unreadCounts) {
          unreadCountsMap.set(row.conversationId, parseInt(row.count));
        }
      }

      // Convert to ConversationData format and filter by sessionId if provided
      let persistedConversations: ConversationData[] = dbConversations.map(
        (dbConv) => {
          const lastMessage = lastMessagesMap.get(dbConv.id);

          // Get phone number from externalId or context
          let rawPhone =
            dbConv.externalId || dbConv.context?.userProfile?.phone || "";
          const normalizedPhone = this.normalizePhoneNumber(rawPhone);

          // Try to get contact info for this phone number
          let contact = contactsMap.get(normalizedPhone) ||
            contactsMap.get(`+${normalizedPhone}`) ||
            contactsMap.get(normalizedPhone.replace(/^\+/, ''));

          // If phone looks like a LID, also try to look up by LID
          if (!contact && this.isLikelyLID(normalizedPhone)) {
            const lidValue = normalizedPhone.replace(/^lid_?/i, '');
            contact = contactsByLid.get(lidValue) ||
              contactsByLid.get(normalizedPhone) ||
              contactsByLid.get(`lid_${lidValue}`);
          }

          // Format display name properly
          let displayName;
          let resolvedPhone = normalizedPhone;

          // If we found a contact, try to get a better phone number from it
          if (contact) {
            // Use contact's phone number if it's better than what we have
            if (contact.phoneNumber && !this.isLikelyLID(contact.phoneNumber)) {
              resolvedPhone = contact.phoneNumber;
            }
          }

          // First priority: contact name from WhatsApp contacts
          if (contact?.name || contact?.pushName || contact?.shortName) {
            displayName = contact.name || contact.pushName || contact.shortName;
          }
          // Second priority: name from conversation context
          else if (dbConv.context?.userProfile?.name &&
                   dbConv.context.userProfile.name !== rawPhone &&
                   !this.isLikelyLID(dbConv.context.userProfile.name)) {
            displayName = dbConv.context.userProfile.name;
          }
          // Third priority: resolved phone number if it's valid (not a LID)
          else if (resolvedPhone && !this.isLikelyLID(resolvedPhone)) {
            displayName = resolvedPhone.startsWith("+")
              ? resolvedPhone
              : `+${resolvedPhone}`;
          }
          // Fallback for LIDs or unknown
          else {
            displayName = "Contact WhatsApp";
          }

          return {
            id: dbConv.id,
            phoneNumber: normalizedPhone, // Store normalized phone number
            name: displayName,
            lastMessage: lastMessage?.content || "",
            lastMessageTime: lastMessage?.createdAt || dbConv.updatedAt,
            unreadCount: unreadCountsMap.get(dbConv.id) || 0,
            isOnline: false, // Default to offline for historical conversations
            userId: dbConv.userId || "",
            sessionId: dbConv.sessionId || dbConv.context?.sessionId || "",
            profilePictureUrl: contact?.profilePictureUrl,
          };
        },
      );

      // Also include memory conversations that aren't persisted yet
      let memoryConversations = Array.from(this.conversations.values()).filter(
        (conv) => {
          if (conv.userId !== userId) return false;
          // Filter by sessionId if provided
          if (sessionId && sessionId.trim() !== "") {
            return conv.sessionId === sessionId;
          }
          return true;
        },
      );

      // Merge and deduplicate by conversation ID first, then by phone number, prioritizing memory conversations (more recent)
      let allConversations = [...persistedConversations];
      memoryConversations.forEach((memConv) => {
        // First try to find by conversation ID (more reliable)
        let existingIndex = allConversations.findIndex(
          (dbConv) => dbConv.id === memConv.id,
        );

        // If not found by ID, try by phone number and userId
        if (existingIndex === -1) {
          existingIndex = allConversations.findIndex(
            (dbConv) =>
              this.normalizePhoneNumber(dbConv.phoneNumber) ===
                this.normalizePhoneNumber(memConv.phoneNumber) &&
              dbConv.userId === memConv.userId &&
              this.normalizePhoneNumber(dbConv.phoneNumber), // Only match if normalized phone is not empty
          );
        }

        if (existingIndex >= 0) {
          // Keep database version but update with memory conversation's real-time data
          const dbConv = allConversations[existingIndex];
          allConversations[existingIndex] = {
            ...dbConv, // Keep database data (phoneNumber, name, etc.)
            isOnline: memConv.isOnline, // Update real-time status
            unreadCount: memConv.unreadCount, // Update unread count
            lastMessage:
              memConv.lastMessageTime > dbConv.lastMessageTime
                ? memConv.lastMessage
                : dbConv.lastMessage,
            lastMessageTime:
              memConv.lastMessageTime > dbConv.lastMessageTime
                ? memConv.lastMessageTime
                : dbConv.lastMessageTime,
          };
        } else {
          // Add new conversation
          allConversations.push(memConv);
        }
      });

      // Remove duplicates by normalized phone number, keeping the most recent one
      const phoneGroups = new Map<string, ConversationData>();
      allConversations.forEach((conv) => {
        const normalizedPhone = this.normalizePhoneNumber(conv.phoneNumber);
        const key = `${conv.userId}-${normalizedPhone}`;
        const existing = phoneGroups.get(key);
        if (!existing || conv.lastMessageTime > existing.lastMessageTime) {
          // Format display name - keep existing name if it's good, otherwise derive from phone
          let displayName = conv.name;

          // Only update name if it looks like a phone number we should reformat or is a LID
          if (displayName === normalizedPhone || displayName === `+${normalizedPhone}` || this.isLikelyLID(displayName)) {
            if (this.isLikelyLID(normalizedPhone)) {
              displayName = "Contact WhatsApp";
            } else {
              displayName = normalizedPhone.startsWith("+")
                ? normalizedPhone
                : `+${normalizedPhone}`;
            }
          }

          // Update the conversation to use normalized phone number for consistent display
          phoneGroups.set(key, {
            ...conv,
            phoneNumber: normalizedPhone,
            name: displayName,
          });
        }
      });
      allConversations = Array.from(phoneGroups.values());

      this.logger.log(
        `📞 After deduplication: ${allConversations.length} unique conversations`,
      );

      // Sort by last message time
      return allConversations.sort(
        (a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime(),
      );
    } catch (error) {
      this.logger.error(
        `Error fetching conversations for user ${userId}:`,
        error,
      );
      // Fallback to memory-only conversations
      const userConversations = Array.from(this.conversations.values())
        .filter((conv) => conv.userId === userId)
        .sort(
          (a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime(),
        );

      return userConversations;
    }
  }

  async getMessagesForConversation(
    conversationId: string,
    userId?: string,
  ): Promise<MessageData[]> {
    try {
      // Verify conversation ownership if userId provided
      if (userId) {
        const conversation = await this.conversationRepository.findOne({
          where: { id: conversationId },
        });
        if (conversation && conversation.userId !== userId) {
          this.logger.warn(`User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`);
          return [];
        }
      }

      // Get messages from database (limited to last 500)
      const dbMessages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: "ASC" },
        take: 500,
      });

      // Convert database messages to MessageData format
      const formattedMessages: MessageData[] = dbMessages.map((msg) => {
        // Check if this is a message from WhatsApp client by examining metadata
        const meta = msg.metadata as Record<string, unknown> | null;
        const isFromWhatsAppClient =
          meta &&
          (meta.fromWhatsApp === true ||
            meta.messageId ||
            meta.fromNumber ||
            meta.originalSender === "client" ||
            meta.whatsappMessageId); // Also check whatsappMessageId as fallback

        let sender: "user" | "agent" | "client";
        if (msg.role === "agent") {
          sender = "agent";
        } else if (msg.role === "user" && isFromWhatsAppClient) {
          // Check if originalSender explicitly says "user" (sent from dashboard/us)
          if (meta?.originalSender === "user") {
            sender = "user"; // Sent by us through WhatsApp
          } else {
            sender = "client"; // WhatsApp client messages (incoming)
          }
        } else {
          sender = "user"; // Web interface messages
        }

        // Determine message type from mediaType or default to text
        let messageType: "text" | "image" | "audio" | "video" | "file" = "text";
        let effectiveMediaUrl = msg.mediaUrl;
        let effectiveMediaType = msg.mediaType;

        if (msg.mediaType) {
          if (msg.mediaType.startsWith("image")) {
            messageType = "image";
          } else if (msg.mediaType.startsWith("audio")) {
            messageType = "audio";
          } else if (msg.mediaType.startsWith("video")) {
            messageType = "video";
          } else {
            messageType = "file";
          }
        }

        // Backward compatibility: detect base64 data URLs in content for messages
        // that were saved before mediaType was properly set
        const contentToCheck = msg.mediaUrl || msg.content;
        if (!msg.mediaType && contentToCheck) {
          if (contentToCheck.startsWith('data:image/')) {
            messageType = "image";
            effectiveMediaUrl = contentToCheck;
            // Extract mime type from data URL
            const mimeMatch = contentToCheck.match(/^data:([^;]+);/);
            effectiveMediaType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          } else if (contentToCheck.startsWith('data:video/')) {
            messageType = "video";
            effectiveMediaUrl = contentToCheck;
            const mimeMatch = contentToCheck.match(/^data:([^;]+);/);
            effectiveMediaType = mimeMatch ? mimeMatch[1] : "video/mp4";
          } else if (contentToCheck.startsWith('data:audio/')) {
            messageType = "audio";
            effectiveMediaUrl = contentToCheck;
            const mimeMatch = contentToCheck.match(/^data:([^;]+);/);
            effectiveMediaType = mimeMatch ? mimeMatch[1] : "audio/mpeg";
          }
        }

        // Detect media placeholder patterns in content when mediaType is null
        // These come from historical messages where media wasn't downloaded
        if (messageType === "text" && !effectiveMediaUrl && msg.content) {
          const content = msg.content.trim().toLowerCase();
          if (content === '[image]' || content === 'image') {
            messageType = "image";
            effectiveMediaType = "image/jpeg";
          } else if (content === '[video]' || content === 'video') {
            messageType = "video";
            effectiveMediaType = "video/mp4";
          } else if (content === '[audio]' || content === 'audio') {
            messageType = "audio";
            effectiveMediaType = "audio/mpeg";
          } else if (content === '[document]' || content === '[file]') {
            messageType = "file";
            effectiveMediaType = "application/octet-stream";
          } else if (content === '[media message]' || content === 'media message' || content === '[media]' || content === '[sticker]') {
            messageType = "file";
            effectiveMediaType = "application/octet-stream";
          }
        }

        // For media messages, use placeholder text as content
        const displayContent = (messageType !== "text" && effectiveMediaUrl)
          ? `[${messageType}]`
          : (msg.content || '');

        return {
          id: msg.id,
          content: displayContent,
          timestamp: msg.createdAt,
          sender,
          type: messageType,
          status: (msg.status === "failed" ? "sent" : msg.status) as
            | "sent"
            | "delivered"
            | "read"
            | "sending",
          mediaUrl: effectiveMediaUrl,
          mediaType: effectiveMediaType,
          mediaCaption: msg.mediaCaption,
        };
      });

      // Also include any in-memory messages that aren't in database yet
      const memoryMessages = this.messages.get(conversationId) || [];

      // Merge and deduplicate by message ID and content
      const messageMap = new Map<string, MessageData>();

      // Add database messages first (they are authoritative)
      formattedMessages.forEach((msg) => {
        messageMap.set(msg.id, msg);
      });

      // Build content-based dedup set from existing DB messages (O(n) lookup)
      const contentKeys = new Set<string>();
      for (const msg of messageMap.values()) {
        // Round timestamp to nearest second for fuzzy matching
        const tsKey = Math.round(msg.timestamp.getTime() / 1000);
        contentKeys.add(`${msg.sender}|${msg.content}|${tsKey}`);
      }

      // Add memory messages only if they don't exist in database
      memoryMessages.forEach((memMsg) => {
        if (!messageMap.has(memMsg.id)) {
          const tsKey = Math.round(memMsg.timestamp.getTime() / 1000);
          const key = `${memMsg.sender}|${memMsg.content}|${tsKey}`;
          if (!contentKeys.has(key)) {
            contentKeys.add(key);
            messageMap.set(memMsg.id, memMsg);
          }
        }
      });

      // Convert back to array and sort by timestamp
      const allMessages = Array.from(messageMap.values());
      return allMessages.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
    } catch (error) {
      this.logger.error(
        `Error fetching messages for conversation ${conversationId}:`,
        error,
      );
      // Fallback to memory-only messages
      return this.messages.get(conversationId) || [];
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
    userId: string,
    mediaOptions?: { mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'document'; caption?: string; filename?: string },
  ): Promise<MessageData> {
    let conversation = this.conversations.get(conversationId);

    // If not in memory, load from DB and cache it
    if (!conversation) {
      const dbConv = await this.conversationRepository.findOne({
        where: { id: conversationId, userId },
      });
      if (dbConv) {
        conversation = {
          id: dbConv.id,
          phoneNumber: dbConv.externalId || dbConv.clientPhoneNumber || dbConv.context?.userProfile?.phone || "",
          name: dbConv.title || dbConv.clientPhoneNumber || "",
          lastMessage: "",
          lastMessageTime: dbConv.updatedAt,
          unreadCount: 0,
          isOnline: true,
          userId: dbConv.userId || "",
          sessionId: dbConv.sessionId || dbConv.context?.sessionId || "",
        };
        this.conversations.set(conversationId, conversation);
      }
    }

    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    // Ensure sessionId is set from DB if missing in memory
    if (!conversation.sessionId) {
      const dbConv = await this.conversationRepository.findOne({
        where: { id: conversationId },
        select: ["id", "sessionId", "context"],
      });
      if (dbConv) {
        conversation.sessionId = dbConv.sessionId || dbConv.context?.sessionId || "";
        this.conversations.set(conversationId, conversation);
      }
    }

    const isMedia = mediaOptions?.mediaUrl;
    const messageType = isMedia ? (mediaOptions.mediaType || 'image') : 'text';

    const newMessage: MessageData = {
      id: uuidv4(),
      content: isMedia ? (mediaOptions.caption || content || `[${messageType}]`) : content,
      timestamp: new Date(),
      sender: "user", // Messages sent by us through the interface should be 'user' (right side in UI)
      type: messageType as MessageData['type'],
      status: "sending",
      ...(isMedia ? {
        mediaUrl: mediaOptions.mediaUrl,
        mediaType: `${messageType}/*`,
        mediaCaption: mediaOptions.caption || content,
      } : {}),
    };

    this.addMessage(conversationId, newMessage);

    // Persist message to database
    await this.persistMessage(conversationId, newMessage);

    // Send via WhatsApp
    this.logger.log(
      `🚀 EMITTING whatsapp.send.message for ${conversation.phoneNumber}, sessionId: ${conversation.sessionId}`,
    );

    if (isMedia) {
      this.eventEmitter.emit("whatsapp.send.message", {
        sessionId: conversation.sessionId,
        phoneNumber: conversation.phoneNumber,
        message: mediaOptions.caption || content || '',
        mediaUrl: mediaOptions.mediaUrl,
        type: messageType,
        caption: mediaOptions.caption || content || '',
        filename: mediaOptions.filename,
      });
    } else {
      this.eventEmitter.emit("whatsapp.send.message", {
        sessionId: conversation.sessionId,
        phoneNumber: conversation.phoneNumber,
        message: content,
      });
    }

    // Update message status
    setTimeout(() => {
      newMessage.status = "sent";
    }, 1000);

    // Update conversation
    conversation.lastMessage = isMedia ? (mediaOptions.caption || content || `[${messageType}]`) : content;
    conversation.lastMessageTime = new Date();
    this.conversations.set(conversationId, conversation);

    return newMessage;
  }

  async markConversationAsRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation && conversation.userId === userId) {
      conversation.unreadCount = 0;
      this.conversations.set(conversationId, conversation);

      // Persist to database
      await this.persistConversationUpdate(conversationId, { unreadCount: 0 });
    }
  }

  // Persistence methods
  private async loadPersistedConversations(): Promise<void> {
    try {
      // Load conversations from AgentConversation table
      const persistedConversations = await this.conversationRepository.find({
        where: { channel: ConversationChannel.WHATSAPP },
        order: { updatedAt: "DESC" },
        take: 500,
      });

      // Batch query: get last message per conversation using DISTINCT ON (fast)
      const convIds = persistedConversations.map(c => c.id);
      const lastMessagesMap = new Map<string, AgentMessage>();
      if (convIds.length > 0) {
        const lastMessages = await this.messageRepository
          .query(
            `SELECT DISTINCT ON ("conversationId") *
             FROM agent_messages
             WHERE "conversationId" = ANY($1)
             ORDER BY "conversationId", "createdAt" DESC`,
            [convIds],
          );
        for (const msg of lastMessages) {
          lastMessagesMap.set(msg.conversationId, msg);
        }
      }

      // Batch query: unread count per conversation
      const unreadCountsMap = new Map<string, number>();
      if (convIds.length > 0) {
        const unreadCounts = await this.messageRepository
          .createQueryBuilder('m')
          .select('m.conversationId', 'conversationId')
          .addSelect('COUNT(*)', 'count')
          .where('m.conversationId IN (:...convIds)', { convIds })
          .andWhere('m.status = :status', { status: MessageStatus.DELIVERED })
          .groupBy('m.conversationId')
          .getRawMany();
        for (const row of unreadCounts) {
          unreadCountsMap.set(row.conversationId, parseInt(row.count));
        }
      }

      for (const dbConversation of persistedConversations) {
        const lastMessage = lastMessagesMap.get(dbConversation.id);
        const normalizedPhone = this.normalizePhoneNumber(
          dbConversation.externalId || "",
        );

        // Format display name - check if context name is valid or if phone is a LID
        let displayName;
        const contextName = dbConversation.context?.userProfile?.name;
        if (contextName && !this.isLikelyLID(contextName) && contextName !== normalizedPhone) {
          displayName = contextName;
        } else if (!this.isLikelyLID(normalizedPhone)) {
          displayName = normalizedPhone.startsWith("+")
            ? normalizedPhone
            : `+${normalizedPhone}`;
        } else {
          displayName = "Contact WhatsApp";
        }

        const conversationData: ConversationData = {
          id: dbConversation.id,
          phoneNumber: normalizedPhone, // Store normalized phone number
          name: displayName,
          lastMessage: lastMessage?.content || "",
          lastMessageTime: lastMessage?.createdAt || dbConversation.updatedAt,
          unreadCount: unreadCountsMap.get(dbConversation.id) || 0,
          isOnline: true, // Default to online
          userId: dbConversation.userId || "",
          sessionId: dbConversation.sessionId || dbConversation.context?.sessionId || "",
        };

        this.conversations.set(conversationData.id, conversationData);
      }

      this.logger.log(
        `Loaded ${persistedConversations.length} persisted conversations from database`,
      );
    } catch (error) {
      this.logger.error("Failed to load persisted conversations:", error);
    }
  }

  private async getOrCreateAgentForConversation(
    userId: string,
    sessionId: string,
  ): Promise<AiAgent | null> {
    try {
      // Get the WhatsApp session with its assigned agent
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ["agent"], // Load the assigned agent
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found when getting agent`);
        return null;
      }

      // 1. If session already has an assigned agent, use it
      if (session.agent) {
        this.logger.log(`Using session's assigned agent ${session.agent.id} for conversation`);
        return session.agent;
      }

      // 🚨 CRITICAL: Do NOT fall back to any other agent - this causes agent mixing issues
      // If no agent is assigned to the session, log a warning but return null
      // The session MUST have an agent explicitly assigned in the dashboard
      this.logger.warn(`⚠️ Session ${sessionId} has no agent assigned. Please assign an agent in the dashboard.`);
      this.logger.warn(`⚠️ Conversations will be created without an agent until one is assigned.`);

      // Return null - conversations can still be created but AI responses won't work
      // This is intentional to prevent agent mixing
      return null;
    } catch (error) {
      this.logger.error(`Error getting/creating agent for user ${userId}:`, error);
      return null;
    }
  }

  private async persistConversation(
    conversationData: ConversationData,
  ): Promise<void> {
    try {
      let normalizedPhone = this.normalizePhoneNumber(
        conversationData.phoneNumber,
      );

      // Resolve LID to real phone number — LID JIDs are internal identifiers, not real phone numbers
      if (conversationData.phoneNumber.includes('@lid')) {
        try {
          const resolvedPhone = await this.baileysService.resolveLidToPhoneNumber(
            conversationData.sessionId,
            conversationData.phoneNumber,
          );
          if (resolvedPhone) {
            normalizedPhone = resolvedPhone.replace(/^\+/, '').trim();
            this.logger.log(`Resolved LID to real phone: ${normalizedPhone}`);
          }
        } catch (e) {
          this.logger.warn(`Could not resolve LID to phone for conversation: ${e.message}`);
        }
      }

      // Check if conversation already exists with normalized phone
      let dbConversation = await this.conversationRepository.findOne({
        where: { id: conversationData.id },
      });

      // Also check if there's an existing conversation with the same normalized phone number for this user AND session
      // CRITICAL: Must filter by sessionId to prevent cross-session contamination
      if (!dbConversation) {
        const whereConditions: any = {
          userId: conversationData.userId,
          channel: ConversationChannel.WHATSAPP,
        };
        // Filter by sessionId to prevent cross-session conversation reuse
        if (conversationData.sessionId) {
          whereConditions.sessionId = conversationData.sessionId;
        }
        const existingConversations = await this.conversationRepository.find({
          where: whereConditions,
        });

        // Find existing conversation with same normalized phone number
        dbConversation = existingConversations.find((conv) => {
          const existingNormalizedPhone = this.normalizePhoneNumber(
            conv.externalId || "",
          );
          return existingNormalizedPhone === normalizedPhone;
        });

        // Also check context.sessionId for older conversations that don't have the column set
        if (!dbConversation && conversationData.sessionId) {
          const contextMatches = await this.conversationRepository
            .createQueryBuilder('conv')
            .where('conv.userId = :userId', { userId: conversationData.userId })
            .andWhere('conv.channel = :channel', { channel: ConversationChannel.WHATSAPP })
            .andWhere("conv.context->>'sessionId' = :sessionId", { sessionId: conversationData.sessionId })
            .getMany();
          dbConversation = contextMatches.find((conv) => {
            const existingNormalizedPhone = this.normalizePhoneNumber(conv.externalId || "");
            return existingNormalizedPhone === normalizedPhone;
          });
        }

        if (dbConversation) {
          // Update the in-memory conversation ID to match the existing DB conversation
          this.conversations.delete(conversationData.id);
          conversationData.id = dbConversation.id;
          this.conversations.set(dbConversation.id, conversationData);

          // Move messages to the correct conversation ID
          const messages = this.messages.get(conversationData.id);
          if (messages) {
            this.messages.delete(conversationData.id);
            this.messages.set(dbConversation.id, messages);
          }

          this.logger.log(
            `Found existing conversation ${dbConversation.id} for phone ${normalizedPhone}, merging...`,
          );
          return; // Don't create a new conversation
        }
      }

      if (!dbConversation) {
        // Get or create an agent for this conversation
        const agent = await this.getOrCreateAgentForConversation(conversationData.userId, conversationData.sessionId);
        
        if (!agent) {
          this.logger.warn(`⚠️ No agent assigned to session ${conversationData.sessionId} - conversation ${conversationData.id} cannot be persisted.`);
          this.logger.warn(`⚠️ Please assign an agent to this WhatsApp session in the dashboard.`);
          return;
        }

        // Create new conversation with normalized phone as externalId and agentId
        dbConversation = this.conversationRepository.create({
          id: conversationData.id,
          userId: conversationData.userId,
          agentId: agent.id, // Required field - assign agent
          sessionId: conversationData.sessionId, // Set sessionId column for quota counting
          clientPhoneNumber: normalizedPhone, // Set clientPhoneNumber column
          externalId: normalizedPhone, // Use normalized phone number
          channel: ConversationChannel.WHATSAPP,
          status: ConversationStatus.ACTIVE,
          context: {
            sessionId: conversationData.sessionId,
            userProfile: {
              name: conversationData.name,
              phone: normalizedPhone,
            },
            customData: {
              isGroup: conversationData.phoneNumber.includes("@g.us"),
            },
          },
          metrics: {
            messageCount: 0,
            userMessageCount: 0,
            agentMessageCount: 0,
          },
        });

        await this.conversationRepository.save(dbConversation);
        this.logger.log(
          `Persisted new conversation ${conversationData.id} to database with agent ${agent.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to persist conversation ${conversationData.id}:`,
        error,
      );
    }
  }

  private async persistMessage(
    conversationId: string,
    message: MessageData,
  ): Promise<void> {
    try {
      // First check by original message ID
      const existingMessage = await this.messageRepository.findOne({
        where: { id: message.id },
      });

      if (existingMessage) {
        this.logger.log(
          `Message ${message.id} already exists in database, skipping persistence`,
        );
        return;
      }

      // Also check for duplicate content in same conversation within 5 seconds to prevent duplicates
      const fiveSecondsAgo = new Date(message.timestamp.getTime() - 5000);
      const fiveSecondsAfter = new Date(message.timestamp.getTime() + 5000);

      const duplicateMessage = await this.messageRepository.findOne({
        where: {
          conversationId,
          content: message.content,
          createdAt: Between(fiveSecondsAgo, fiveSecondsAfter),
        },
      });

      if (duplicateMessage) {
        this.logger.log(
          `Duplicate message detected (same content within 5s), skipping persistence`,
        );
        return;
      }

      // Use the UUID we generated earlier - no need to check format anymore
      const messageId = message.id;

      // Get next sequence number for this conversation
      const lastMessage = await this.messageRepository.findOne({
        where: { conversationId },
        order: { sequenceNumber: "DESC" },
      });
      const nextSequenceNumber = (lastMessage?.sequenceNumber || 0) + 1;

      const dbMessage = this.messageRepository.create({
        id: messageId,
        conversationId,
        content: message.content,
        sequenceNumber: nextSequenceNumber, // Required field
        role:
          message.sender === "user"
            ? MessageRole.USER
            : message.sender === "agent"
              ? MessageRole.AGENT
              : MessageRole.USER, // Map 'client' to USER role for database consistency
        status: this.mapToMessageStatus(message.status),
        createdAt: message.timestamp,
        // Media fields for images, videos, audio, files
        mediaUrl: message.mediaUrl,
        mediaType: message.mediaType,
        mediaCaption: message.mediaCaption,
        // Add metadata to distinguish WhatsApp client messages from web interface messages
        metadata:
          message.sender === "client"
            ? {
                fromWhatsApp: true,
                originalSender: "client",
                ...((message as unknown as Record<string, unknown>).metadata as Record<string, unknown> || {}),
              }
            : (message as unknown as Record<string, unknown>).metadata || {},
      });

      await this.messageRepository.save(dbMessage);
      this.logger.log(`Persisted message ${messageId} to database with sequence ${nextSequenceNumber}`);
    } catch (error) {
      this.logger.error(`Failed to persist message ${message.id}:`, error);
    }
  }

  private async persistConversationUpdate(
    conversationId: string,
    updates: Partial<ConversationData>,
  ): Promise<void> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      // Don't update metadata field as it doesn't exist in AgentConversation entity
      // Just update the timestamp for now

      await this.conversationRepository.update(conversationId, updateData);
    } catch (error) {
      this.logger.error(
        `Failed to update conversation ${conversationId}:`,
        error,
      );
    }
  }

  private mapMessageStatus(
    status: MessageStatus,
  ): "sending" | "sent" | "delivered" | "read" {
    switch (status) {
      case MessageStatus.SENT:
        return "sent";
      case MessageStatus.DELIVERED:
        return "delivered";
      case MessageStatus.READ:
        return "read";
      case MessageStatus.FAILED:
        return "sent";
      default:
        return "sent";
    }
  }

  private mapToMessageStatus(
    status: "sending" | "sent" | "delivered" | "read" | undefined,
  ): MessageStatus {
    switch (status) {
      case "sending":
        return MessageStatus.SENT;
      case "sent":
        return MessageStatus.SENT;
      case "delivered":
        return MessageStatus.DELIVERED;
      case "read":
        return MessageStatus.READ;
      default:
        return MessageStatus.SENT;
    }
  }

  private async handlePersistConversations(data: {
    userId: string;
  }): Promise<void> {
    const { userId } = data;

    this.logger.log(`💾 Persisting memory conversations for user ${userId}`);

    try {
      // First, clean up duplicate conversations in the database
      await this.cleanupDuplicateConversations(userId);

      const userConversations = Array.from(this.conversations.values()).filter(
        (conv) => conv.userId === userId,
      );

      this.logger.log(
        `Found ${userConversations.length} memory conversations to persist`,
      );

      for (const conversation of userConversations) {
        await this.persistConversation(conversation);

        // Also persist all messages for this conversation
        const messages = this.messages.get(conversation.id) || [];
        for (const message of messages) {
          await this.persistMessage(conversation.id, message);
        }
      }

      this.logger.log(
        `✅ Successfully persisted ${userConversations.length} conversations to database`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist conversations for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Clean up duplicate conversations in the database for a user
   * Groups conversations by normalized phone number and keeps only the oldest one
   */
  private async cleanupDuplicateConversations(userId: string): Promise<void> {
    try {
      const allConversations = await this.conversationRepository.find({
        where: {
          userId: userId,
          channel: ConversationChannel.WHATSAPP,
        },
        order: { createdAt: "ASC" }, // Oldest first
      });

      // Group conversations by normalized phone number
      const phoneGroups = new Map<string, typeof allConversations>();

      for (const conversation of allConversations) {
        const normalizedPhone = this.normalizePhoneNumber(
          conversation.externalId || "",
        );

        if (!phoneGroups.has(normalizedPhone)) {
          phoneGroups.set(normalizedPhone, []);
        }
        phoneGroups.get(normalizedPhone)!.push(conversation);
      }

      // Process each phone group and remove duplicates
      for (const [phone, conversations] of phoneGroups.entries()) {
        if (conversations.length > 1) {
          this.logger.log(
            `Found ${conversations.length} duplicate conversations for phone ${phone}, cleaning up...`,
          );

          // Keep the oldest conversation (first in the sorted array)
          const conversationToKeep = conversations[0];
          const conversationsToDelete = conversations.slice(1);

          // Move messages from duplicate conversations to the main one using bulk update
          for (const duplicateConv of conversationsToDelete) {
            await this.messageRepository.createQueryBuilder()
              .update(AgentMessage)
              .set({ conversationId: conversationToKeep.id })
              .where("conversationId = :dupId", { dupId: duplicateConv.id })
              .execute();

            // Delete the duplicate conversation
            await this.conversationRepository.remove(duplicateConv);
            this.logger.log(
              `Removed duplicate conversation ${duplicateConv.id} for phone ${phone}`,
            );
          }

          this.logger.log(
            `Kept conversation ${conversationToKeep.id} as primary for phone ${phone}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup duplicate conversations for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Start periodic memory cleanup to prevent memory leaks
   */
  private startMemoryCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performMemoryCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.log(`Started memory cleanup timer (interval: ${this.CLEANUP_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop memory cleanup timer (called on service destroy)
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.logger.log('Stopped memory cleanup timer');
    }
  }

  /**
   * Perform memory cleanup to prevent unlimited growth
   */
  private performMemoryCleanup(): void {
    const initialConversationCount = this.conversations.size;
    const initialMessageCount = Array.from(this.messages.values()).reduce((total, msgs) => total + msgs.length, 0);

    this.logger.debug(`Starting memory cleanup - Conversations: ${initialConversationCount}, Messages: ${initialMessageCount}`);

    // 1. Remove old conversations that haven't been accessed recently
    const cutoffTime = Date.now() - this.CONVERSATION_TTL_MS;
    const conversationsToRemove: string[] = [];

    for (const [conversationId, conversation] of this.conversations.entries()) {
      if (conversation.lastMessageTime.getTime() < cutoffTime) {
        conversationsToRemove.push(conversationId);
      }
    }

    // Remove old conversations and their messages
    conversationsToRemove.forEach(conversationId => {
      this.conversations.delete(conversationId);
      this.messages.delete(conversationId);
    });

    // 2. If still too many conversations, remove oldest ones
    if (this.conversations.size > this.MAX_CONVERSATIONS_IN_MEMORY) {
      const sortedConversations = Array.from(this.conversations.entries())
        .sort(([,a], [,b]) => a.lastMessageTime.getTime() - b.lastMessageTime.getTime());

      const excessCount = this.conversations.size - this.MAX_CONVERSATIONS_IN_MEMORY;
      const oldestConversations = sortedConversations.slice(0, excessCount);

      oldestConversations.forEach(([conversationId]) => {
        this.conversations.delete(conversationId);
        this.messages.delete(conversationId);
      });

      this.logger.debug(`Removed ${excessCount} oldest conversations to enforce limit of ${this.MAX_CONVERSATIONS_IN_MEMORY}`);
    }

    // 3. Trim messages in remaining conversations
    for (const [conversationId, messages] of this.messages.entries()) {
      if (messages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
        const trimmedMessages = messages.slice(-this.MAX_MESSAGES_PER_CONVERSATION);
        this.messages.set(conversationId, trimmedMessages);
      }
    }

    const finalConversationCount = this.conversations.size;
    const finalMessageCount = Array.from(this.messages.values()).reduce((total, msgs) => total + msgs.length, 0);

    const conversationsRemoved = initialConversationCount - finalConversationCount;
    const messagesRemoved = initialMessageCount - finalMessageCount;

    if (conversationsRemoved > 0 || messagesRemoved > 0) {
      this.logger.log(`Memory cleanup completed - Removed ${conversationsRemoved} conversations, ${messagesRemoved} messages`);
      this.logger.log(`Current state - Conversations: ${finalConversationCount}, Messages: ${finalMessageCount}`);
    }
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): {
    conversationCount: number;
    messageCount: number;
    averageMessagesPerConversation: number;
    estimatedMemoryUsage: string;
  } {
    const conversationCount = this.conversations.size;
    const messageCount = Array.from(this.messages.values()).reduce((total, msgs) => total + msgs.length, 0);
    const averageMessagesPerConversation = conversationCount > 0 ? messageCount / conversationCount : 0;
    
    // Rough estimate: 1KB per conversation + 500 bytes per message
    const estimatedBytes = (conversationCount * 1024) + (messageCount * 512);
    const estimatedMB = (estimatedBytes / (1024 * 1024)).toFixed(2);

    return {
      conversationCount,
      messageCount,
      averageMessagesPerConversation: Math.round(averageMessagesPerConversation * 100) / 100,
      estimatedMemoryUsage: `${estimatedMB} MB`
    };
  }
}
