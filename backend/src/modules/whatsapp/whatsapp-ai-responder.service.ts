import { Injectable, Logger, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import {
  WhatsAppSession,
  AiAgent,
  AgentConversation,
  AgentMessage,
  User,
  Organization,
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
  UsageMetric,
} from "@/common/entities";
import {
  WhatsAppSessionStatus,
  ConversationStatus,
  MessageRole,
  MessageStatus,
  ConversationChannel,
  AgentStatus,
  AgentLanguage,
  AgentTone,
  UsageMetricType,
} from "@/common/enums";
import { LLMRouterService } from "../llm-providers/llm-router.service";
import { BaileysService } from "./baileys.service";
import { WebSearchService } from "./web-search.service";
import { MediaAnalysisService } from "./media-analysis.service";
import { QuotaEnforcementService } from "../subscriptions/quota-enforcement.service";

interface WhatsAppMessageEvent {
  sessionId: string;
  message: any;
  type: string;
}

@Injectable()
export class WhatsAppAIResponderService {
  private readonly logger = new Logger(WhatsAppAIResponderService.name);
  private readonly processingMessages = new Set<string>();

  // Détection de langue améliorée avec mots-clés uniques et pondération
  private detectLanguage(text: string): string {
    const lowerText = text.toLowerCase().trim();

    // Si texte très court (< 3 mots), utiliser le français par défaut (contexte camerounais)
    const wordCount = lowerText.split(/\s+/).length;
    if (wordCount <= 2 && lowerText.length < 15) {
      // Vérifier rapidement pour des mots anglais évidents
      const englishIndicators = ['hello', 'hi', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'please', 'help', 'what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'need', 'want', 'buy', 'price', 'cost'];
      for (const word of englishIndicators) {
        if (lowerText === word || lowerText.startsWith(word + ' ') || lowerText.endsWith(' ' + word)) {
          return 'en';
        }
      }
      return 'fr'; // Défaut français pour le contexte camerounais
    }

    // Mots-clés UNIQUES par langue (éviter les mots ambigus)
    // Priorité aux mots qui n'existent que dans une seule langue
    const languageKeywords = {
      'fr': {
        // Mots français uniques (haute priorité)
        unique: ['bonjour', 'bonsoir', 'salut', 'merci', 'bienvenue', 's\'il vous plaît', 'svp', 'oui', 'pourquoi', 'parce que', 'comment', 'combien', 'quoi', 'quel', 'quelle', 'quand', 'aujourd\'hui', 'demain', 'hier', 'maintenant', 'toujours', 'jamais', 'peut-être', 'beaucoup', 'peu', 'très', 'aussi', 'encore', 'déjà', 'seulement', 'vraiment', 'exactement', 'environ', 'pendant', 'depuis', 'jusqu\'à', 'avant', 'après', 'entre', 'chez', 'vers', 'sans', 'sous', 'contre', 'malgré', 'voici', 'voilà', 'alors', 'donc', 'mais', 'cependant', 'pourtant', 'sinon', 'sauf', 'd\'accord', 'entendu', 'compris', 'j\'ai', 'j\'aime', 'j\'aimerais', 'je veux', 'je voudrais', 'je cherche', 'je suis', 'nous sommes', 'vous êtes', 'ils sont', 'c\'est', 'ce sont', 'qu\'est-ce', 'est-ce que', 'n\'est-ce pas', 'bien sûr', 'pas de problème', 'aucun souci'],
        // Mots français communs (priorité moyenne)
        common: ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'moi', 'toi', 'lui', 'eux', 'qui', 'que', 'dont', 'où', 'et', 'ou', 'ni', 'car', 'pour', 'dans', 'sur', 'avec', 'chez', 'par', 'de', 'à', 'en']
      },
      'en': {
        unique: ['hello', 'hey', 'thanks', 'thank you', 'please', 'welcome', 'sorry', 'excuse me', 'goodbye', 'bye', 'okay', 'alright', 'yes', 'yeah', 'yep', 'nope', 'maybe', 'perhaps', 'however', 'therefore', 'although', 'because', 'since', 'while', 'until', 'unless', 'whether', 'though', 'anyway', 'actually', 'really', 'absolutely', 'definitely', 'certainly', 'probably', 'usually', 'always', 'never', 'sometimes', 'often', 'already', 'still', 'just', 'only', 'even', 'also', 'too', 'either', 'neither', 'both', 'each', 'every', 'any', 'some', 'many', 'much', 'more', 'most', 'few', 'little', 'enough', 'several', 'own', 'other', 'another', 'such', 'same', 'different', 'next', 'last', 'first', 'second', 'third', 'i am', 'i\'m', 'you are', 'you\'re', 'we are', 'we\'re', 'they are', 'they\'re', 'i have', 'i\'ve', 'i would', 'i\'d', 'i will', 'i\'ll', 'can you', 'could you', 'would you', 'should i', 'do you', 'are you', 'is it', 'what is', 'what\'s', 'how much', 'how many', 'how long'],
        common: ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'us', 'them', 'who', 'what', 'which', 'when', 'where', 'why', 'how', 'and', 'or', 'but', 'if', 'so', 'as', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over']
      },
      'es': {
        unique: ['hola', 'gracias', 'buenos días', 'buenas tardes', 'buenas noches', 'por favor', 'perdón', 'disculpe', 'adiós', 'hasta luego', 'cómo estás', 'qué tal', 'muy bien', 'está bien', 'de nada', 'lo siento', 'claro', 'vale', 'bueno', 'pues', 'entonces', 'además', 'también', 'todavía', 'ya', 'siempre', 'nunca', 'ahora', 'hoy', 'mañana', 'ayer'],
        common: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos', 'ellas', 'mi', 'tu', 'su', 'nuestro', 'vuestro', 'que', 'qué', 'cómo', 'cuándo', 'dónde', 'por qué', 'quién', 'cuál', 'cuánto', 'y', 'o', 'pero', 'porque', 'para', 'por', 'con', 'sin', 'en', 'de', 'a']
      },
      'de': {
        unique: ['guten tag', 'guten morgen', 'guten abend', 'danke', 'bitte', 'entschuldigung', 'auf wiedersehen', 'tschüss', 'ja', 'nein', 'vielleicht', 'natürlich', 'genau', 'richtig', 'falsch', 'gut', 'schlecht', 'schön', 'groß', 'klein'],
        common: ['der', 'die', 'das', 'ein', 'eine', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'was', 'wie', 'wann', 'wo', 'warum', 'wer', 'und', 'oder', 'aber', 'weil', 'wenn', 'dass', 'für', 'mit', 'von', 'zu', 'in', 'an', 'auf']
      },
      'ar': {
        unique: ['مرحبا', 'السلام عليكم', 'شكرا', 'من فضلك', 'عفوا', 'نعم', 'لا', 'ربما', 'طبعا', 'بالتأكيد', 'إن شاء الله', 'ماشاء الله', 'الحمد لله', 'كيف حالك', 'أهلا وسهلا'],
        common: ['و', 'في', 'من', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'أنا', 'أنت', 'هو', 'هي', 'نحن', 'أنتم', 'هم', 'ما', 'ماذا', 'كيف', 'متى', 'أين', 'لماذا', 'من', 'أي']
      },
      'zh': {
        unique: ['你好', '谢谢', '请', '对不起', '没关系', '再见', '是的', '不是', '好的', '可以', '不可以', '为什么', '怎么样', '多少钱', '在哪里', '什么时候'],
        common: ['的', '是', '在', '有', '和', '了', '不', '这', '那', '我', '你', '他', '她', '我们', '你们', '他们', '什么', '怎么', '哪里', '谁', '几', '多', '很', '太']
      },
      'ja': {
        unique: ['こんにちは', 'おはよう', 'こんばんは', 'ありがとう', 'すみません', 'ごめんなさい', 'さようなら', 'はい', 'いいえ', 'わかりました', 'お願いします', 'どうぞ', 'いただきます', 'ごちそうさま'],
        common: ['の', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'や', 'か', 'から', 'まで', 'より', 'へ', 'です', 'ます', 'だ', 'である', 'この', 'その', 'あの', 'どの', '何', 'どこ', 'いつ', 'なぜ', '誰']
      }
    };

    const scores: Record<string, number> = {};

    // Calculer le score pour chaque langue
    Object.keys(languageKeywords).forEach(lang => {
      scores[lang] = 0;
      const langData = languageKeywords[lang];

      // Mots uniques ont un poids plus élevé (x3)
      if (langData.unique) {
        langData.unique.forEach((keyword: string) => {
          if (lowerText.includes(keyword)) {
            scores[lang] += keyword.length * 3;
          }
        });
      }

      // Mots communs ont un poids normal
      if (langData.common) {
        langData.common.forEach((keyword: string) => {
          // Utiliser une correspondance de mot entier pour les mots courts
          if (keyword.length <= 2) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(lowerText)) {
              scores[lang] += 1;
            }
          } else if (lowerText.includes(keyword)) {
            scores[lang] += keyword.length;
          }
        });
      }
    });

    // Trouver la langue avec le meilleur score
    const sortedLangs = Object.entries(scores)
      .sort(([, a], [, b]) => b - a);

    const bestLang = sortedLangs[0]?.[0] || 'fr';
    const bestScore = sortedLangs[0]?.[1] || 0;
    const secondScore = sortedLangs[1]?.[1] || 0;

    // Log pour debug
    this.logger.debug(`Language detection: "${lowerText.substring(0, 50)}..." -> ${bestLang} (score: ${bestScore}, 2nd: ${secondScore})`);

    // Si aucune langue n'a de score significatif, utiliser le français (contexte camerounais)
    if (bestScore < 3) {
      return 'fr';
    }

    // Si les deux premiers scores sont très proches, préférer le français
    if (bestScore > 0 && secondScore > 0 && bestScore - secondScore < 5) {
      if (scores['fr'] >= secondScore) {
        return 'fr';
      }
    }

    return bestLang;
  }

  constructor(
    @InjectRepository(WhatsAppSession)
    private sessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(AgentConversation)
    private conversationRepository: Repository<AgentConversation>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(KnowledgeBase)
    private knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeDocument)
    private knowledgeDocumentRepository: Repository<KnowledgeDocument>,
    @InjectRepository(DocumentChunk)
    private documentChunkRepository: Repository<DocumentChunk>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private llmRouterService: LLMRouterService,
    private baileysService: BaileysService,
    private webSearchService: WebSearchService,
    private mediaAnalysisService: MediaAnalysisService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private quotaEnforcementService: QuotaEnforcementService,
  ) {
    console.log('🔧 WhatsAppAIResponderService: Service initialized and ready to receive events');
    this.logger.log('WhatsAppAIResponderService initialized');
    // NOTE: Using ONLY the @OnEvent decorator for event handling - no manual listener
    // to prevent duplicate message processing
  }

  @OnEvent("whatsapp.message.received")
  async handleIncomingMessage(event: WhatsAppMessageEvent) {
    console.log(`🚀🚀🚀 WhatsAppAIResponderService: EVENT RECEIVED!!! - whatsapp.message.received`);
    console.log(`Event data:`, JSON.stringify(event, null, 2));
    this.logger.log(
      `🚀 WhatsAppAIResponderService: DÉBUT - Received event whatsapp.message.received`,
    );
    this.logger.log(`Event data:`, JSON.stringify(event, null, 2));

    const message = event.message;
    const messageId = message.key?.id;
    const fromNumber = message.key?.remoteJid;

    console.log(`📝 STEP 1: Message details: ID=${messageId}, From=${fromNumber}`);
    this.logger.log(`📝 Message details: ID=${messageId}, From=${fromNumber}`);

    // Skip if no message ID, no fromNumber, or if we're already processing this message
    if (!messageId || !fromNumber || this.processingMessages.has(messageId)) {
      this.logger.log(
        `⏭️ Skipping message: no ID (${!messageId}), no fromNumber (${!fromNumber}), or already processing (${this.processingMessages.has(messageId)})`,
      );
      return;
    }

    // Skip group messages - AI only responds to private chats
    const isGroupMessage = fromNumber.endsWith("@g.us");
    if (isGroupMessage) {
      this.logger.log(
        `⏭️ Skipping GROUP message from ${fromNumber} - AI only responds to private chats`,
      );
      return;
    }

    // Mark message as being processed
    this.processingMessages.add(messageId);

    try {
      this.logger.log(
        `Processing incoming message ${messageId} for session: ${event.sessionId}`,
      );

      // Get session details with assigned agent
      const session = await this.sessionRepository.findOne({
        where: { id: event.sessionId },
        relations: [
          "user",
          "organization", 
          "agent",
          "agent.knowledgeBases",
          "knowledgeBase",
        ],
      });

      if (!session) {
        this.logger.warn(
          `Session not found or not connected: ${event.sessionId}`,
        );
        return;
      }

      this.logger.log(`✅ Session found: ${session.id}, status: ${session.status}, agent: ${session.agent ? `${session.agent.id} (${session.agent.name})` : 'none'}, organizationId: ${session.organizationId}`);

      // Check message quota before processing
      try {
        if (session.organizationId) {
          await this.quotaEnforcementService.enforceWhatsAppMessageQuota(session.organizationId);
        } else if (session.userId) {
          await this.quotaEnforcementService.enforceUserWhatsAppMessageQuota(session.userId);
        }
      } catch (quotaError) {
        this.logger.warn(`Message quota exceeded for session ${session.id}: ${quotaError.message}`);
        // Send a message to the user explaining the limit
        try {
          await this.baileysService.sendMessage(session.id, {
            to: fromNumber,
            message: "Sorry, the monthly message limit has been reached. Please contact the administrator to upgrade the plan.",
            type: "text",
          });
          // Track sent message for usage statistics
          await this.trackSentMessage(session.organizationId);
        } catch (sendError) {
          this.logger.error(`Failed to send quota exceeded message: ${sendError.message}`);
        }
        return;
      }

      // Extract message details and analyze media
      const messageText = this.extractMessageText(message);
      const replyContext = this.extractReplyContext(message);
      
      // Get Baileys socket for media download
      const sock = await this.baileysService.getSessionSocket(event.sessionId);
      const mediaAnalysis = await this.mediaAnalysisService.analyzeMedia(message, sock);

      // Si pas de texte ET pas de média, on skip
      if ((!messageText || messageText.trim() === "") && !mediaAnalysis) {
        this.logger.debug("No text content or media in message, skipping AI response");
        return;
      }

      // Construire le message complet avec le contexte média
      let fullMessageContent = messageText || "";
      
      if (mediaAnalysis) {
        this.logger.log(`Media detected: ${mediaAnalysis.type} - ${mediaAnalysis.description}`);
        
        // Ajouter le contexte du média au message
        if (mediaAnalysis.type === 'image') {
          fullMessageContent += `\n\n[IMAGE REÇUE: ${mediaAnalysis.description}]`;
          if (mediaAnalysis.extractedText) {
            fullMessageContent += `\nTexte/Légende: ${mediaAnalysis.extractedText}`;
          }
        } else if (mediaAnalysis.type === 'document') {
          fullMessageContent += `\n\n[DOCUMENT REÇU: ${mediaAnalysis.description}]`;
          if (mediaAnalysis.extractedText) {
            fullMessageContent += `\nContenu: ${mediaAnalysis.extractedText.substring(0, 500)}...`;
          }
        } else if (mediaAnalysis.type === 'link') {
          fullMessageContent += `\n\n[LIEN PARTAGÉ: ${mediaAnalysis.description}]`;
          if (mediaAnalysis.extractedText) {
            fullMessageContent += `\nDescription: ${mediaAnalysis.extractedText}`;
          }
        } else if (mediaAnalysis.type === 'video') {
          fullMessageContent += `\n\n[VIDÉO REÇUE: ${mediaAnalysis.description}]`;
        } else if (mediaAnalysis.type === 'audio') {
          fullMessageContent += `\n\n[MESSAGE AUDIO REÇU]`;
        }
      }

      // Si toujours pas de contenu, skip
      if (!fullMessageContent.trim()) {
        this.logger.debug("No processable content after media analysis, skipping AI response");
        return;
      }

      // Skip if message is from bot itself or is a command
      if (
        fromNumber === session.id ||
        fullMessageContent.startsWith("/") ||
        fullMessageContent.startsWith("!")
      ) {
        this.logger.debug("Skipping bot message or command");
        return;
      }

      this.logger.log(`Message from ${fromNumber}: ${fullMessageContent.substring(0, 200)}...`);

      // Check if auto-response is enabled for this organization
      const autoResponseEnabled =
        this.configService.get("WHATSAPP_AUTO_RESPONSE_ENABLED", "true") ===
        "true";
      if (!autoResponseEnabled) {
        this.logger.debug("Auto-response is disabled");
        return;
      }

      // Get AI agent assigned to this session, or create default if none assigned
      let agent = session.agent;
      if (!agent) {
        this.logger.log(
          `No agent assigned to session ${session.id}, creating default agent`,
        );
        
        // Use session's organizationId or fallback to user's current organization  
        let targetOrganizationId = session.organizationId;
        if (!targetOrganizationId && session.user) {
          // Get user's current organization from their membership
          targetOrganizationId = session.user.currentOrganizationId;
          this.logger.log(`Session has no organizationId, using user's current organization: ${targetOrganizationId}`);
        }
        
        if (!targetOrganizationId) {
          this.logger.log(`No organization found for user ${session.userId}, will create agent without organization`);
        }

        agent = await this.getOrCreateAgent(targetOrganizationId);
        if (!agent) {
          this.logger.warn(
            `No AI agent available - will skip this message`,
          );
          return;
        }
      } else {
        this.logger.log(
          `Using assigned agent ${agent.id} (${agent.name}) for session ${session.id}`,
        );
      }

      // Get or create conversation
      const conversation = await this.getOrCreateConversation(
        fromNumber,
        session,
        agent,
      );

      // Save incoming message with media context
      await this.saveIncomingMessage(conversation, fullMessageContent, message, mediaAnalysis);

      // Generate AI response
      await this.generateAndSendResponse(
        conversation,
        agent,
        session,
        fromNumber,
        fullMessageContent,
        mediaAnalysis,
        replyContext,
      );
    } catch (error) {
      console.error(`❌ ERROR in handleIncomingMessage:`, error);
      this.logger.error(
        `Error processing WhatsApp message: ${error.message}`,
        error.stack,
      );
    } finally {
      // Always remove from processing set
      if (messageId) {
        this.processingMessages.delete(messageId);
      }
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

  /**
   * Extraire les informations de réponse (reply/quote) d'un message
   */
  private extractReplyContext(message: any): {
    isReply: boolean;
    quotedMessage?: string;
    quotedMessageId?: string;
    quotedParticipant?: string;
    quotedType?: string;
  } {
    try {
      const contextInfo = message.message?.extendedTextMessage?.contextInfo;
      
      if (!contextInfo?.quotedMessage) {
        return { isReply: false };
      }

      // Extraire le contenu du message cité selon son type
      let quotedMessage = "";
      let quotedType = "unknown";

      if (contextInfo.quotedMessage.conversation) {
        quotedMessage = contextInfo.quotedMessage.conversation;
        quotedType = "text";
      } else if (contextInfo.quotedMessage.extendedTextMessage?.text) {
        quotedMessage = contextInfo.quotedMessage.extendedTextMessage.text;
        quotedType = "text";
      } else if (contextInfo.quotedMessage.imageMessage?.caption) {
        quotedMessage = contextInfo.quotedMessage.imageMessage.caption || "[Image]";
        quotedType = "image";
      } else if (contextInfo.quotedMessage.videoMessage?.caption) {
        quotedMessage = contextInfo.quotedMessage.videoMessage.caption || "[Vidéo]";
        quotedType = "video";
      } else if (contextInfo.quotedMessage.documentMessage?.fileName) {
        quotedMessage = `[Document: ${contextInfo.quotedMessage.documentMessage.fileName}]`;
        quotedType = "document";
      } else if (contextInfo.quotedMessage.imageMessage) {
        quotedMessage = "[Image sans légende]";
        quotedType = "image";
      } else if (contextInfo.quotedMessage.videoMessage) {
        quotedMessage = "[Vidéo sans légende]";
        quotedType = "video";
      } else {
        quotedMessage = "[Message non supporté]";
        quotedType = "unknown";
      }

      return {
        isReply: true,
        quotedMessage: quotedMessage.trim(),
        quotedMessageId: contextInfo.stanzaId,
        quotedParticipant: contextInfo.participant,
        quotedType
      };

    } catch (error) {
      this.logger.warn(`Error extracting reply context: ${error.message}`);
      return { isReply: false };
    }
  }

  private async getOrCreateAgent(
    organizationId?: string,
  ): Promise<AiAgent | null> {
    try {
      // Try to find existing active agent
      let agent = await this.agentRepository.findOne({
        where: { organizationId, status: AgentStatus.ACTIVE },
        order: { createdAt: "DESC" },
      });

      if (!agent) {
        // Create default agent
        agent = await this.createDefaultAgent(organizationId);
      }

      return agent;
    } catch (error) {
      this.logger.error(`Error getting/creating agent: ${error.message}`);
      return null;
    }
  }

  private async createDefaultAgent(organizationId?: string): Promise<AiAgent> {
    let organization = null;
    if (organizationId) {
      organization = await this.organizationRepository.findOne({
        where: { id: organizationId },
      });
    }

    const agent = this.agentRepository.create({
      organizationId: organizationId || null,
      name: `Agent WhatsApp - ${organization?.name || "Default"}`,
      description: "Agent IA automatique pour WhatsApp avec Ollama",
      systemPrompt: `You are an AI assistant for ${organization?.name || "this organization"} responding to WhatsApp messages.

CRITICAL RULES (MUST FOLLOW):
1. LANGUAGE: Detect and respond in the EXACT same language the user writes. If English, respond in English. If French, respond in French. NEVER switch languages.
2. NO MARKDOWN: NEVER use asterisks, underscores, or any formatting. Write plain text only. No bold, no italics.
3. NO THINKING OUT LOUD: Never say "Let me analyze", "I see that", "Looking at". Just respond directly.
4. Be concise and helpful (2-4 sentences max).

MEDIA HANDLING:
- When user sends an IMAGE, you can see its content and refer to it
- When user sends a LINK, you can see the metadata
- React naturally to media as if you're seeing it

KNOWLEDGE BASE:
- Use the organization's knowledge base when relevant
- For product/service questions, use available information
- If you don't have specific pricing, direct to contact numbers

EXAMPLES:
User: "What products do you sell?"
You: "We sell Android TV Boxes for streaming. These devices let you watch your favorite content in high definition."

User (French): "Quel produit vendez-vous?"
You: "Nous vendons des Box TV Android pour le streaming. Ces appareils permettent de regarder vos contenus préférés."

Always respond directly in the user's language without any formatting.`,
      status: AgentStatus.ACTIVE,
      primaryLanguage: AgentLanguage.FRENCH,
      supportedLanguages: [
        AgentLanguage.FRENCH, 
        AgentLanguage.ENGLISH, 
        AgentLanguage.SPANISH, 
        AgentLanguage.GERMAN, 
        AgentLanguage.ITALIAN, 
        AgentLanguage.PORTUGUESE, 
        AgentLanguage.CHINESE, 
        AgentLanguage.JAPANESE, 
        AgentLanguage.ARABIC
      ],
      tone: AgentTone.PROFESSIONAL,
      config: {
        maxTokens: 300, // Increased for better quality responses
        temperature: 0.6, // Slightly lower for more consistent responses
      },
    });

    return await this.agentRepository.save(agent);
  }

  private async getOrCreateConversation(
    fromNumber: string,
    session: WhatsAppSession,
    agent: AiAgent,
  ): Promise<AgentConversation> {
    const conversationTitle = `WhatsApp - ${fromNumber}`;

    let conversation = await this.conversationRepository.findOne({
      where: {
        agentId: agent.id,
        userId: session.userId,
        title: conversationTitle,
      },
      relations: ["messages"],
    });

    if (!conversation) {
      conversation = this.conversationRepository.create({
        title: conversationTitle,
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.ACTIVE,
        agentId: agent.id,
        userId: session.userId,
        context: {
          sessionId: session.id,
          userProfile: {
            phone: fromNumber,
            name: fromNumber,
          },
        },
      });

      conversation = await this.conversationRepository.save(conversation);
      this.logger.log(`Created new conversation: ${conversation.id}`);
    }

    return conversation;
  }

  private async saveIncomingMessage(
    conversation: AgentConversation,
    messageText: string,
    originalMessage: any,
    mediaAnalysis?: any,
  ): Promise<AgentMessage> {
    // Get next sequence number
    const lastMessage = await this.messageRepository.findOne({
      where: { conversationId: conversation.id },
      order: { sequenceNumber: "DESC" },
    });
    const nextSequence = (lastMessage?.sequenceNumber || 0) + 1;

    const message = this.messageRepository.create({
      conversationId: conversation.id,
      role: MessageRole.USER,
      content: messageText,
      status: MessageStatus.DELIVERED,
      sequenceNumber: nextSequence,
      externalMessageId: originalMessage.key?.id,
      metadata: {
        fromWhatsApp: true,
        originalSender: "client",
        ...(mediaAnalysis && {
          hasMedia: true,
          mediaType: mediaAnalysis.type,
          mediaDescription: mediaAnalysis.description,
          mediaUrl: mediaAnalysis.url,
        }),
      },
    });

    const savedMessage = await this.messageRepository.save(message);
    return savedMessage;
  }

  private async searchKnowledgeBase(
    session: WhatsAppSession,
    userMessage: string,
  ): Promise<string> {
    try {
      // Log session state for debugging
      this.logger.log(`🔍 KB Search: Session ID = ${session.id}`);
      this.logger.log(`🔍 KB Search: Session has agent = ${!!session.agent}`);
      if (session.agent) {
        this.logger.log(`🔍 KB Search: Agent ID = ${session.agent.id}, Name = ${session.agent.name}`);
        this.logger.log(`🔍 KB Search: Agent has knowledgeBases array = ${!!session.agent.knowledgeBases}`);
        this.logger.log(`🔍 KB Search: Agent knowledgeBases count = ${session.agent.knowledgeBases?.length || 0}`);
      }
      this.logger.log(`🔍 KB Search: Session has direct knowledgeBase = ${!!session.knowledgeBase}`);
      this.logger.log(`🔍 KB Search: Organization ID = ${session.organizationId}`);

      // Priorité : base de connaissances de l'agent assigné à la session
      let knowledgeBase: any = null;

      if (
        session.agent &&
        session.agent.knowledgeBases &&
        session.agent.knowledgeBases.length > 0
      ) {
        // Utiliser la première base de connaissances de l'agent (ou on pourrait avoir une logique plus complexe)
        knowledgeBase = session.agent.knowledgeBases[0];
        this.logger.log(
          `✅ Using agent's knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
        );
      } else if (session.knowledgeBase) {
        // Fallback: base de connaissances directement associée à la session (legacy)
        knowledgeBase = session.knowledgeBase;
        this.logger.log(
          `✅ Using session's direct knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
        );
      } else {
        // Fallback: chercher par organisation
        this.logger.log(`⚠️ No agent KB or session KB, searching by organization...`);
        knowledgeBase = await this.knowledgeBaseRepository.findOne({
          where: { organizationId: session.organizationId },
          relations: ["documents"],
        });
        if (knowledgeBase) {
          this.logger.log(
            `✅ Using organization's default knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
          );
        } else {
          this.logger.warn(`❌ No knowledge base found for organization ${session.organizationId}`);
        }
      }

      if (!knowledgeBase) {
        this.logger.debug(`No knowledge base found for session ${session.id}`);
        return "";
      }

      this.logger.log(
        `Searching knowledge base ${knowledgeBase.id} for: "${userMessage}"`,
      );

      // Mots-clés importants pour le contexte commercial/logistique
      const importantKeywords = [
        'prix', 'tarif', 'coût', 'cout', 'fcfa', 'xaf', 'usd', 'dollar', 'euro',
        'kg', 'kilo', 'kilogramme', 'poids', 'cbm', 'volume',
        'transport', 'fret', 'cargo', 'expédition', 'expedition', 'envoi', 'livraison',
        'aérien', 'aerien', 'avion', 'maritime', 'bateau', 'mer',
        'chine', 'china', 'guangzhou', 'canton', 'shenzhen', 'yiwu',
        'cameroun', 'douala', 'yaoundé', 'yaounde',
        'délai', 'delai', 'durée', 'duree', 'jours', 'semaines',
        'douane', 'dédouanement', 'dedouanement',
        'contact', 'téléphone', 'telephone', 'whatsapp', 'adresse'
      ];

      // Recherche élargie par mots-clés dans les documents
      const lowerMessage = userMessage.toLowerCase();
      const searchTerms = userMessage
        .toLowerCase()
        .split(/[\s,.'?!]+/)
        .filter((term) => term.length > 2);

      // Ajouter les mots-clés importants trouvés dans le message
      const matchedImportantKeywords = importantKeywords.filter(kw =>
        lowerMessage.includes(kw)
      );

      // Combiner les termes de recherche
      const allSearchTerms = [...new Set([...searchTerms, ...matchedImportantKeywords])];

      this.logger.log(`Search terms: ${allSearchTerms.join(', ')}`);

      // 🔴 REDIS CACHE: Vérifier si les documents sont en cache
      const cacheKey = `kb:docs:${knowledgeBase.id}`;
      let documents: KnowledgeDocument[] | null = null;

      try {
        const cachedDocs = await this.cacheManager.get<string>(cacheKey);
        if (cachedDocs) {
          documents = JSON.parse(cachedDocs);
          this.logger.log(`📦 KB Cache HIT: ${documents.length} documents from Redis cache`);
        }
      } catch (cacheError) {
        this.logger.warn(`Cache read error: ${cacheError.message}`);
      }

      // Si pas en cache, charger depuis la DB
      if (!documents) {
        this.logger.log(`📦 KB Cache MISS: Loading from database...`);
        documents = await this.knowledgeDocumentRepository
          .createQueryBuilder("doc")
          .where("doc.knowledgeBaseId = :kbId", { kbId: knowledgeBase.id })
          .andWhere("doc.status IN (:...statuses)", { statuses: ["processed", "uploaded"] })
          .andWhere("doc.content IS NOT NULL")
          .andWhere("LENGTH(doc.content) > 10")
          .orderBy("doc.createdAt", "DESC")
          .getMany();

        // Mettre en cache pour 5 minutes (300000 ms)
        try {
          await this.cacheManager.set(cacheKey, JSON.stringify(documents), 300000);
          this.logger.log(`📦 KB Cache SET: ${documents.length} documents cached for 5 minutes`);
        } catch (cacheError) {
          this.logger.warn(`Cache write error: ${cacheError.message}`);
        }
      }

      this.logger.log(`Found ${documents.length} documents in knowledge base`);

      // Log document details for debugging
      documents.forEach((doc, idx) => {
        this.logger.log(`📄 Doc ${idx + 1}: "${doc.title}" - ${doc.content?.length || 0} chars - Status: ${doc.status}`);
        if (doc.content) {
          this.logger.log(`   Preview: ${doc.content.substring(0, 200).replace(/\n/g, ' ')}...`);
        }
      });

      if (documents.length === 0) {
        this.logger.debug(
          `No documents found in knowledge base ${knowledgeBase.id}`,
        );
        return "";
      }

      // Scorer et trier les documents par pertinence
      const scoredDocuments = documents.map(doc => {
        let score = 0;
        const content = (doc.content || "").toLowerCase();
        const title = (doc.title || "").toLowerCase();

        for (const term of allSearchTerms) {
          // Score pour le titre (plus important)
          if (title.includes(term)) {
            score += 10;
          }
          // Score pour le contenu
          const contentMatches = (content.match(new RegExp(term, 'gi')) || []).length;
          score += contentMatches * 2;
        }

        // Bonus pour les mots-clés importants
        for (const kw of matchedImportantKeywords) {
          if (content.includes(kw)) {
            score += 5;
          }
        }

        return { doc, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 documents les plus pertinents

      if (scoredDocuments.length === 0) {
        // Si aucun document pertinent, retourner TOUT le contenu de la KB pour contexte général
        this.logger.log(`No specific matches, returning all KB content for context`);

        const allContent = documents
          .filter(doc => doc.content && doc.content.length > 50)
          .map(doc => {
            const content = doc.content || "";
            // Envoyer le contenu COMPLET sans aucune limite
            return `**${doc.title}**:\n${content}`;
          });

        if (allContent.length > 0) {
          return `📚 BASE DE CONNAISSANCES DISPONIBLE:\n\n${allContent.join("\n\n---\n\n")}\n\n⚠️ UTILISE CES INFORMATIONS POUR RÉPONDRE AU CLIENT!`;
        }
        return "";
      }

      // Construire le contexte à partir des documents trouvés - ENVOYER LE CONTENU COMPLET
      // AUCUNE LIMITE - l'IA doit avoir accès à 100% de la KB pour trouver toutes les infos
      const contextParts = scoredDocuments.map(({ doc, score }) => {
        const content = doc.content || "";
        // Envoyer le contenu COMPLET sans aucune limite
        return `**${doc.title}** (pertinence: ${score}):\n${content}`;
      });

      const context = `📚 INFORMATIONS TROUVÉES DANS LA BASE DE CONNAISSANCES (TRÈS IMPORTANT - UTILISE CES DONNÉES!):\n\n${contextParts.join("\n\n---\n\n")}`;

      this.logger.log(
        `Found ${scoredDocuments.length} relevant documents in knowledge base (top scores: ${scoredDocuments.slice(0, 3).map(d => d.score).join(', ')})`,
      );
      return context;
    } catch (error) {
      this.logger.error(`Error searching knowledge base: ${error.message}`);
      return "";
    }
  }

  /**
   * Remove ALL markdown formatting for plain text output
   * No asterisks, no underscores, no formatting - just clean text
   */
  private convertToWhatsAppFormat(text: string): string {
    if (!text) return "";

    let result = text;

    // 1. Remove markdown headers (# ## ### etc)
    result = result.replace(/^#{1,6}\s*(.+)$/gm, '$1');

    // 2. Remove all bold/italic formatting (***text***, **text**, *text*, __text__, _text_)
    result = result.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
    result = result.replace(/\*([^*\n]+)\*/g, '$1');
    result = result.replace(/__([^_]+)__/g, '$1');
    result = result.replace(/_([^_\n]+)_/g, '$1');

    // 3. Convert [text](url) links to just text (url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // 4. Convert bullet points to readable format
    result = result.replace(/^-\s+/gm, '• ');
    result = result.replace(/^\*\s+/gm, '• ');

    // 5. Convert numbered lists with proper formatting
    result = result.replace(/^(\d+)\.\s+/gm, '$1. ');

    // 6. Remove triple backticks code blocks but keep content
    result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');

    // 7. Remove single backticks
    result = result.replace(/`([^`]+)`/g, '$1');

    // 8. Remove strikethrough
    result = result.replace(/~~([^~]+)~~/g, '$1');

    // 9. Remove ALL remaining asterisks (this is the key fix)
    result = result.replace(/\*/g, '');

    // 10. Clean up multiple consecutive newlines
    result = result.replace(/\n{3,}/g, '\n\n');

    // 11. Clean up extra spaces
    result = result.replace(/  +/g, ' ');

    return result.trim();
  }

  private extractRelevantExcerpt(
    content: string,
    searchTerms: string[],
    maxLength: number,
  ): string {
    if (!content) return "";

    // Chercher toutes les occurrences des termes de recherche et trouver la zone la plus dense
    const lowerContent = content.toLowerCase();
    const positions: number[] = [];

    for (const term of searchTerms) {
      let pos = 0;
      while ((pos = lowerContent.indexOf(term.toLowerCase(), pos)) !== -1) {
        positions.push(pos);
        pos += term.length;
      }
    }

    if (positions.length === 0) {
      // Aucun terme trouvé, prendre le début du document
      return (
        content.substring(0, maxLength) +
        (content.length > maxLength ? "..." : "")
      );
    }

    // Trier les positions et trouver la zone avec le plus de matches
    positions.sort((a, b) => a - b);

    // Trouver le meilleur point de départ (zone avec le plus de termes)
    let bestStart = 0;
    let bestCount = 0;

    for (let i = 0; i < positions.length; i++) {
      const windowStart = Math.max(0, positions[i] - 100);
      const windowEnd = windowStart + maxLength;
      const count = positions.filter(p => p >= windowStart && p <= windowEnd).length;

      if (count > bestCount) {
        bestCount = count;
        bestStart = windowStart;
      }
    }

    // Ajuster pour commencer au début d'une phrase si possible
    const sentenceStart = content.lastIndexOf('.', bestStart);
    if (sentenceStart !== -1 && bestStart - sentenceStart < 100) {
      bestStart = sentenceStart + 1;
    }

    const end = Math.min(content.length, bestStart + maxLength);

    let excerpt = content.substring(bestStart, end).trim();

    // Essayer de terminer à la fin d'une phrase
    const lastPeriod = excerpt.lastIndexOf('.');
    if (lastPeriod > excerpt.length * 0.7) {
      excerpt = excerpt.substring(0, lastPeriod + 1);
    }

    // Ajouter des points de suspension si nécessaire
    if (bestStart > 0) excerpt = "..." + excerpt;
    if (end < content.length && !excerpt.endsWith('.')) excerpt = excerpt + "...";

    return excerpt;
  }

  private async generateAndSendResponse(
    conversation: AgentConversation,
    agent: AiAgent,
    session: WhatsAppSession,
    fromNumber: string,
    userMessage: string,
    mediaAnalysis?: any,
    replyContext?: any,
  ): Promise<void> {
    try {
      this.logger.log(
        `Generating AI response for conversation: ${conversation.id}`,
      );

      // Get conversation history (last 20 messages for better context)
      const recentMessages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: "DESC" },
        take: 20,
      });

      // Search knowledge base for relevant information
      const knowledgeContext = await this.searchKnowledgeBase(
        session,
        userMessage,
      );

      // Search web if needed and knowledge base doesn't have enough info
      let webContext = "";
      if (
        this.webSearchService.shouldSearchWeb(userMessage, knowledgeContext)
      ) {
        try {
          this.logger.log(`Performing web search for: "${userMessage}"`);
          const webSearchResponse = await this.webSearchService.searchWeb(
            userMessage,
            3,
          );
          if (webSearchResponse.results.length > 0) {
            webContext =
              this.webSearchService.formatSearchResults(webSearchResponse);
            this.logger.log(
              `Web search found ${webSearchResponse.results.length} results`,
            );
          }
        } catch (error) {
          this.logger.warn(`Web search failed: ${error.message}`);
        }
      }

      // Create enhanced system prompt with knowledge base, web context, and media context
      let systemPrompt = agent.systemPrompt || "Tu es un assistant IA utile.";
      
      // Add comprehensive media context to system prompt
      if (mediaAnalysis) {
        systemPrompt += `\n\nCONTEXTE MÉDIA REÇU:
- Type: ${mediaAnalysis.type}
- Description: ${mediaAnalysis.description}
${mediaAnalysis.extractedText ? `- Texte extrait: ${mediaAnalysis.extractedText}` : ''}
${mediaAnalysis.url ? `- URL: ${mediaAnalysis.url}` : ''}
${mediaAnalysis.metadata?.price ? `- Prix détecté: ${mediaAnalysis.metadata.price}` : ''}
${mediaAnalysis.metadata?.title ? `- Titre: ${mediaAnalysis.metadata.title}` : ''}
${mediaAnalysis.metadata?.category ? `- Catégorie: ${mediaAnalysis.metadata.category}` : ''}
${mediaAnalysis.metadata?.domain ? `- Domaine: ${mediaAnalysis.metadata.domain}` : ''}

DRAPEAUX DE CONTEXTE DÉTECTÉS:
${mediaAnalysis.metadata?.isSocialMedia ? '✅ Réseau social' : ''}
${mediaAnalysis.metadata?.isEcommerce ? '✅ E-commerce' : ''}
${mediaAnalysis.metadata?.isMarketplace ? '✅ Place de marché' : ''}
${mediaAnalysis.metadata?.hasProduct ? '✅ Contient un produit' : ''}
${mediaAnalysis.metadata?.isFacebook ? '✅ Facebook' : ''}
${mediaAnalysis.metadata?.isInstagram ? '✅ Instagram' : ''}
${mediaAnalysis.metadata?.isYouTube ? '✅ YouTube' : ''}

INSTRUCTIONS AUTOMATIQUES BASÉES SUR LE CONTEXTE DÉTECTÉ:

${this.generateContextualInstructions(mediaAnalysis)}`;
      }
      
      // Add reply context to system prompt if this is a response to another message
      if (replyContext?.isReply) {
        systemPrompt += `\n\n🔗 MESSAGE DE RÉPONSE DÉTECTÉ:
Le client répond au message suivant:

📝 Message original cité:
"${replyContext.quotedMessage}"

📋 Type de message cité: ${replyContext.quotedType}
${replyContext.quotedMessageId ? `🆔 ID: ${replyContext.quotedMessageId}` : ''}

🎯 INSTRUCTIONS IMPORTANTES:
- Le client fait référence au message cité ci-dessus
- Sa réponse "${userMessage}" est en relation directe avec ce message
- COMPRENDS le lien entre sa réponse et le message original
- RÉPONDS en tenant compte de ce contexte précis

EXEMPLES DE CONTEXTE:
- Si message cité = "Quelle couleur préférez-vous ?" et réponse = "Rouge" 
  → Comprendre que le client choisit la couleur rouge
- Si message cité = "[Image de produit]" et réponse = "Je veux l'acheter"
  → Comprendre que le client veut acheter le produit de l'image
- Si message cité = "Lien produit" et réponse = "C'est disponible ?"
  → Comprendre que la question porte sur la disponibilité du produit du lien

⚠️ NE PAS ignorer le contexte du message cité - c'est crucial pour comprendre ce que veut le client.`;
      }
      
      if (knowledgeContext) {
        systemPrompt += `\n\n${knowledgeContext}

🚨🚨🚨 RÈGLES ABSOLUES - VIOLATION = ERREUR GRAVE 🚨🚨🚨

1. ⛔ NE JAMAIS INVENTER DE PRIX ⛔
   - Si un prix N'EST PAS dans la base de connaissances ci-dessus, dis "Je n'ai pas le tarif exact, contactez-nous"
   - N'INVENTE JAMAIS de fourchettes de prix comme "140-180 USD/CBM" si ce n'est pas écrit ci-dessus
   - Les prix inventés = MENSONGE au client = INTERDIT

2. ✅ UTILISE UNIQUEMENT les informations EXACTES ci-dessus
   - Cite les prix EXACTEMENT comme ils sont écrits
   - Si le prix est "850 USD/CBM", dis "850 USD/CBM", pas "environ 850" ou "140-180"

3. 🔄 Conversion FCFA:
   - Si le client demande en FCFA et que tu as le prix en USD: multiplie par 600
   - Exemple: 850 USD = 510 000 FCFA

4. ❌ NE REDEMANDE PAS les infos déjà fournies
   - Si le client a dit "CBM maritime", tu SAIS que c'est du maritime

5. 📞 Si tu n'as PAS l'info dans la base de connaissances:
   - Dis: "Pour le tarif exact, contactez-nous: Yaoundé +237 691 371 922 / Douala +237 694 562 409"
   - NE DONNE PAS de prix approximatif inventé

EXEMPLE DE RÉPONSE INCORRECTE (INTERDIT):
"Le tarif maritime est d'environ 140-180 USD/CBM" ← SI CE PRIX N'EST PAS DANS LA KB CI-DESSUS = MENSONGE!

EXEMPLE DE RÉPONSE CORRECTE:
"Voici nos tarifs [COPIE EXACTE DE LA KB]. Pour plus de détails, contactez-nous."`;
      } else {
        // Pas de base de connaissances trouvée - être honnête
        systemPrompt += `

⚠️ ATTENTION: Aucune base de connaissances n'est disponible pour cette session.
- NE DONNE PAS de prix spécifiques - tu ne les connais pas
- Redirige le client vers les contacts: Yaoundé +237 691 371 922 / Douala +237 694 562 409
- Tu peux donner des informations générales sur les services, mais PAS de tarifs`;
      }
      if (webContext) {
        systemPrompt += `\n\n${webContext}`;
      }

      // Create a simple context for the LLM Router
      // Use last 15 messages for better conversation context
      const messages = [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        ...recentMessages.slice(-15).reverse().map((msg) => ({
          role:
            msg.role === MessageRole.USER
              ? ("user" as const)
              : ("assistant" as const),
          content: msg.content,
        })),
        {
          role: "user" as const,
          content: userMessage,
        },
      ];

      // Détecter la langue du message utilisateur
      const detectedLanguage = this.detectLanguage(userMessage);
      this.logger.debug(`Detected language for message: ${detectedLanguage}`);

      // Mapper les codes de langue aux noms complets pour instructions plus claires
      const languageNames = {
        'en': 'English',
        'fr': 'French', 
        'es': 'Spanish',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ar': 'Arabic'
      };

      // Add critical language and formatting instructions at the start
      const languageInstruction = {
        role: "system" as const,
        content: `CRITICAL INSTRUCTIONS (MUST FOLLOW):
1. RESPOND ONLY IN ${(languageNames[detectedLanguage] || 'English').toUpperCase()}. The user wrote in ${languageNames[detectedLanguage] || 'English'}, so you MUST reply in the same language.
2. NO FORMATTING: Do NOT use asterisks (*), underscores (_), or any markdown. Write plain text only.
3. Be direct and concise. No "thinking out loud" phrases.`
      };

      const enhancedMessages = [languageInstruction, ...messages];

      // Log KB context status for debugging
      this.logger.log(`🧠 AI Context: KB context length = ${knowledgeContext?.length || 0} chars`);
      if (knowledgeContext) {
        this.logger.log(`🧠 AI Context Preview: ${knowledgeContext.substring(0, 500).replace(/\n/g, ' ')}...`);
      } else {
        this.logger.warn(`⚠️ NO KNOWLEDGE BASE CONTEXT AVAILABLE - AI will redirect to contacts`);
      }

      // Use LLM router directly with enhanced parameters for better quality
      const response = await this.llmRouterService.generateResponse({
        messages: enhancedMessages,
        temperature: agent.config.temperature || 0.5, // Lower for more consistent/accurate responses
        maxTokens: agent.config.maxTokens || 600, // Increased for more detailed responses
        topP: 0.85, // For balanced response diversity
        frequencyPenalty: 0.2, // Reduce repetition more
        presencePenalty: 0.1, // Encourage topic diversity
        organizationId: agent.organizationId,
        agentId: agent.id,
        priority: "high", // Higher priority for better response quality
      });

      // Get next sequence number for AI message
      const lastMessage = await this.messageRepository.findOne({
        where: { conversationId: conversation.id },
        order: { sequenceNumber: "DESC" },
      });
      const nextSequence = (lastMessage?.sequenceNumber || 0) + 1;

      // Save AI response message
      const aiMessage = this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.AGENT,
        content: response.content,
        status: MessageStatus.SENT,
        sequenceNumber: nextSequence,
        metadata: {
          modelUsed: response.model,
          tokenCount: response.usage.totalTokens,
          processingTime: Date.now() - Date.now(), // Will be calculated properly
        },
      });

      const savedAiMessage = await this.messageRepository.save(aiMessage);

      // Send response via WhatsApp
      try {
        // Convert markdown to WhatsApp format
        const whatsappMessage = this.convertToWhatsAppFormat(response.content);

        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: whatsappMessage,
          type: "text",
        });

        // Track sent message for usage statistics
        await this.trackSentMessage(session.organizationId);

        this.logger.log(
          `AI response sent successfully to ${fromNumber}: "${response.content.substring(0, 50)}..."`,
        );

        // Check if we should send relevant media from knowledge base
        await this.sendRelevantMediaIfAvailable(
          session, 
          fromNumber, 
          userMessage,
          agent
        );

        // Check if user is asking for images/photos
        await this.handleImageRequest(
          session,
          fromNumber,
          userMessage
        );
      } catch (sendError) {
        this.logger.error(
          `Failed to send WhatsApp message: ${sendError.message}`,
        );

        // Update message status to failed
        savedAiMessage.status = MessageStatus.FAILED;
        savedAiMessage.metadata.error = {
          message: sendError.message,
          code: "SEND_FAILED",
          timestamp: new Date(),
        };
        await this.messageRepository.save(savedAiMessage);
      }
    } catch (error) {
      this.logger.error(
        `Error generating/sending AI response: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Génère automatiquement les instructions contextuelles basées sur l'analyse du média
   */
  private generateContextualInstructions(mediaAnalysis: any): string {
    const instructions = [];
    const metadata = mediaAnalysis.metadata || {};
    const hasPrice = !!metadata.price;
    const hasTitle = !!metadata.title;

    // Instructions générales pour les liens
    if (mediaAnalysis.type === 'link') {
      instructions.push(`📎 LIEN DÉTECTÉ - Le client a partagé un lien${hasTitle ? ` vers "${metadata.title}"` : ''}`);
      
      if (metadata.hasProduct || metadata.isEcommerce || hasPrice) {
        instructions.push(`🛒 CONTEXTE COMMERCIAL DÉTECTÉ:
- ASSUME que le client s'intéresse potentiellement à ce produit
- Même sans message explicite d'achat, PRÉSENTE le produit de manière commerciale
- MENTIONNE le prix s'il est visible (${metadata.price || 'prix à vérifier'})
- PROPOSE ton aide pour des questions sur le produit
- Si le client demande des détails, aide activement`);
      }

      // Instructions spécifiques par plateforme
      if (metadata.isFacebook) {
        if (metadata.blocked) {
          instructions.push(`🔵 FACEBOOK LINK BLOQUÉ:
- Facebook bloque l'analyse automatique du contenu
- ADMETS que tu ne peux pas voir exactement le contenu du lien
- DEMANDE au client de décrire ce qu'il partage (produit, prix, etc.)
- Exemple: "Je vois que vous avez partagé un lien Facebook, mais je ne peux pas accéder au contenu exact. Pouvez-vous me dire de quel produit il s'agit ?"
- NE PAS INVENTER de détails sur le prix ou le produit`);
        } else {
          instructions.push(`🔵 FACEBOOK ${metadata.isMarketplace ? 'MARKETPLACE' : 'LINK'}:
- Traite ceci comme une annonce de vente potentielle
- Mentionne que tu vois ${hasTitle ? `"${metadata.title}"` : 'le contenu partagé'}
- Si c'est un produit, demande s'il veut plus d'infos ou l'aide pour contacter le vendeur`);
        }
      } else if (metadata.isInstagram) {
        instructions.push(`📸 INSTAGRAM LINK:
- Référence le contenu Instagram partagé
- Si produit détecté, aide avec les questions commerciales`);
      } else if (metadata.isYouTube) {
        instructions.push(`🎥 VIDÉO YOUTUBE:
- Mentionne que tu as vu la vidéo "${metadata.title || 'partagée'}"
- Si c'est une présentation produit, offre ton aide pour des questions`);
      } else if (metadata.isEcommerce) {
        instructions.push(`🛍️ SITE E-COMMERCE:
- C'est clairement un produit en vente en ligne
- Aide avec les questions sur le produit, prix, disponibilité
- Propose d'aider avec le processus d'achat si demandé`);
      }
    }

    // Instructions pour les images
    if (mediaAnalysis.type === 'image') {
      if (mediaAnalysis.description.toLowerCase().includes('produit') || hasPrice) {
        instructions.push(`📷 IMAGE PRODUIT DÉTECTÉE:
- Décris ce que tu vois dans l'image de manière commerciale
- Aide avec les questions sur ce produit spécifique
- Mentionne les détails visibles (couleurs, modèle, etc.)`);
      } else {
        instructions.push(`📷 IMAGE REÇUE:
- Commente ce que tu vois de manière utile et naturelle
- Réponds aux questions sur l'image`);
      }
    }

    // Instructions pour les vidéos
    if (mediaAnalysis.type === 'video') {
      if (metadata.isProductVideo || mediaAnalysis.description.toLowerCase().includes('produit')) {
        instructions.push(`🎬 VIDÉO PRODUIT:
- C'est une présentation de produit en vidéo
- Aide avec les questions commerciales sur ce produit
- Référence ce que tu peux déduire de la description`);
      }
    }

    // Instructions comportementales générales
    instructions.push(`
🎯 COMPORTEMENT REQUIS:
- TOUJOURS reconnaître le média partagé dans ta réponse
- RÉAGIS naturellement comme si tu voyais vraiment le contenu
- N'attends PAS un message explicite d'achat pour être commercial
- Sois PROACTIF : si c'est commercial, aide commercialement
- Si pas de contexte commercial, réponds normalement au contenu

EXEMPLE DE BONNE RÉPONSE AUTOMATIQUE:
"Je vois ${hasTitle ? metadata.title : 'ce que vous avez partagé'}${hasPrice ? ` à ${metadata.price}` : ''}! ${metadata.hasProduct ? 'C\'est un produit intéressant. Avez-vous des questions dessus ou souhaitez-vous plus d\'informations ?' : 'Que puis-je vous dire à ce sujet ?'}"
`);

    return instructions.join('\n\n');
  }

  /**
   * Envoie des médias pertinents depuis la base de connaissances si disponibles
   */
  private async sendRelevantMediaIfAvailable(
    session: WhatsAppSession,
    fromNumber: string,
    userMessage: string,
    agent: AiAgent
  ): Promise<void> {
    try {
      // Skip if no knowledge base
      if (!agent.knowledgeBases || agent.knowledgeBases.length === 0) {
        return;
      }

      // Use the first knowledge base for search
      const knowledgeBase = agent.knowledgeBases[0];
      
      this.logger.log(
        `Searching knowledge base ${knowledgeBase.id} for media related to: ${userMessage}`
      );

      // Search for media in knowledge base
      const media = await this.searchMediaInKnowledgeBase(knowledgeBase.id, userMessage);
      
      if (media && media.length > 0) {
        // Send the first relevant media found
        await this.sendMediaFromKnowledgeBase(session, fromNumber, media[0]);
        this.logger.log(`Media sent from knowledge base to ${fromNumber}`);
      } else {
        this.logger.log(`No relevant media found in knowledge base for: ${userMessage}`);
      }

    } catch (error) {
      this.logger.warn(
        `Could not send media from knowledge base: ${error.message}`
      );
      // Don't throw error - media sending is optional
    }
  }

  /**
   * Gère les demandes d'images de la part de l'utilisateur
   */
  private async handleImageRequest(
    session: WhatsAppSession,
    fromNumber: string,
    userMessage: string
  ): Promise<void> {
    try {
      const message = userMessage.toLowerCase();
      
      // Detect image requests in French
      const imageKeywords = [
        'photo', 'photos', 'image', 'images', 'picture', 'envoyer', 'montrer', 'voir',
        'montrez-moi', 'pouvez-vous envoyer', 'peux-tu envoyer', 'envoi', 'envoie', 'm\'envoyer'
      ];

      const productKeywords = [
        'produit', 'produits', 'article', 'articles', 'box', 'tv', 'android',
        'boitier', 'appareil', 'équipement', 'matériel'
      ];

      const hasImageKeyword = imageKeywords.some(keyword => 
        message.includes(keyword)
      );
      
      const hasProductKeyword = productKeywords.some(keyword =>
        message.includes(keyword)
      );
      
      const isImageRequest = hasImageKeyword && hasProductKeyword;

      this.logger.log(
        `Image request analysis - hasImageKeyword: ${hasImageKeyword}, hasProductKeyword: ${hasProductKeyword}, isImageRequest: ${isImageRequest}, message: "${userMessage}"`
      );

      if (!isImageRequest) {
        return;
      }

      this.logger.log(`Image request detected from ${fromNumber}: ${userMessage}`);

      // Extract product keyword for image search
      let searchTerm = 'android tv box';
      if (message.includes('box') && message.includes('tv')) {
        searchTerm = 'android tv box';
      } else if (message.includes('produit')) {
        searchTerm = 'produit electronique';
      }

      // Generate image URL using Unsplash API (free tier)
      const imageUrl = this.generateProductImageUrl(searchTerm);

      // Send image with caption
      await this.baileysService.sendMessage(session.id, {
        to: fromNumber,
        message: "Voici une image de nos produits",
        type: "image",
        mediaUrl: imageUrl,
        caption: `📱 Voici un exemple de nos Box TV Android.\n\nPour plus d'informations, visitez notre site web ou contactez notre équipe de vente.`,
      });

      // Track sent message for usage statistics
      await this.trackSentMessage(session.organizationId);

      this.logger.log(`Image sent to ${fromNumber}: ${searchTerm}`);

    } catch (error) {
      this.logger.warn(
        `Could not send image: ${error.message}`
      );
      // Don't throw error - image sending is optional
    }
  }

  /**
   * Génère une URL d'image pour le terme recherché
   */
  private generateProductImageUrl(searchTerm: string): string {
    // Use placeholder images that work reliably
    const imageUrls = {
      'android tv box': 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&h=600&fit=crop&crop=center',
      'produit electronique': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&h=600&fit=crop&crop=center',
      'box tv': 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&h=600&fit=crop&crop=center',
      'default': 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop&crop=center'
    };
    
    return imageUrls[searchTerm] || imageUrls['default'];
  }

  /**
   * Recherche des médias dans la base de connaissances basé sur le message utilisateur
   */
  private async searchMediaInKnowledgeBase(
    knowledgeBaseId: string,
    userMessage: string
  ): Promise<KnowledgeDocument[]> {
    try {
      // Extract keywords from user message for search
      const keywords = this.extractKeywordsFromMessage(userMessage);
      
      this.logger.log(`Searching for media with keywords: ${keywords.join(', ')}`);

      // Search for image and video documents in the knowledge base
      const mediaDocuments = await this.knowledgeDocumentRepository
        .createQueryBuilder('doc')
        .where('doc.knowledgeBaseId = :knowledgeBaseId', { knowledgeBaseId })
        .andWhere('doc.type IN (:...mediaTypes)', { 
          mediaTypes: ['image', 'video'] 
        })
        .andWhere('doc.status = :status', { status: 'processed' })
        .andWhere(
          '(LOWER(doc.title) LIKE ANY(:keywords) OR LOWER(doc.filename) LIKE ANY(:keywords) OR LOWER(doc.content) LIKE ANY(:keywords))',
          { 
            keywords: keywords.map(k => `%${k.toLowerCase()}%`) 
          }
        )
        .orderBy('doc.updatedAt', 'DESC')
        .limit(5)
        .getMany();

      this.logger.log(`Found ${mediaDocuments.length} media documents`);
      return mediaDocuments;

    } catch (error) {
      this.logger.error(`Error searching media in knowledge base: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrait les mots-clés pertinents du message utilisateur
   */
  private extractKeywordsFromMessage(message: string): string[] {
    const messageWords = message.toLowerCase()
      .replace(/[.,!?;]/g, ' ')
      .split(' ')
      .filter(word => word.length > 2);

    // Common words to filter out
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
                       'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'dans', 'sur', 'avec', 'pour', 'de',
                       'can', 'you', 'please', 'send', 'show', 'me', 'pouvez', 'vous', 'envoyer', 'montrer', 'moi'];
    
    return messageWords.filter(word => !stopWords.includes(word));
  }

  /**
   * Envoie un média depuis la base de connaissances via WhatsApp
   */
  private async sendMediaFromKnowledgeBase(
    session: WhatsAppSession,
    fromNumber: string,
    mediaDocument: KnowledgeDocument
  ): Promise<void> {
    try {
      this.logger.log(`Sending media from knowledge base: ${mediaDocument.title}`);

      // Use the same format as other sendMessage calls
      await this.baileysService.sendMessage(session.id, {
        to: fromNumber,
        message: `📁 ${mediaDocument.title}`,
        type: "image",
        mediaUrl: mediaDocument.filePath,
        caption: `📁 ${mediaDocument.title}\n\n${mediaDocument.content ? mediaDocument.content.substring(0, 200) + '...' : 'Image de votre base de connaissances'}`
      });

      // Track sent message for usage statistics
      await this.trackSentMessage(session.organizationId);

      this.logger.log(`Knowledge base media sent to ${fromNumber}: ${mediaDocument.title}`);

    } catch (error) {
      this.logger.error(`Failed to send knowledge base media: ${error.message}`);
      throw error;
    }
  }

  /**
   * Track sent message for usage statistics
   */
  private async trackSentMessage(organizationId: string | null): Promise<void> {
    if (!organizationId) {
      return;
    }

    try {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

      // Find or create usage metric for today
      let usageMetric = await this.usageMetricRepository.findOne({
        where: {
          organizationId,
          type: UsageMetricType.WHATSAPP_MESSAGES,
          date
        },
      });

      if (usageMetric) {
        usageMetric.value += 1;
        await this.usageMetricRepository.save(usageMetric);
      } else {
        usageMetric = this.usageMetricRepository.create({
          organizationId,
          type: UsageMetricType.WHATSAPP_MESSAGES,
          value: 1,
          date,
          metadata: { source: 'ai_responder' },
        });
        await this.usageMetricRepository.save(usageMetric);
      }

      this.logger.debug(`📊 Tracked sent message for org ${organizationId}`);
    } catch (error) {
      this.logger.warn(`Failed to track sent message: ${error.message}`);
    }
  }
}
