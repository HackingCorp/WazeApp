import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { v4 as uuidv4 } from "uuid";
import {
  WhatsAppSession,
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

  constructor(
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private eventEmitter: EventEmitter2,
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
      let conversation = await this.findConversationByPhone(fromNumber, userId);

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
      const message: MessageData = {
        id: messageUUID,
        content: messageText,
        timestamp,
        sender: isFromMe ? "user" : "client", // If fromMe, it's sent by us (user), otherwise from WhatsApp client (client)
        type: (messageType || "text") as "text" | "image" | "audio" | "file",
        status: "read",
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
   * Removes WhatsApp suffixes and ensures consistent formatting
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    return phoneNumber
      .replace("@s.whatsapp.net", "")
      .replace("@g.us", "")
      .replace(/\s+/g, "")
      .trim();
  }

  private async findConversationByPhone(
    phoneNumber: string,
    userId: string,
  ): Promise<ConversationData | undefined> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    // First check in-memory conversations with normalized comparison
    for (const [id, conversation] of this.conversations.entries()) {
      // Since we now store normalized phone numbers, we can do a direct comparison
      if (
        conversation.phoneNumber === normalizedPhone &&
        conversation.userId === userId
      ) {
        return conversation;
      }
    }

    // Then check database for persisted conversations with normalized comparison
    try {
      const dbConversations = await this.conversationRepository.find({
        where: {
          userId: userId,
          channel: ConversationChannel.WHATSAPP,
        },
        relations: ["messages"],
      });

      // Find matching conversation by normalizing the externalId
      const dbConversation = dbConversations.find((conv) => {
        const normalizedExternalId = this.normalizePhoneNumber(
          conv.externalId || "",
        );
        return normalizedExternalId === normalizedPhone;
      });

      if (dbConversation) {
        // Convert to ConversationData format and cache in memory
        const lastMessage =
          dbConversation.messages?.[dbConversation.messages.length - 1];
        const conversationData: ConversationData = {
          id: dbConversation.id,
          phoneNumber: dbConversation.externalId || "Unknown",
          name:
            dbConversation.context?.userProfile?.name ||
            dbConversation.externalId ||
            "Unknown",
          lastMessage: lastMessage?.content || "",
          lastMessageTime: lastMessage?.createdAt || dbConversation.updatedAt,
          unreadCount:
            dbConversation.messages?.filter(
              (m) => m.status === MessageStatus.DELIVERED,
            ).length || 0,
          isOnline: true, // Default to online for found conversations
          userId: dbConversation.userId || "",
          sessionId: dbConversation.context?.sessionId || "",
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
      // For individual chats, use the normalized phone number as display name
      displayName = normalizedPhone.startsWith("+")
        ? normalizedPhone
        : `+${normalizedPhone}`;
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

  // API methods for frontend
  async getConversationsForUser(
    userId: string,
    sessionId?: string,
  ): Promise<ConversationData[]> {
    try {
      this.logger.log(
        `📋 Getting conversations for user ${userId}${sessionId ? `, sessionId: ${sessionId}` : ""}`,
      );

      // Get conversations from database
      const dbConversations = await this.conversationRepository.find({
        where: {
          channel: ConversationChannel.WHATSAPP,
          userId: userId,
        },
        relations: ["messages"],
        order: { updatedAt: "DESC" },
      });

      // Sort messages by createdAt for each conversation to ensure proper order
      dbConversations.forEach((conv) => {
        if (conv.messages) {
          conv.messages.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );
        }
      });

      this.logger.log(
        `💾 Found ${dbConversations.length} persisted conversations in database`,
      );

      // Convert to ConversationData format and filter by sessionId if provided
      let persistedConversations: ConversationData[] = dbConversations.map(
        (dbConv) => {
          const lastMessage = dbConv.messages?.[dbConv.messages.length - 1];

          // Get phone number from externalId or context
          let rawPhone =
            dbConv.externalId || dbConv.context?.userProfile?.phone || "";
          const normalizedPhone = this.normalizePhoneNumber(rawPhone);

          // Format display name properly
          let displayName;
          if (normalizedPhone) {
            displayName = normalizedPhone.startsWith("+")
              ? normalizedPhone
              : `+${normalizedPhone}`;
          } else {
            displayName = "Unknown Contact";
          }

          return {
            id: dbConv.id,
            phoneNumber: normalizedPhone, // Store normalized phone number
            name: dbConv.context?.userProfile?.name || displayName,
            lastMessage: lastMessage?.content || "",
            lastMessageTime: lastMessage?.createdAt || dbConv.updatedAt,
            unreadCount:
              dbConv.messages?.filter(
                (m) => m.status === MessageStatus.DELIVERED,
              ).length || 0,
            isOnline: false, // Default to offline for historical conversations
            userId: dbConv.userId || "",
            sessionId: dbConv.context?.sessionId || "",
          };
        },
      );

      // Also include memory conversations that aren't persisted yet
      let memoryConversations = Array.from(this.conversations.values()).filter(
        (conv) => conv.userId === userId,
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
          // Update the conversation to use normalized phone number for consistent display
          phoneGroups.set(key, {
            ...conv,
            phoneNumber: normalizedPhone,
            name: conv.name.includes(normalizedPhone)
              ? conv.name
              : normalizedPhone.startsWith("+")
                ? normalizedPhone
                : `+${normalizedPhone}`,
          });
        }
      });
      allConversations = Array.from(phoneGroups.values());

      this.logger.log(
        `📞 After deduplication: ${allConversations.length} unique conversations`,
      );

      // Filter by sessionId if provided and not empty (after merging)
      if (sessionId && sessionId.trim() !== "") {
        allConversations = allConversations.filter(
          (conv) => conv.sessionId === sessionId,
        );
      }

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
  ): Promise<MessageData[]> {
    try {
      // Get messages from database first
      const dbMessages = await this.messageRepository.find({
        where: { conversationId },
        order: { createdAt: "ASC" }, // Oldest first
      });

      // Convert database messages to MessageData format
      const formattedMessages: MessageData[] = dbMessages.map((msg) => {
        // Check if this is a message from WhatsApp client by examining metadata
        const isFromWhatsAppClient =
          msg.metadata &&
          ((msg.metadata as any).fromWhatsApp === true ||
            (msg.metadata as any).messageId ||
            (msg.metadata as any).fromNumber ||
            (msg.metadata as any).originalSender === "client");

        let sender: "user" | "agent" | "client";
        if (msg.role === "agent") {
          sender = "agent";
        } else if (msg.role === "user" && isFromWhatsAppClient) {
          sender = "client"; // WhatsApp client messages
        } else {
          sender = "user"; // Web interface messages
        }

        // Determine message type from mediaType or default to text
        let messageType: "text" | "image" | "audio" | "video" | "file" = "text";
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

        return {
          id: msg.id,
          content: msg.mediaUrl || msg.content, // Use mediaUrl for media messages
          timestamp: msg.createdAt,
          sender,
          type: messageType,
          status: (msg.status === "failed" ? "sent" : msg.status) as
            | "sent"
            | "delivered"
            | "read"
            | "sending",
          mediaUrl: msg.mediaUrl,
          mediaType: msg.mediaType,
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

      // Add memory messages only if they don't exist in database
      memoryMessages.forEach((memMsg) => {
        if (!messageMap.has(memMsg.id)) {
          // Also check for content-based duplicates (in case of ID mismatches)
          const isDuplicate = Array.from(messageMap.values()).some(
            (existingMsg) =>
              existingMsg.content === memMsg.content &&
              existingMsg.sender === memMsg.sender &&
              Math.abs(
                existingMsg.timestamp.getTime() - memMsg.timestamp.getTime(),
              ) < 1000, // Within 1 second
          );

          if (!isDuplicate) {
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
  ): Promise<MessageData> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    const newMessage: MessageData = {
      id: uuidv4(),
      content,
      timestamp: new Date(),
      sender: "user", // Messages sent by us through the interface should be 'user' (right side in UI)
      type: "text",
      status: "sending",
    };

    this.addMessage(conversationId, newMessage);

    // Persist message to database
    await this.persistMessage(conversationId, newMessage);

    // Send via WhatsApp
    this.logger.log(
      `🚀 EMITTING whatsapp.send.message for ${conversation.phoneNumber}, sessionId: ${conversation.sessionId}`,
    );
    this.eventEmitter.emit("whatsapp.send.message", {
      sessionId: conversation.sessionId,
      phoneNumber: conversation.phoneNumber,
      message: content,
    });

    // Update message status
    setTimeout(() => {
      newMessage.status = "sent";
    }, 1000);

    // Update conversation
    conversation.lastMessage = content;
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
        relations: ["messages"],
        order: { updatedAt: "DESC" },
      });

      for (const dbConversation of persistedConversations) {
        const lastMessage =
          dbConversation.messages?.[dbConversation.messages.length - 1];
        const normalizedPhone = this.normalizePhoneNumber(
          dbConversation.externalId || "",
        );
        const displayName = normalizedPhone.startsWith("+")
          ? normalizedPhone
          : `+${normalizedPhone}`;

        const conversationData: ConversationData = {
          id: dbConversation.id,
          phoneNumber: normalizedPhone, // Store normalized phone number
          name: dbConversation.context?.userProfile?.name || displayName,
          lastMessage: lastMessage?.content || "",
          lastMessageTime: lastMessage?.createdAt || dbConversation.updatedAt,
          unreadCount:
            dbConversation.messages?.filter(
              (m) => m.status === MessageStatus.DELIVERED,
            ).length || 0,
          isOnline: true, // Default to online
          userId: dbConversation.userId || "",
          sessionId: dbConversation.context?.sessionId || "",
        };

        this.conversations.set(conversationData.id, conversationData);

        // Load messages for this conversation
        const messages: MessageData[] = (dbConversation.messages || []).map(
          (dbMessage) => {
            // Determine sender based on role and metadata/externalMessageId
            let sender: "user" | "agent" | "client";
            if (dbMessage.role === MessageRole.AGENT) {
              sender = "agent";
            } else if (dbMessage.role === MessageRole.USER) {
              // Check if message comes from WhatsApp (has external ID or specific metadata)
              if (
                dbMessage.externalMessageId ||
                (dbMessage.metadata as any)?.fromWhatsApp ||
                (dbMessage.metadata as any)?.originalSender === "client"
              ) {
                sender = "client"; // Message from WhatsApp client
              } else {
                sender = "user"; // Message from web interface
              }
            } else {
              sender = "user"; // Default fallback
            }

            return {
              id: dbMessage.id,
              content: dbMessage.content,
              timestamp: dbMessage.createdAt,
              sender,
              type: "text", // Default to text
              status: this.mapMessageStatus(dbMessage.status),
            };
          },
        );

        this.messages.set(conversationData.id, messages);
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

      // 2. If no agent assigned to session, try to find an appropriate agent
      const organizationId = session.organizationId;
      let agent: AiAgent | null = null;
      
      if (organizationId) {
        // Look for organization agent first
        agent = await this.agentRepository.findOne({
          where: { organizationId, status: AgentStatus.ACTIVE },
          order: { createdAt: "DESC" },
        });
      }
      
      // If no organization agent, look for user's personal agent
      if (!agent) {
        agent = await this.agentRepository.findOne({
          where: { 
            createdBy: userId, 
            status: AgentStatus.ACTIVE,
            organizationId: organizationId || null
          },
          order: { createdAt: "DESC" },
        });
      }

      // 3. If still no agent found, create a default one
      if (!agent) {
        this.logger.log(`Creating default agent for user ${userId}, organizationId: ${organizationId}`);
        
        let organization = null;
        if (organizationId) {
          organization = await this.organizationRepository.findOne({
            where: { id: organizationId },
          });
        }

        agent = this.agentRepository.create({
          organizationId: organizationId || null,
          createdBy: userId,
          name: `Agent WhatsApp - ${organization?.name || "Default"}`,
          description: "Agent IA automatique pour WhatsApp avec réponses intelligentes",
          systemPrompt: `You are an AI assistant for ${organization?.name || "this organization"} responding to WhatsApp messages.

CRITICAL RULES (MUST FOLLOW):
1. LANGUAGE: Detect and respond in the EXACT same language the user writes. If English, respond in English. If French, respond in French. NEVER switch languages.
2. NO MARKDOWN: NEVER use asterisks, underscores, or any formatting. Write plain text only. No bold, no italics.
3. NO THINKING OUT LOUD: Never say "Let me analyze", "I see that", "Looking at". Just respond directly.
4. Be concise and helpful (2-4 sentences max).

EXAMPLES:
User: "What products do you sell?"
You: "We sell Android TV Boxes for streaming. These devices let you watch your favorite content in high definition."

User (French): "Quel produit vendez-vous?"
You: "Nous vendons des Box TV Android pour le streaming. Ces appareils permettent de regarder vos contenus préférés."

Always respond directly in the user's language without any formatting.`,
          status: AgentStatus.ACTIVE,
          primaryLanguage: AgentLanguage.FRENCH,
          supportedLanguages: [AgentLanguage.FRENCH, AgentLanguage.ENGLISH],
          tone: AgentTone.PROFESSIONAL,
          config: {
            maxTokens: 300,
            temperature: 0.6,
          },
          metrics: {
            totalConversations: 0,
            totalMessages: 0,
            averageResponseTime: 0,
            satisfactionScore: 0,
            successfulResponses: 0,
            failedResponses: 0,
            knowledgeBaseHits: 0,
          },
          faq: [],
          version: 1,
          tags: ["whatsapp", "auto-created"],
        });

        agent = await this.agentRepository.save(agent);
        this.logger.log(`Created new agent ${agent.id} for user ${userId}`);

        // Optionally assign this new agent to the session for future use
        try {
          await this.sessionRepository.update(sessionId, { agentId: agent.id });
          this.logger.log(`Assigned new agent ${agent.id} to session ${sessionId}`);
        } catch (error) {
          this.logger.warn(`Failed to assign agent to session: ${error.message}`);
        }
      }

      return agent;
    } catch (error) {
      this.logger.error(`Error getting/creating agent for user ${userId}:`, error);
      return null;
    }
  }

  private async persistConversation(
    conversationData: ConversationData,
  ): Promise<void> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(
        conversationData.phoneNumber,
      );

      // Check if conversation already exists with normalized phone
      let dbConversation = await this.conversationRepository.findOne({
        where: { id: conversationData.id },
      });

      // Also check if there's an existing conversation with the same normalized phone number for this user
      if (!dbConversation) {
        const existingConversations = await this.conversationRepository.find({
          where: {
            userId: conversationData.userId,
            channel: ConversationChannel.WHATSAPP,
          },
        });

        // Find existing conversation with same normalized phone number
        dbConversation = existingConversations.find((conv) => {
          const existingNormalizedPhone = this.normalizePhoneNumber(
            conv.externalId || "",
          );
          return existingNormalizedPhone === normalizedPhone;
        });

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
          this.logger.error(`Failed to get/create agent for conversation ${conversationData.id}, skipping persistence`);
          return;
        }

        // Create new conversation with normalized phone as externalId and agentId
        dbConversation = this.conversationRepository.create({
          id: conversationData.id,
          userId: conversationData.userId,
          agentId: agent.id, // Required field - assign agent
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
        // Add metadata to distinguish WhatsApp client messages from web interface messages
        metadata:
          message.sender === "client"
            ? {
                fromWhatsApp: true,
                originalSender: "client",
                ...((message as any).metadata || {}),
              }
            : (message as any).metadata || {},
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
        relations: ["messages"],
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

          // Move messages from duplicate conversations to the main one
          for (const duplicateConv of conversationsToDelete) {
            if (duplicateConv.messages && duplicateConv.messages.length > 0) {
              // Update messages to point to the conversation we're keeping
              for (const message of duplicateConv.messages) {
                await this.messageRepository.update(message.id, {
                  conversationId: conversationToKeep.id,
                });
              }
            }

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
