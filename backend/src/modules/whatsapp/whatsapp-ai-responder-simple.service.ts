import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { 
  WhatsAppSession, 
  User, 
  Organization,
  KnowledgeDocument, 
  DocumentChunk, 
  AgentMessage,
  AgentConversation 
} from "@/common/entities";
import { WhatsAppSessionStatus, MessageRole, MessageStatus } from "@/common/enums";
import { LLMRouterService } from "../llm-providers/llm-router.service";
import { BaileysService } from "./baileys.service";
import * as fs from 'fs/promises';
import * as path from 'path';

interface WhatsAppMessageEvent {
  sessionId: string;
  message: any;
  type: string;
}

@Injectable()
export class WhatsAppAIResponderSimpleService {
  private readonly logger = new Logger(WhatsAppAIResponderSimpleService.name);
  private conversationHistory = new Map<
    string,
    Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>
  >();

  constructor(
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(KnowledgeDocument)
    private documentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(DocumentChunk)
    private chunkRepository: Repository<DocumentChunk>,
    private llmRouterService: LLMRouterService,
    private baileysService: BaileysService,
    private configService: ConfigService,
  ) {}

  @OnEvent("whatsapp.message.received")
  async handleIncomingMessage(event: WhatsAppMessageEvent) {
    try {
      this.logger.log(
        `Processing incoming message for session: ${event.sessionId}`,
      );

      // Get session details
      const session = await this.sessionRepository.findOne({
        where: { id: event.sessionId, status: WhatsAppSessionStatus.CONNECTED },
        relations: ["user", "organization"],
      });

      if (!session) {
        this.logger.warn(
          `Session not found or not connected: ${event.sessionId}`,
        );
        return;
      }

      // Extract message details
      const message = event.message;
      const fromNumber = message.key.remoteJid;

      // Skip group messages - AI only responds to private chats
      const isGroupMessage = fromNumber?.endsWith("@g.us");
      if (isGroupMessage) {
        this.logger.log(
          `⏭️ Skipping GROUP message from ${fromNumber} - AI only responds to private chats`,
        );
        return;
      }

      const messageText = this.extractMessageText(message);

      if (!messageText || messageText.trim() === "") {
        this.logger.debug("No text content in message, skipping AI response");
        return;
      }

      this.logger.log(`Message from ${fromNumber}: ${messageText}`);

      // Check if auto-response is enabled
      const autoResponseEnabled =
        this.configService.get("WHATSAPP_AUTO_RESPONSE_ENABLED", "true") ===
        "true";
      if (!autoResponseEnabled) {
        this.logger.debug("Auto-response is disabled");
        return;
      }

      // Generate and send AI response with enhanced features
      await this.processMessageEnhanced(session.id, fromNumber, messageText, session);
    } catch (error) {
      this.logger.error(
        `Error processing WhatsApp message: ${error.message}`,
        error.stack,
      );
    }
  }

  private extractMessageText(message: any): string {
    try {
      if (message.message?.conversation) {
        return message.message.conversation;
      }
      if (message.message?.extendedTextMessage?.text) {
        return message.message.extendedTextMessage.text;
      }
      if (message.message?.imageMessage?.caption) {
        return message.message.imageMessage.caption;
      }
      if (message.message?.videoMessage?.caption) {
        return message.message.videoMessage.caption;
      }
      return "";
    } catch (error) {
      this.logger.warn(`Error extracting message text: ${error.message}`);
      return "";
    }
  }

  private getConversationKey(sessionId: string, fromNumber: string): string {
    return `${sessionId}-${fromNumber.replace(/[^a-zA-Z0-9]/g, "")}`;
  }

  private async generateAndSendResponse(
    session: WhatsAppSession,
    fromNumber: string,
    userMessage: string,
  ): Promise<void> {
    try {
      this.logger.log(`Generating AI response for ${fromNumber}`);

      const conversationKey = this.getConversationKey(session.id, fromNumber);

      // Get or initialize conversation history
      if (!this.conversationHistory.has(conversationKey)) {
        this.conversationHistory.set(conversationKey, []);
      }

      const history = this.conversationHistory.get(conversationKey)!;

      // Add user message to history
      history.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      // Keep only last 10 messages
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }

      // Prepare messages for LLM
      const messages = [
        {
          role: "system" as const,
          content: this.getSystemPrompt(
            session.organization?.name || "Unknown",
          ),
        },
        ...history.slice(-8).map((h) => ({
          // Last 8 messages for context
          role: h.role,
          content: h.content,
        })),
      ];

      // Log conversation context for debugging
      this.logger.debug(
        `Sending ${messages.length} messages to LLM (including ${history.length} history messages) for conversation ${conversationKey}`,
      );
      this.logger.debug(
        `Conversation history: ${JSON.stringify(history.slice(-3).map(h => ({ role: h.role, content: h.content.substring(0, 50) })))}`,
      );

      // Generate response using LLM Router
      const response = await this.llmRouterService.generateResponse({
        messages,
        temperature: 0.7,
        maxTokens: 150,
        organizationId: session.organizationId,
        userId: session.userId,
        priority: "normal",
      });

      // Add AI response to history
      history.push({
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
      });

      // Send response via WhatsApp
      try {
        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: response.content,
          type: "text",
        });

        this.logger.log(
          `AI response sent successfully to ${fromNumber}: "${response.content.substring(0, 50)}..."`,
        );
      } catch (sendError) {
        this.logger.error(
          `Failed to send WhatsApp message: ${sendError.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error generating/sending AI response: ${error.message}`,
        error.stack,
      );

      // Send fallback message
      try {
        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message:
            "Désolé, je rencontre un problème technique. Veuillez réessayer dans un moment.",
          type: "text",
        });
      } catch (fallbackError) {
        this.logger.error(
          `Failed to send fallback message: ${fallbackError.message}`,
        );
      }
    }
  }

  private getSystemPrompt(organizationName: string): string {
    return `You are a helpful and friendly AI assistant responding to WhatsApp messages for ${organizationName}.

CRITICAL RULES:
1. LANGUAGE: ALWAYS detect and respond in the EXACT same language the user writes in. If they write in English, respond in English. If they write in French, respond in French. If they write in Spanish, respond in Spanish. NEVER switch languages.
2. NO MARKDOWN: NEVER use asterisks (*), underscores (_), or any markdown formatting. Write plain text only. No bold, no italics, no bullet points with dashes.
3. Be concise: Keep responses short (2-3 sentences maximum).
4. Be professional and courteous.
5. If you cannot help with something, politely explain why.

Respond naturally and helpfully in the user's language.`;
  }

  /**
   * Search knowledge base for relevant documents/media
   */
  private async searchKnowledgeBase(
    query: string,
    knowledgeBaseId?: string,
  ): Promise<KnowledgeDocument[]> {
    try {
      if (!knowledgeBaseId) {
        return [];
      }

      // Search for relevant documents
      const documents = await this.documentRepository
        .createQueryBuilder("doc")
        .where("doc.knowledgeBaseId = :kbId", { kbId: knowledgeBaseId })
        .andWhere(
          "(doc.title ILIKE :query OR doc.content ILIKE :query)",
          { query: `%${query}%` }
        )
        .andWhere("doc.type IN (:...types)", {
          types: ["image", "pdf", "video", "audio"],
        })
        .take(3)
        .getMany();

      return documents;
    } catch (error) {
      this.logger.error(`Error searching knowledge base: ${error.message}`);
      return [];
    }
  }

  /**
   * Persist conversation to database
   */
  private async persistConversation(
    sessionId: string,
    userId: string,
    phoneNumber: string,
    messages: Array<{ role: string; content: string; timestamp: Date }>,
  ): Promise<void> {
    try {
      // Find or create conversation
      let conversation = await this.conversationRepository.findOne({
        where: {
          sessionId,
          clientPhoneNumber: phoneNumber,
        },
      });

      if (!conversation) {
        conversation = this.conversationRepository.create({
          sessionId,
          userId,
          clientPhoneNumber: phoneNumber,
          startedAt: new Date(),
        });
        await this.conversationRepository.save(conversation);
      }

      // Save messages to database
      for (const msg of messages) {
        const existingMessage = await this.messageRepository.findOne({
          where: {
            conversationId: conversation.id,
            content: msg.content,
            role: msg.role as MessageRole,
          },
        });

        if (!existingMessage) {
          const message = this.messageRepository.create({
            conversationId: conversation.id,
            content: msg.content,
            role: msg.role as MessageRole,
            status: MessageStatus.DELIVERED,
            timestamp: msg.timestamp,
          });
          await this.messageRepository.save(message);
        }
      }
    } catch (error) {
      this.logger.error(`Error persisting conversation: ${error.message}`);
    }
  }

  /**
   * Load conversation history from database
   */
  private async loadConversationHistory(
    sessionId: string,
    phoneNumber: string,
  ): Promise<Array<{ role: string; content: string; timestamp: Date }>> {
    try {
      const conversation = await this.conversationRepository.findOne({
        where: {
          sessionId,
          clientPhoneNumber: phoneNumber,
        },
      });

      if (!conversation) {
        return [];
      }

      const messages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { timestamp: "ASC" },
        take: 10,
      });

      return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
    } catch (error) {
      this.logger.error(`Error loading conversation history: ${error.message}`);
      return [];
    }
  }

  /**
   * Send media file via WhatsApp
   */
  private async sendMediaFile(
    sessionId: string,
    phoneNumber: string,
    document: KnowledgeDocument,
  ): Promise<void> {
    try {
      const filePath = document.filePath;
      
      if (!filePath) {
        this.logger.warn(`No file path for document ${document.id}`);
        return;
      }

      // Determine media type
      let messageType: "image" | "document" | "video" | "audio" = "document";
      
      if (document.type === "image" || document.mimeType?.startsWith("image/")) {
        messageType = "image";
      } else if (document.type === "video" || document.mimeType?.startsWith("video/")) {
        messageType = "video";
      } else if (document.type === "audio" || document.mimeType?.startsWith("audio/")) {
        messageType = "audio";
      }

      // Send media with caption
      await this.baileysService.sendMessage(sessionId, {
        to: phoneNumber,
        message: `📎 ${document.title}\n\nDocument from knowledge base`,
        type: messageType,
        caption: `📎 ${document.title}\n\nDocument from knowledge base`,
        mediaUrl: filePath,
        filename: document.title,
      });

      this.logger.log(
        `Sent ${messageType} to ${phoneNumber}: ${document.title}`,
      );
    } catch (error) {
      this.logger.error(`Error sending media: ${error.message}`);
    }
  }

  /**
   * Enhanced processMessage with media and persistence
   */
  async processMessageEnhanced(
    sessionId: string,
    fromNumber: string,
    userMessage: string,
    session: WhatsAppSession,
  ): Promise<void> {
    try {
      const conversationKey = this.getConversationKey(sessionId, fromNumber);

      // Load history from database
      const dbHistory = await this.loadConversationHistory(sessionId, fromNumber);
      
      // Merge with in-memory history
      if (!this.conversationHistory.has(conversationKey)) {
        this.conversationHistory.set(conversationKey, dbHistory.map(h => ({
          role: h.role as "user" | "assistant",
          content: h.content,
          timestamp: h.timestamp,
        })));
      }
      
      const history = this.conversationHistory.get(conversationKey)!;

      // Add user message
      history.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });

      // Keep only last 10 messages
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }

      // Search for relevant media in knowledge base
      const relevantDocs = await this.searchKnowledgeBase(
        userMessage,
        session.knowledgeBaseId,
      );

      // Prepare context with knowledge base info
      let contextInfo = "";
      if (relevantDocs.length > 0) {
        contextInfo = "\n\nRelevant documents found in knowledge base:\n" +
          relevantDocs.map(doc => `- ${doc.title}`).join("\n");
      }

      // Generate AI response
      const messages = [
        {
          role: "system" as const,
          content: this.getSystemPrompt(session.organization?.name || "Unknown") + contextInfo,
        },
        ...history.slice(-8).map((h) => ({
          role: h.role,
          content: h.content,
        })),
      ];

      const response = await this.llmRouterService.generateResponse({
        messages,
        temperature: 0.7,
        maxTokens: 200,
        organizationId: session.organizationId,
        userId: session.userId,
        priority: "normal",
      });

      // Add AI response to history
      history.push({
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
      });

      // Send text response
      await this.baileysService.sendMessage(sessionId, {
        to: fromNumber,
        message: response.content,
        type: "text",
      });

      // Send relevant media if found
      if (relevantDocs.length > 0) {
        // Send the most relevant document
        await this.sendMediaFile(sessionId, fromNumber, relevantDocs[0]);
      }

      // Persist conversation to database
      await this.persistConversation(
        sessionId,
        session.userId,
        fromNumber,
        history.slice(-10),
      );

      this.logger.log(
        `Enhanced response sent to ${fromNumber} with ${relevantDocs.length} media files`,
      );
    } catch (error) {
      this.logger.error(`Error in enhanced processing: ${error.message}`);
      
      // Fall back to original method if enhanced processing fails
      await this.generateAndSendResponse(session, fromNumber, userMessage);
    }
  }

  /**
   * Web search for media (using external API)
   */
  private async searchWebForMedia(query: string): Promise<any[]> {
    try {
      // This would integrate with an image search API like:
      // - Google Custom Search API
      // - Bing Image Search API
      // - Unsplash API
      // - Pexels API
      
      // Example implementation:
      const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&client_id=${process.env.UNSPLASH_API_KEY}`;
      
      // Fetch would go here...
      // const response = await fetch(searchUrl);
      // const data = await response.json();
      // return data.results;
      
      return [];
    } catch (error) {
      this.logger.error(`Error searching web for media: ${error.message}`);
      return [];
    }
  }

  // Method to clear conversation history (useful for testing)
  clearConversationHistory(sessionId?: string, fromNumber?: string): void {
    if (sessionId && fromNumber) {
      const conversationKey = this.getConversationKey(sessionId, fromNumber);
      this.conversationHistory.delete(conversationKey);
      this.logger.log(`Cleared conversation history for ${conversationKey}`);
    } else {
      this.conversationHistory.clear();
      this.logger.log("Cleared all conversation history");
    }
  }
}
