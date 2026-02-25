import { Injectable, Logger, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
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
  Product,
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
  ResponseLength,
  VerbosityLevel,
} from "@/common/enums";
import { LLMRouterService } from "../llm-providers/llm-router.service";
import { BaileysService } from "./baileys.service";
import { WebSearchService } from "./web-search.service";
import { MediaAnalysisService } from "./media-analysis.service";
import { QuotaEnforcementService } from "../subscriptions/quota-enforcement.service";
import { VectorSearchService } from "../vector-search/vector-search.service";
import { ProductSearchService } from "../ecommerce/services/product-search.service";
import { OrderTagParserService } from "../orders/services/order-tag-parser.service";
import { AppointmentTagParserService } from "../appointments/services/appointment-tag-parser.service";
import { AvailabilityService } from "../appointments/services/availability.service";

interface WhatsAppMessageEvent {
  sessionId: string;
  message: any;
  type: string;
}

interface BufferedMessage {
  event: WhatsAppMessageEvent;
  messageText: string;
  mediaAnalysis: any;
  receivedAt: Date;
}

@Injectable()
export class WhatsAppAIResponderService {
  private readonly logger = new Logger(WhatsAppAIResponderService.name);
  private readonly processingMessages = new Set<string>();

  // Message batching: buffer messages per conversation for grouping
  private readonly messageBuffer = new Map<string, BufferedMessage[]>();
  private readonly batchTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_DELAY_MS = 4000; // Wait 4 seconds to collect messages

  // Détection de langue améliorée avec mots-clés uniques et pondération
  private detectLanguage(text: string): string {
    const lowerText = text.toLowerCase().trim();
    const words = lowerText.split(/\s+/);
    const wordCount = words.length;

    // Pour les messages très courts, vérifier les indicateurs directs
    if (wordCount <= 3) {
      // Indicateurs anglais évidents
      const englishShort = ['hello', 'hi', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'please', 'help', 'what', 'how', 'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'need', 'want', 'buy', 'price', 'cost', 'good', 'morning', 'afternoon', 'evening', 'night', 'i want', 'i need', 'do you', 'are you', 'is it', 'is there', 'can i', 'how much', 'how many', 'what is', 'tell me', 'show me', 'give me'];

      // Indicateurs français évidents
      const frenchShort = ['bonjour', 'bonsoir', 'salut', 'oui', 'non', 'merci', 'svp', 's\'il vous plaît', 'aide', 'aidez', 'quoi', 'comment', 'pourquoi', 'quand', 'où', 'qui', 'combien', 'je veux', 'j\'ai besoin', 'avez-vous', 'est-ce que', 'c\'est quoi', 'il y a', 'je cherche', 'donnez-moi', 'montrez-moi'];

      // Vérifier anglais d'abord (plus précis pour messages courts)
      for (const indicator of englishShort) {
        if (lowerText === indicator || lowerText.includes(indicator)) {
          this.logger.debug(`Short message detected as ENGLISH: "${lowerText}" (matched: ${indicator})`);
          return 'en';
        }
      }

      // Vérifier français
      for (const indicator of frenchShort) {
        if (lowerText === indicator || lowerText.includes(indicator)) {
          this.logger.debug(`Short message detected as FRENCH: "${lowerText}" (matched: ${indicator})`);
          return 'fr';
        }
      }

      // Pour les messages très courts sans indicateur clair, analyser les caractères
      // Les messages en anglais utilisent rarement les accents
      const hasAccents = /[àâäéèêëïîôùûüç]/i.test(lowerText);
      if (hasAccents) {
        this.logger.debug(`Short message with accents detected as FRENCH: "${lowerText}"`);
        return 'fr';
      }
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

    // Log détaillé pour debug
    this.logger.log(`🌐 Language detection for: "${lowerText.substring(0, 80)}..."`);
    this.logger.log(`   Scores: EN=${scores['en'] || 0}, FR=${scores['fr'] || 0}, ES=${scores['es'] || 0}, DE=${scores['de'] || 0}`);
    this.logger.log(`   Best: ${bestLang} (${bestScore}), 2nd: ${sortedLangs[1]?.[0]} (${secondScore})`);

    // Si aucune langue n'a de score significatif
    if (bestScore < 3) {
      // Analyser les caractères pour deviner
      const hasAccents = /[àâäéèêëïîôùûüç]/i.test(lowerText);
      const hasArabic = /[\u0600-\u06FF]/.test(lowerText);
      const hasChinese = /[\u4e00-\u9fff]/.test(lowerText);
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(lowerText);

      if (hasArabic) return 'ar';
      if (hasChinese) return 'zh';
      if (hasJapanese) return 'ja';
      if (hasAccents) return 'fr';

      // Sans indication claire, utiliser l'anglais comme langue internationale par défaut
      this.logger.log(`   -> No clear language detected, defaulting to EN (international)`);
      return 'en';
    }

    // Si anglais et français sont très proches (différence < 30%), utiliser celui avec le meilleur score
    // Ne plus biaiser vers le français automatiquement
    if (bestScore > 0 && secondScore > 0) {
      const scoreDiffPercent = ((bestScore - secondScore) / bestScore) * 100;
      this.logger.log(`   Score difference: ${scoreDiffPercent.toFixed(1)}%`);

      // Si la différence est significative (> 20%), utiliser le meilleur
      if (scoreDiffPercent > 20) {
        this.logger.log(`   -> Clear winner: ${bestLang}`);
        return bestLang;
      }

      // Si très proche, vérifier des indicateurs supplémentaires
      // Présence d'accents français suggère le français
      const hasAccents = /[àâäéèêëïîôùûüç]/i.test(lowerText);
      if (hasAccents && scores['fr'] >= secondScore * 0.8) {
        this.logger.log(`   -> Close scores but has French accents, choosing FR`);
        return 'fr';
      }

      // Sinon, utiliser le meilleur score
      this.logger.log(`   -> Close scores, using best: ${bestLang}`);
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
    private vectorSearchService: VectorSearchService,
    private productSearchService: ProductSearchService,
    private orderTagParserService: OrderTagParserService,
    private appointmentTagParserService: AppointmentTagParserService,
    private availabilityService: AvailabilityService,
  ) {
    this.logger.log('WhatsAppAIResponderService initialized');
  }

  @OnEvent("whatsapp.message.received")
  async handleIncomingMessage(event: WhatsAppMessageEvent) {
    const message = event.message;
    const messageId = message.key?.id;
    const fromNumber = message.key?.remoteJid;

    // Skip if no message ID, no fromNumber, or if we're already processing this message
    if (!messageId || !fromNumber || this.processingMessages.has(messageId)) {
      return;
    }

    // Skip group messages - AI only responds to private chats
    if (fromNumber.endsWith("@g.us")) {
      return;
    }

    // Mark message as being processed
    this.processingMessages.add(messageId);

    try {
      // Extract message details and analyze media quickly
      const messageText = this.extractMessageText(message);
      const sock = await this.baileysService.getSessionSocket(event.sessionId);
      const mediaAnalysis = await this.mediaAnalysisService.analyzeMedia(message, sock);

      // Skip if no content
      if ((!messageText || messageText.trim() === "") && !mediaAnalysis) {
        return;
      }

      // Create buffer key for this conversation (session + sender)
      const bufferKey = `${event.sessionId}:${fromNumber}`;

      // Add message to buffer
      if (!this.messageBuffer.has(bufferKey)) {
        this.messageBuffer.set(bufferKey, []);
      }

      this.messageBuffer.get(bufferKey)!.push({
        event,
        messageText: messageText || "",
        mediaAnalysis,
        receivedAt: new Date(),
      });

      this.logger.log(`📦 Message buffered for ${fromNumber} (${this.messageBuffer.get(bufferKey)!.length} messages in buffer)`);

      // Clear existing timeout for this conversation
      if (this.batchTimeouts.has(bufferKey)) {
        clearTimeout(this.batchTimeouts.get(bufferKey)!);
      }

      // Set new timeout to process batch
      const timeout = setTimeout(async () => {
        await this.processBatchedMessages(bufferKey);
      }, this.BATCH_DELAY_MS);

      this.batchTimeouts.set(bufferKey, timeout);

    } catch (error) {
      this.logger.error(`Error buffering message: ${error.message}`);
      // Only delete on error - successful buffering keeps the ID to prevent duplicates
      if (messageId) {
        this.processingMessages.delete(messageId);
      }
    }
    // NOTE: messageId is kept in processingMessages until batch processing completes
    // This prevents duplicate processing if the same event is emitted multiple times
    // The ID will be cleaned up in processBatchedMessages after BATCH_DELAY_MS + processing time
  }

  /**
   * Handle catch-up messages after reconnection
   * This reuses the AI response generation for messages that weren't answered during disconnection
   */
  @OnEvent("whatsapp.catchup.message")
  async handleCatchUpMessage(event: {
    sessionId: string;
    conversationId: string;
    messageId: string;
    agentId: string;
    clientPhoneNumber: string;
    messageContent: string;
    session: WhatsAppSession;
    conversation: AgentConversation;
    originalMessage: AgentMessage;
    isCatchUp: boolean;
  }) {
    const { sessionId, conversationId, messageId, clientPhoneNumber, messageContent, session } = event;

    // Create a unique key to prevent duplicate processing
    const processingKey = `catchup-${messageId}`;
    if (this.processingMessages.has(processingKey)) {
      this.logger.debug(`Catch-up message ${messageId} already being processed`);
      return;
    }

    this.processingMessages.add(processingKey);

    try {
      this.logger.log(`🔄 Processing catch-up message ${messageId} for session ${sessionId}`);

      // Get full session with all relations if not already loaded
      let fullSession = session;
      if (!fullSession.agent) {
        fullSession = await this.sessionRepository.findOne({
          where: { id: sessionId },
          relations: [
            "user",
            "organization",
            "agent",
            "agent.knowledgeBases",
            "agent.catalogs",
            "knowledgeBase",
          ],
        });

        if (!fullSession) {
          this.logger.warn(`Session not found: ${sessionId}`);
          return;
        }
      }

      // Check if AI responses are enabled
      if (fullSession.aiResponsesEnabled === false) {
        this.logger.log(`🔇 AI responses disabled for session ${fullSession.id} - skipping catch-up`);
        return;
      }

      // Get the agent from session
      const agent = fullSession.agent;
      if (!agent) {
        this.logger.error(`❌ No agent linked to session ${sessionId} - cannot process catch-up`);
        return;
      }

      // Check message quota
      try {
        if (fullSession.organizationId) {
          await this.quotaEnforcementService.enforceWhatsAppMessageQuota(fullSession.organizationId);
        } else if (fullSession.userId) {
          await this.quotaEnforcementService.enforceUserWhatsAppMessageQuota(fullSession.userId);
        }
      } catch (quotaError) {
        this.logger.warn(`Message quota exceeded during catch-up: ${quotaError.message}`);
        return;
      }

      // Get the conversation
      let conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        // Create conversation if it doesn't exist
        conversation = await this.getOrCreateConversation(clientPhoneNumber, fullSession, agent);
      }

      // Check if conversation is under human control
      if (conversation.isHumanControlled) {
        this.logger.log(`👤 Conversation ${conversation.id} is under human control - skipping catch-up AI response`);
        return;
      }

      this.logger.log(`🤖 Generating catch-up AI response for message: ${messageId}`);

      // Generate and send AI response
      await this.generateAndSendResponse(
        conversation,
        agent,
        fullSession,
        clientPhoneNumber,
        messageContent,
        null, // No media analysis for catch-up messages
        null, // No reply context
      );

      this.logger.log(`✅ Catch-up response sent for message ${messageId}`);

    } catch (error) {
      this.logger.error(`❌ Error processing catch-up message ${messageId}: ${error.message}`, error.stack);
    } finally {
      this.processingMessages.delete(processingKey);
    }
  }

  /**
   * Process all buffered messages for a conversation as a single batch
   */
  private async processBatchedMessages(bufferKey: string) {
    const bufferedMessages = this.messageBuffer.get(bufferKey);
    if (!bufferedMessages || bufferedMessages.length === 0) {
      return;
    }

    // Clear buffer and timeout
    this.messageBuffer.delete(bufferKey);
    this.batchTimeouts.delete(bufferKey);

    const firstMessage = bufferedMessages[0];
    const event = firstMessage.event;
    const fromNumber = event.message.key?.remoteJid;

    this.logger.log(`🔄 Processing batch of ${bufferedMessages.length} messages from ${fromNumber}`);

    try {
      // Get session details
      const session = await this.sessionRepository.findOne({
        where: { id: event.sessionId },
        relations: [
          "user",
          "organization",
          "agent",
          "agent.knowledgeBases",
          "agent.catalogs",
          "knowledgeBase",
        ],
      });

      if (!session) {
        this.logger.warn(`Session not found: ${event.sessionId}`);
        return;
      }

      // Check if AI responses are enabled for this session
      if (session.aiResponsesEnabled === false) {
        this.logger.log(`🔇 AI responses disabled for session ${session.id} (${session.name}) - skipping`);
        return;
      }

      // Check message quota
      try {
        if (session.organizationId) {
          await this.quotaEnforcementService.enforceWhatsAppMessageQuota(session.organizationId);
        } else if (session.userId) {
          await this.quotaEnforcementService.enforceUserWhatsAppMessageQuota(session.userId);
        }
      } catch (quotaError) {
        this.logger.warn(`Message quota exceeded: ${quotaError.message}`);
        return;
      }

      // Combine all messages into one context
      const combinedParts: string[] = [];
      const allMediaAnalyses: any[] = [];
      let imageCount = 0;
      let audioCount = 0;
      let videoCount = 0;
      let documentCount = 0;

      for (const msg of bufferedMessages) {
        // Add text content
        if (msg.messageText && msg.messageText.trim()) {
          combinedParts.push(msg.messageText.trim());
        }

        // Collect media analyses
        if (msg.mediaAnalysis) {
          allMediaAnalyses.push(msg.mediaAnalysis);

          switch (msg.mediaAnalysis.type) {
            case 'image': imageCount++; break;
            case 'audio': audioCount++; break;
            case 'video': videoCount++; break;
            case 'document': documentCount++; break;
          }
        }
      }

      // Build combined message content
      let fullMessageContent = combinedParts.join("\n\n");

      // Add media summary if multiple media items
      if (allMediaAnalyses.length > 0) {
        if (imageCount > 1) {
          fullMessageContent += `\n\n[${imageCount} IMAGES REÇUES]`;
          // Add descriptions for each image
          allMediaAnalyses
            .filter(m => m.type === 'image')
            .forEach((m, i) => {
              fullMessageContent += `\n- Image ${i + 1}: ${m.description}`;
              if (m.extractedText) {
                fullMessageContent += ` (Légende: ${m.extractedText})`;
              }
            });
        } else if (imageCount === 1) {
          const img = allMediaAnalyses.find(m => m.type === 'image');
          fullMessageContent += `\n\n[IMAGE REÇUE: ${img.description}]`;
          if (img.extractedText) {
            fullMessageContent += `\nLégende: ${img.extractedText}`;
          }
        }

        if (audioCount > 0) {
          fullMessageContent += `\n\n[${audioCount} MESSAGE(S) AUDIO REÇU(S)]`;
          allMediaAnalyses
            .filter(m => m.type === 'audio')
            .forEach((m, i) => {
              if (m.extractedText) {
                fullMessageContent += `\n- Audio ${i + 1} (transcription): ${m.extractedText}`;
              }
            });
        }

        if (videoCount > 0) {
          fullMessageContent += `\n\n[${videoCount} VIDÉO(S) REÇUE(S)]`;
          allMediaAnalyses
            .filter(m => m.type === 'video')
            .forEach((m, i) => {
              fullMessageContent += `\n- Vidéo ${i + 1}: ${m.description}`;
            });
        }

        if (documentCount > 0) {
          fullMessageContent += `\n\n[${documentCount} DOCUMENT(S) REÇU(S)]`;
          allMediaAnalyses
            .filter(m => m.type === 'document')
            .forEach((m, i) => {
              fullMessageContent += `\n- Document ${i + 1}: ${m.description}`;
            });
        }

        // Handle links
        const links = allMediaAnalyses.filter(m => m.type === 'link');
        if (links.length > 0) {
          fullMessageContent += `\n\n[${links.length} LIEN(S) PARTAGÉ(S)]`;
          links.forEach((m, i) => {
            fullMessageContent += `\n- Lien ${i + 1}: ${m.description}`;
          });
        }
      }

      // Skip if no content
      if (!fullMessageContent.trim()) {
        return;
      }

      // Skip commands
      if (fullMessageContent.startsWith("/") || fullMessageContent.startsWith("!")) {
        return;
      }

      // Check auto-response setting
      const autoResponseEnabled = this.configService.get("WHATSAPP_AUTO_RESPONSE_ENABLED", "true") === "true";
      if (!autoResponseEnabled) {
        return;
      }

      // Get agent ONLY from session - NO FALLBACK to prevent agent mixing
      let agent = session.agent;

      // === DEBUG: Log session-agent linkage with WhatsApp number ===
      this.logger.log(`🔗 MESSAGE ROUTING: Session "${session.name || 'N/A'}" (${session.id}) | WhatsApp: ${session.phoneNumber || 'unknown'} | Agent: ${session.agent ? session.agent.name : 'NONE'} | From: ${fromNumber} | CatalogIds: ${JSON.stringify(session.agent?.catalogs?.map(c => c.id) || [])}`);

      if (!agent) {
        // 🚨 CRITICAL: Do NOT fall back to any other agent - this causes agent mixing issues
        // If no agent is linked, the session must have an agent assigned before AI can respond
        this.logger.error(`❌ Session ${session.id} (${session.name}) has NO linked agent!`);
        this.logger.error(`❌ AI responses disabled - please assign an agent to this session in the dashboard.`);

        // Send a warning message to the user (only once per conversation)
        const warningKey = `no-agent-warning:${session.id}:${fromNumber}`;
        const alreadyWarned = await this.cacheManager.get(warningKey);

        if (!alreadyWarned) {
          try {
            await this.baileysService.sendMessage(session.id, {
              to: fromNumber,
              message: "⚠️ Cette session WhatsApp n'a pas d'agent IA configuré. Veuillez contacter l'administrateur pour configurer un agent.",
              type: "text",
            });
            // Don't warn again for 1 hour
            await this.cacheManager.set(warningKey, 'true', 3600000);
          } catch (e) {
            this.logger.warn(`Could not send no-agent warning: ${e.message}`);
          }
        }
        return;
      }

      this.logger.log(`✅ Using session's linked agent: ${agent.id} - ${agent.name}`);

      // Log the system prompt being used (first 200 chars)
      this.logger.log(`📝 Agent System Prompt (first 200 chars): ${agent.systemPrompt?.substring(0, 200) || 'NO PROMPT'}...`);

      // Get or create conversation
      const conversation = await this.getOrCreateConversation(fromNumber, session, agent);

      // Check if conversation is under human control - skip AI response
      if (conversation.isHumanControlled) {
        this.logger.log(`👤 Conversation ${conversation.id} is under human control - saving messages but skipping AI response`);
        // Still save incoming messages
        for (const msg of bufferedMessages) {
          let msgContent = msg.messageText || "";
          if (msg.mediaAnalysis) {
            msgContent += msg.mediaAnalysis.description ? ` [${msg.mediaAnalysis.type}: ${msg.mediaAnalysis.description}]` : ` [${msg.mediaAnalysis.type}]`;
          }
          if (msgContent.trim()) {
            await this.saveIncomingMessage(conversation, msgContent.trim(), msg.event.message, msg.mediaAnalysis);
          }
        }
        // Emit socket event so operator sees new messages in real-time
        this.eventEmitter.emit('message.received', {
          conversationId: conversation.id,
          message: { content: fullMessageContent, role: 'user' },
          organizationId: agent.organizationId,
        });
        return;
      }

      // Check for escalation keywords
      const escalationConfig = agent.escalationConfig || {};
      const escalationEnabled = escalationConfig.enabled !== false; // Default to true
      if (escalationEnabled) {
        const keywords = escalationConfig.keywords?.length
          ? escalationConfig.keywords
          : ['parler à un humain', 'agent humain', 'responsable', 'talk to human', 'real person', 'human agent', 'speak to someone'];

        const lowerMessage = fullMessageContent.toLowerCase();
        const matchedKeyword = keywords.find(kw => lowerMessage.includes(kw.toLowerCase()));

        if (matchedKeyword) {
          this.logger.log(`🚨 Escalation keyword detected: "${matchedKeyword}" in conversation ${conversation.id}`);
          // Save the incoming messages first
          for (const msg of bufferedMessages) {
            let msgContent = msg.messageText || "";
            if (msg.mediaAnalysis) {
              msgContent += msg.mediaAnalysis.description ? ` [${msg.mediaAnalysis.type}: ${msg.mediaAnalysis.description}]` : ` [${msg.mediaAnalysis.type}]`;
            }
            if (msgContent.trim()) {
              await this.saveIncomingMessage(conversation, msgContent.trim(), msg.event.message, msg.mediaAnalysis);
            }
          }
          await this.escalateConversation(conversation, agent, session, fromNumber, `Keyword detected: ${matchedKeyword}`);
          return;
        }
      }

      // Save all incoming messages
      for (const msg of bufferedMessages) {
        let msgContent = msg.messageText || "";
        if (msg.mediaAnalysis) {
          msgContent += msg.mediaAnalysis.description ? ` [${msg.mediaAnalysis.type}: ${msg.mediaAnalysis.description}]` : ` [${msg.mediaAnalysis.type}]`;
        }
        if (msgContent.trim()) {
          await this.saveIncomingMessage(conversation, msgContent.trim(), msg.event.message, msg.mediaAnalysis);
        }
      }

      // Generate single AI response for all messages
      const replyContext = this.extractReplyContext(firstMessage.event.message);

      this.logger.log(`🤖 Generating AI response for combined message: ${fullMessageContent.substring(0, 200)}...`);

      await this.generateAndSendResponse(
        conversation,
        agent,
        session,
        fromNumber,
        fullMessageContent,
        allMediaAnalyses.length > 0 ? allMediaAnalyses[0] : null, // Pass first media for context
        replyContext,
      );

      this.logger.log(`✅ Batch processing complete for ${fromNumber}`);

    } catch (error) {
      this.logger.error(`Error processing batched messages: ${error.message}`, error.stack);
    } finally {
      // Clean up processed message IDs from the deduplication set
      for (const msg of bufferedMessages) {
        const msgId = msg.event.message?.key?.id;
        if (msgId) {
          this.processingMessages.delete(msgId);
        }
      }
      this.logger.debug(`🧹 Cleaned up ${bufferedMessages.length} message IDs from processingMessages set`);
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
      // Try to find existing active agent with knowledgeBases loaded
      let agent = await this.agentRepository.findOne({
        where: { organizationId, status: AgentStatus.ACTIVE },
        relations: ["knowledgeBases", "catalogs"],
        order: { createdAt: "DESC" },
      });

      if (!agent) {
        // Create default agent
        agent = await this.createDefaultAgent(organizationId);
      }

      this.logger.log(`🤖 Agent resolved: ${agent.name} (${agent.id}), KBs: ${agent.knowledgeBases?.length || 0}`);

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
    });

    let isNewConversation = false;
    if (!conversation) {
      conversation = this.conversationRepository.create({
        title: conversationTitle,
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.ACTIVE,
        agentId: agent.id,
        userId: session.userId,
        sessionId: session.id, // Set sessionId column for quota counting
        clientPhoneNumber: fromNumber, // Set clientPhoneNumber column
        context: {
          sessionId: session.id,
          userProfile: {
            phone: fromNumber,
            name: fromNumber,
          },
        },
      });

      conversation = await this.conversationRepository.save(conversation);
      isNewConversation = true;
      this.logger.log(`Created new conversation: ${conversation.id}`);

      // Send welcome message if configured
      if (agent.welcomeMessage && agent.welcomeMessage.trim()) {
        try {
          this.logger.log(`Sending welcome message for new conversation`);
          await this.baileysService.sendMessage(session.id, {
            to: fromNumber,
            message: agent.welcomeMessage,
            type: "text",
          });

          // Save the welcome message to conversation history
          const message = this.messageRepository.create({
            conversationId: conversation.id,
            role: MessageRole.AGENT,
            content: agent.welcomeMessage,
            status: MessageStatus.SENT,
            sequenceNumber: 1,
            metadata: {
              fromWhatsApp: true,
              originalSender: "agent",
              welcomeMessage: true,
            } as any,
          });
          await this.messageRepository.save(message);
          this.logger.log(`Welcome message sent and saved`);
        } catch (error) {
          this.logger.error(`Failed to send welcome message: ${error.message}`);
        }
      }
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


  /**
   * Generate a summary of older conversation messages using LLM
   * Caches the summary in Redis to avoid re-summarizing on every message
   */
  private async getConversationSummary(
    conversationId: string,
    olderMessages: Array<{role: string, content: string}>,
    agent: AiAgent,
  ): Promise<string | null> {
    try {
      // Check Redis cache first
      const cacheKey = `conv:summary:${conversationId}`;
      const cached = await this.cacheManager.get<string>(cacheKey);
      if (cached) {
        this.logger.log(`📝 Using cached conversation summary for ${conversationId}`);
        return cached;
      }

      // Format older messages for summarization
      const messagesText = olderMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      // Generate summary using LLM with low temperature for consistency
      const summaryPrompt = `Summarize this conversation concisely in 2-3 sentences. Preserve key facts, user preferences, names, and unresolved questions:\n\n${messagesText}`;

      this.logger.log(`📝 Generating conversation summary for ${conversationId} (${olderMessages.length} older messages)`);

      const result = await this.llmRouterService.generateResponse({
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        maxTokens: 200,
        organizationId: agent.organizationId,
        priority: 'low',
      });

      const summary = result.content;

      // Cache for 30 minutes (1800000 ms)
      await this.cacheManager.set(cacheKey, summary, 1800000);

      this.logger.log(`📝 Summary generated and cached: ${summary.substring(0, 100)}...`);

      return summary;
    } catch (error) {
      this.logger.warn(`Failed to generate conversation summary: ${error.message}`);
      return null;
    }
  }

  private async searchKnowledgeBase(
    session: WhatsAppSession,
    userMessage: string,
    agent?: AiAgent,
  ): Promise<string> {
    try {
      // Log session and agent state for debugging
      this.logger.log(`🔍 KB Search: Session ID = ${session.id}`);
      this.logger.log(`🔍 KB Search: Agent param provided = ${!!agent}`);
      if (agent) {
        this.logger.log(`🔍 KB Search: Using Agent ID = ${agent.id}, Name = ${agent.name}`);
        this.logger.log(`🔍 KB Search: Agent knowledgeBases count = ${agent.knowledgeBases?.length || 0}`);
      }
      this.logger.log(`🔍 KB Search: Session.agent ID = ${session.agent?.id || 'null'}`);
      this.logger.log(`🔍 KB Search: Session has direct knowledgeBase = ${!!session.knowledgeBase}`);
      this.logger.log(`🔍 KB Search: Organization ID = ${session.organizationId}`);

      // Priorité :
      // 1. Agent passé en paramètre (source de vérité) - search ALL KBs
      // 2. Agent de la session - search ALL KBs
      // 3. Base de connaissances directe de la session (legacy)
      // 4. Base de connaissances de l'organisation (fallback)
      let knowledgeBases: any[] = [];
      const effectiveAgent = agent || session.agent;

      if (
        effectiveAgent &&
        effectiveAgent.knowledgeBases &&
        effectiveAgent.knowledgeBases.length > 0
      ) {
        // Use ALL knowledge bases from the agent
        knowledgeBases = effectiveAgent.knowledgeBases;
        this.logger.log(
          `✅ Using agent's ${knowledgeBases.length} knowledge base(s): ${knowledgeBases.map(kb => `${kb.name} (${kb.id})`).join(', ')} from agent ${effectiveAgent.name}`,
        );
      } else if (session.knowledgeBase) {
        // Fallback: base de connaissances directement associée à la session (legacy)
        knowledgeBases = [session.knowledgeBase];
        this.logger.log(
          `✅ Using session's direct knowledge base: ${session.knowledgeBase.name} (${session.knowledgeBase.id})`,
        );
      } else {
        // Fallback: chercher par organisation
        this.logger.log(`⚠️ No agent KB or session KB, searching by organization...`);
        const orgKb = await this.knowledgeBaseRepository.findOne({
          where: { organizationId: session.organizationId },
          relations: ["documents"],
        });
        if (orgKb) {
          knowledgeBases = [orgKb];
          this.logger.log(
            `✅ Using organization's default knowledge base: ${orgKb.name} (${orgKb.id})`,
          );
        } else {
          this.logger.warn(`❌ No knowledge base found for organization ${session.organizationId}`);
        }
      }

      if (knowledgeBases.length === 0) {
        this.logger.debug(`No knowledge base found for session ${session.id}`);
        return "";
      }

      const knowledgeBaseIds = knowledgeBases.map(kb => kb.id);
      this.logger.log(
        `Searching ${knowledgeBaseIds.length} knowledge base(s) for: "${userMessage}"`,
      );

      // Try hybrid search (combines vector + keyword search with re-ranking)
      try {
        const hybridResults = await this.vectorSearchService.hybridSearch({
          query: userMessage,
          organizationId: session.organizationId,
          knowledgeBaseIds: knowledgeBaseIds,
          limit: 5,
          threshold: 0.6,
          includeContent: true,
        });

        // Track KB search analytics
        this.eventEmitter.emit('analytics.kb.search', {
          agentId: agent?.id || session.agentId,
          organizationId: session.organizationId,
          query: userMessage,
          resultsCount: hybridResults.length,
          kbHit: hybridResults.length > 0,
          searchType: 'hybrid',
          topScore: hybridResults[0]?.score || 0,
          knowledgeBaseIds,
        });

        if (hybridResults.length > 0) {
          this.logger.log(`Hybrid search returned ${hybridResults.length} results`);
          const MAX_KB_CHARS = 24000;
          let totalChars = 0;
          const contextParts: string[] = [];

          for (const result of hybridResults) {
            const entry = `**${result.document.title}** (score: ${result.score.toFixed(2)}):\n${result.chunk.content}`;
            if (totalChars + entry.length > MAX_KB_CHARS) {
              const remaining = MAX_KB_CHARS - totalChars;
              if (remaining > 200) {
                contextParts.push(`**${result.document.title}** (score: ${result.score.toFixed(2)}):\n${result.chunk.content.substring(0, remaining - 50)}...[tronqué]`);
              }
              break;
            }
            contextParts.push(entry);
            totalChars += entry.length;
          }

          // Use localized KB header
          const lang = agent?.primaryLanguage || AgentLanguage.FRENCH;
          const i18n = this.getLocalizedInstructions(lang);
          return `${i18n.kbHeader}\n\n${contextParts.join("\n\n---\n\n")}`;
        }
        this.logger.log(`Hybrid search returned no results, falling back to full document search`);
      } catch (error) {
        this.logger.warn(`Hybrid search failed, falling back to full document search: ${error.message}`);
      }

      // Fallback: keyword-based search on full documents from ALL knowledge bases
      const searchTerms = userMessage
        .toLowerCase()
        .split(/[\s,.'?!]+/)
        .filter((term) => term.length > 2);

      const allSearchTerms = [...new Set(searchTerms)];

      this.logger.log(`Keyword search terms: ${allSearchTerms.join(', ')}`);

      // Query documents from ALL knowledge bases
      let documents: KnowledgeDocument[] = [];

      for (const kb of knowledgeBases) {
        // 🔴 REDIS CACHE: Vérifier si les documents sont en cache
        const cacheKey = `kb:docs:${kb.id}`;
        let kbDocuments: KnowledgeDocument[] | null = null;

        try {
          const cachedDocs = await this.cacheManager.get<string>(cacheKey);
          if (cachedDocs) {
            kbDocuments = JSON.parse(cachedDocs);
            this.logger.log(`📦 KB Cache HIT: ${kbDocuments.length} documents from Redis cache for KB ${kb.id}`);
          }
        } catch (cacheError) {
          this.logger.warn(`Cache read error: ${cacheError.message}`);
        }

        // Si pas en cache, charger depuis la DB
        if (!kbDocuments) {
          this.logger.log(`📦 KB Cache MISS: Loading from database for KB ${kb.id}...`);
          kbDocuments = await this.knowledgeDocumentRepository
            .createQueryBuilder("doc")
            .where("doc.knowledgeBaseId = :kbId", { kbId: kb.id })
            .andWhere("doc.status IN (:...statuses)", { statuses: ["processed", "uploaded"] })
            .andWhere("doc.content IS NOT NULL")
            .andWhere("LENGTH(doc.content) > 10")
            .orderBy("doc.createdAt", "DESC")
            .getMany();

          // Mettre en cache pour 5 minutes (300000 ms)
          try {
            await this.cacheManager.set(cacheKey, JSON.stringify(kbDocuments), 300000);
            this.logger.log(`📦 KB Cache SET: ${kbDocuments.length} documents cached for 5 minutes for KB ${kb.id}`);
          } catch (cacheError) {
            this.logger.warn(`Cache write error: ${cacheError.message}`);
          }
        }

        documents.push(...kbDocuments);
      }

      this.logger.log(`Found ${documents.length} total documents across ${knowledgeBases.length} knowledge base(s)`);

      // Log document details for debugging
      documents.forEach((doc, idx) => {
        this.logger.log(`📄 Doc ${idx + 1}: "${doc.title}" - ${doc.content?.length || 0} chars - Status: ${doc.status}`);
        if (doc.content) {
          this.logger.log(`   Preview: ${doc.content.substring(0, 200).replace(/\n/g, ' ')}...`);
        }
      });

      if (documents.length === 0) {
        this.logger.debug(
          `No documents found in ${knowledgeBases.length} knowledge base(s)`,
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
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const contentMatches = (content.match(new RegExp(escapedTerm, 'gi')) || []).length;
          score += contentMatches * 2;
        }

        return { doc, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 documents les plus pertinents

      // Token budget management: cap KB context to ~6000 tokens (~24000 chars)
      const MAX_KB_CHARS = 24000;

      if (scoredDocuments.length === 0) {
        // No specific matches - include general KB content but within budget
        this.logger.log(`No specific matches, returning KB content within token budget`);

        let totalChars = 0;
        const budgetedContent: string[] = [];

        for (const doc of documents.filter(d => d.content && d.content.length > 50)) {
          const content = doc.content || "";
          const entry = `**${doc.title}**:\n${content}`;
          if (totalChars + entry.length > MAX_KB_CHARS) {
            // Add truncated version if we have room
            const remaining = MAX_KB_CHARS - totalChars;
            if (remaining > 200) {
              budgetedContent.push(`**${doc.title}**:\n${content.substring(0, remaining - 50)}...[tronqué]`);
            }
            break;
          }
          budgetedContent.push(entry);
          totalChars += entry.length;
        }

        // Track KB search analytics - no specific matches but general content
        this.eventEmitter.emit('analytics.kb.search', {
          agentId: agent?.id || session.agentId,
          organizationId: session.organizationId,
          query: userMessage,
          resultsCount: budgetedContent.length,
          kbHit: budgetedContent.length > 0,
          searchType: 'keyword_fallback_general',
          topScore: 0,
          knowledgeBaseIds,
        });

        if (budgetedContent.length > 0) {
          return `📚 BASE DE CONNAISSANCES DISPONIBLE:\n\n${budgetedContent.join("\n\n---\n\n")}\n\n⚠️ UTILISE CES INFORMATIONS POUR RÉPONDRE AU CLIENT!`;
        }
        return "";
      }

      // Build context from scored documents within token budget
      let totalChars = 0;
      const contextParts: string[] = [];

      for (const { doc, score } of scoredDocuments) {
        const content = doc.content || "";
        const entry = `**${doc.title}** (pertinence: ${score}):\n${content}`;

        if (totalChars + entry.length > MAX_KB_CHARS) {
          const remaining = MAX_KB_CHARS - totalChars;
          if (remaining > 200) {
            contextParts.push(`**${doc.title}** (pertinence: ${score}):\n${content.substring(0, remaining - 50)}...[tronqué]`);
          }
          break;
        }
        contextParts.push(entry);
        totalChars += entry.length;
      }

      // Track KB search analytics for keyword fallback
      this.eventEmitter.emit('analytics.kb.search', {
        agentId: agent?.id || session.agentId,
        organizationId: session.organizationId,
        query: userMessage,
        resultsCount: scoredDocuments.length,
        kbHit: scoredDocuments.length > 0,
        searchType: 'keyword_fallback',
        topScore: scoredDocuments[0]?.score || 0,
        knowledgeBaseIds,
      });

      // Use localized KB header
      const lang = agent?.primaryLanguage || AgentLanguage.FRENCH;
      const i18n = this.getLocalizedInstructions(lang);
      const context = `${i18n.kbHeader}\n\n${contextParts.join("\n\n---\n\n")}`;

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
    const startTime = Date.now();

    try {
      this.logger.log(
        `Generating AI response for conversation: ${conversation.id}`,
      );

      // Get conversation history (last 30 messages for hybrid buffer approach)
      const recentMessages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: "DESC" },
        take: 30,
      });

      // Search knowledge base for relevant information
      // Pass the agent to ensure we use the correct KB (not just session.agent)
      const knowledgeContext = await this.searchKnowledgeBase(
        session,
        userMessage,
        agent,
      );

      // Search product catalog ONLY if agent has actual catalogs linked
      // Using catalogIds.length > 0 (not ecommerceEnabled flag) to prevent product leaking to non-ecommerce agents
      let productContext = "";
      let foundProducts: Product[] = [];
      const catalogIds = agent.catalogs?.map(c => c.id) || [];
      if (catalogIds.length > 0) {
        // Build search query using current message + recent conversation context
        const recentUserMessages = recentMessages
          .filter(m => m.role === 'user')
          .slice(0, 3)
          .map(m => m.content)
          .reverse();
        const searchQuery = recentUserMessages.length > 1
          ? recentUserMessages.join(' ') // combine last few user messages for context
          : userMessage;
        try {
          this.logger.log(`Searching product catalog for: "${searchQuery.substring(0, 100)}" (catalogIds: ${JSON.stringify(catalogIds)})`);
          const products = await this.productSearchService.searchProducts(
            agent.organizationId,
            searchQuery,
            10,
            catalogIds,
          );
          if (products.length > 0) {
            foundProducts = products;
            productContext = this.productSearchService.formatProductsForPrompt(products);
            this.logger.log(`Found ${products.length} products for AI context`);
          }
        } catch (error) {
          this.logger.warn(`Product search failed: ${error.message}`);
        }
      }

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

      // Get available media with slugs for AI image tags
      const availableMedia = await this.getAvailableMediaWithSlugs(agent);
      this.logger.log(`📷 Available media for AI: ${availableMedia.length} items`);

      // Create enhanced system prompt with knowledge base, web context, and media context
      // Get localized strings based on agent's language
      const i18n = this.getLocalizedInstructions(agent.primaryLanguage);

      let systemPrompt = agent.systemPrompt || "Tu es un assistant IA utile.";

      // Add escalation instructions if enabled
      const escalationEnabled = (agent.escalationConfig?.enabled !== false);
      if (escalationEnabled) {
        systemPrompt += `\n\nESCALATION TO HUMAN OPERATOR:
If you cannot adequately help the user, or if the request requires human intervention (complex complaint, sensitive issue, request beyond your capabilities), respond ONLY with:
[ESCALATE] Brief reason for escalation

Examples of when to escalate:
- User is frustrated and explicitly asks for a human
- Complex billing/payment disputes
- Technical issues you cannot resolve
- Sensitive personal matters
- Requests that require human judgment or authorization

Do NOT escalate for simple questions you can answer from the knowledge base.`;
      }

      // FIX 5: Move KB context to the BEGINNING (right after user's system prompt)
      // to avoid "lost in the middle" problem
      if (knowledgeContext) {
        systemPrompt += `\n\n${knowledgeContext}`;
      }

      // Add product catalog context if available
      if (productContext) {
        systemPrompt += `\n\n${productContext}`;
      }

      // Add ORDER instructions only if agent has actual catalogs linked
      if (catalogIds.length > 0) {
        systemPrompt += `\n\nORDER CREATION VIA WHATSAPP:
You are communicating with the customer via WhatsApp. There is NO website, NO shopping cart, NO online checkout.
The entire ordering process happens through this WhatsApp conversation.

When a customer wants to buy a product:
1. Confirm the product, variant, and quantity with the customer
2. Ask for their full name (if not already known)
3. Ask for their delivery address (city, neighborhood/street)
4. Ask for their preferred payment method (Mobile Money, cash on delivery, etc.)
5. Once all information is collected, create the order using the tag below

Format: [ORDER]{"items":[{"productName":"Product Name","variantName":"Variant (optional)","quantity":1}],"clientName":"Customer Name","deliveryAddress":{"street":"...","city":"..."},"notes":"Any special instructions"}[/ORDER]

IMPORTANT RULES:
- NEVER mention a shopping cart, checkout page, website, or "add to cart" button — the customer is on WhatsApp
- Only create the [ORDER] tag when you have: product confirmed, customer name, and delivery address
- Include ALL products the customer wants in a single order
- Use exact product names from the catalog
- You can include the order tag alongside your confirmation message
- If a product has an external URL, you may share it as additional information`;
      }

      // Add APPOINTMENT instructions if appointments are enabled
      if (agent.appointmentsEnabled) {
        try {
          const availabilityText = await this.availabilityService.getFormattedSlotsForNextDays(
            agent.organizationId,
            agent.id,
            7,
          );
          systemPrompt += `\n\nAPPOINTMENT BOOKING:
When a customer wants to schedule an appointment, propose available slots and create a booking.
Format: [APPOINTMENT]{"date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":30,"clientName":"Customer Name (if known)","title":"Appointment title","description":"Details"}[/APPOINTMENT]

AVAILABLE SLOTS (next 7 days):
${availabilityText}

IMPORTANT RULES:
- Only propose slots that are listed as available above
- Confirm the date and time with the customer before creating the appointment
- Include the appointment tag alongside your confirmation message
- If no slots are available for the requested date, suggest alternative dates`;
        } catch (error) {
          this.logger.warn(`Failed to get availability for appointment prompt: ${error.message}`);
        }
      }

      // Add response style instructions based on agent configuration
      systemPrompt += this.buildResponseStyleInstructions(agent);

      // Add image sending instructions if media is available
      if (availableMedia.length > 0) {
        systemPrompt += this.buildImageInstructions(availableMedia);
      }
      
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

      // FIX 4: More concise KB rules (save tokens)
      if (knowledgeContext) {
        const rules = i18n.absoluteRules;
        systemPrompt += `\n\n${rules.title}
1. ${rules.neverInventPrices}
2. ${rules.useExactInfo}
3. ${rules.fcfaConversion}
4. ${rules.noRedundantQuestions}
5. ${rules.redirectIfMissing}`;
      } else {
        // FIX 1: Add fallback message instruction when no KB context
        systemPrompt += `\n\n⚠️ ${i18n.noKbWarning}`;
        if (agent.fallbackMessage) {
          systemPrompt += `\n\n${i18n.fallbackInstruction} "${agent.fallbackMessage}"`;
        }
      }
      if (webContext) {
        systemPrompt += `\n\n${webContext}`;
      }

      // Hybrid buffer approach: keep last 10 messages verbatim, summarize older ones
      const VERBATIM_COUNT = 10;
      const recentForLLM = recentMessages.slice(0, VERBATIM_COUNT);
      let conversationSummary: string | null = null;

      // Generate summary of older messages if conversation is long
      if (recentMessages.length > VERBATIM_COUNT) {
        const olderMessages = recentMessages.slice(VERBATIM_COUNT).reverse().map((msg) => ({
          role: msg.role === MessageRole.USER ? 'user' : 'assistant',
          content: msg.content,
        }));
        conversationSummary = await this.getConversationSummary(
          conversation.id,
          olderMessages,
          agent,
        );
      }

      // Build messages array with summary and recent messages
      const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
        {
          role: "system" as const,
          content: systemPrompt,
        },
      ];

      // Add conversation summary if available
      if (conversationSummary) {
        messages.push({
          role: "system" as const,
          content: `Previous conversation summary: ${conversationSummary}`,
        });
      }

      // Add recent messages in chronological order (reverse DESC to ASC)
      messages.push(
        ...recentForLLM.reverse().map((msg) => ({
          role:
            msg.role === MessageRole.USER
              ? ("user" as const)
              : ("assistant" as const),
          content: msg.content,
        })),
      );

      // Add current user message
      messages.push({
        role: "user" as const,
        content: userMessage,
      });

      // Debug log conversation history being sent to LLM
      this.logger.log(`📜 Conversation history: ${recentMessages.length} total messages, ${conversationSummary ? 'with summary of older messages, ' : ''}sending last ${VERBATIM_COUNT} verbatim to LLM`);
      if (recentMessages.length > 0) {
        const historyPreview = recentMessages.slice(0, 3).map(m => `[${m.role}]: ${m.content?.substring(0, 50)}...`).join(' | ');
        this.logger.log(`📜 Recent messages preview (newest first): ${historyPreview}`);
      }
      if (conversationSummary) {
        this.logger.log(`📜 Summary: ${conversationSummary.substring(0, 100)}...`);
      }

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

      // FIX 3: Use agent's configured LLM parameters with proper fallbacks
      const response = await this.llmRouterService.generateResponse({
        messages: enhancedMessages,
        temperature: agent.config?.temperature ?? 0.7,
        maxTokens: agent.config?.maxTokens ?? 2000,
        topP: agent.config?.topP ?? 0.9,
        frequencyPenalty: agent.config?.frequencyPenalty ?? 0,
        presencePenalty: agent.config?.presencePenalty ?? 0,
        organizationId: agent.organizationId,
        agentId: agent.id,
        priority: "high", // Higher priority for better response quality
      });

      // Check for [ESCALATE] tag in AI response
      if (response.content && response.content.includes('[ESCALATE]')) {
        const escalateMatch = response.content.match(/\[ESCALATE\]\s*(.*)/);
        const reason = escalateMatch?.[1]?.trim() || 'AI determined escalation needed';
        this.logger.log(`🚨 AI triggered escalation for conversation ${conversation.id}: ${reason}`);
        await this.escalateConversation(conversation, agent, session, fromNumber, reason);
        return;
      }

      // Check for [ORDER] tag in AI response
      if (response.content && response.content.includes('[ORDER]')) {
        try {
          const { cleanResponse, order } = await this.orderTagParserService.parseAndProcess(
            response.content,
            {
              organizationId: agent.organizationId,
              agentId: agent.id,
              conversationId: conversation.id,
              clientPhoneNumber: fromNumber,
            },
          );
          if (order) {
            this.logger.log(`🛒 Order created from AI: ${order.orderNumber}`);
            response.content = cleanResponse;
          }
        } catch (error) {
          this.logger.error(`Failed to process ORDER tag: ${error.message}`);
          response.content = response.content.replace(/\[ORDER\][\s\S]*?\[\/ORDER\]/, '').trim();
        }
      }

      // Check for [APPOINTMENT] tag in AI response
      if (response.content && response.content.includes('[APPOINTMENT]')) {
        try {
          const { cleanResponse, appointment } = await this.appointmentTagParserService.parseAndProcess(
            response.content,
            {
              organizationId: agent.organizationId,
              agentId: agent.id,
              conversationId: conversation.id,
              clientPhoneNumber: fromNumber,
            },
          );
          if (appointment) {
            this.logger.log(`📅 Appointment created from AI: ${appointment.id}`);
            response.content = cleanResponse;
          }
        } catch (error) {
          this.logger.error(`Failed to process APPOINTMENT tag: ${error.message}`);
          response.content = response.content.replace(/\[APPOINTMENT\][\s\S]*?\[\/APPOINTMENT\]/, '').trim();
        }
      }

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
        // Parse image tags from AI response
        const { cleanText, imageSlugs, productImageIndices } = this.parseImageTags(response.content);

        this.logger.log(`📷 Image tags: KB=${imageSlugs.length}, Products=${productImageIndices.length}`);

        // Convert markdown to WhatsApp format (use clean text without image tags)
        const whatsappMessage = this.convertToWhatsAppFormat(cleanText);

        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: whatsappMessage,
          type: "text",
        });

        // Track sent message for usage statistics
        await this.trackSentMessage(session.organizationId);

        // Track conversation quality metrics
        this.eventEmitter.emit('analytics.conversation.metric', {
          conversationId: conversation.id,
          agentId: agent.id,
          organizationId: agent.organizationId,
          metrics: {
            responseTimeMs: Date.now() - startTime,
            kbHit: !!knowledgeContext && knowledgeContext.length > 100,
            webSearchUsed: !!webContext,
            summaryUsed: !!conversationSummary,
            messageCount: recentMessages.length,
            tokensUsed: response.usage?.totalTokens || 0,
          }
        });

        this.logger.log(
          `AI response sent successfully to ${fromNumber}: "${cleanText.substring(0, 50)}..."`,
        );

        // Send images based on [IMAGE:slug] tags found in AI response (Knowledge Base)
        if (imageSlugs.length > 0) {
          for (const slug of imageSlugs) {
            try {
              const mediaDocument = await this.findMediaBySlug(agent, slug);
              if (mediaDocument) {
                this.logger.log(`📷 Sending image from tag [IMAGE:${slug}]: ${mediaDocument.title}`);
                await this.sendMediaFromKnowledgeBase(session, fromNumber, mediaDocument);
              } else {
                this.logger.warn(`📷 Image not found for slug: ${slug}`);
              }
            } catch (imgError) {
              this.logger.warn(`📷 Failed to send image [${slug}]: ${imgError.message}`);
            }
          }
        }

        // Send product images based on [PRODUCT_IMAGE:N] tags — AI decides which products to show
        if (foundProducts && foundProducts.length > 0 && productImageIndices.length > 0) {
          this.logger.log(`[ProductImages] AI requested ${productImageIndices.length} product images out of ${foundProducts.length} found`);

          for (const idx of productImageIndices.slice(0, 3)) {
            if (idx < foundProducts.length) {
              const product = foundProducts[idx];
              if (product.images?.length > 0) {
                const primaryImage = product.images.find(img => img.isPrimary) || product.images[0];
                if (primaryImage?.url) {
                  try {
                    await this.baileysService.sendMessage(session.id, {
                      to: fromNumber,
                      message: primaryImage.url,
                      type: 'image',
                      mediaUrl: primaryImage.url,
                      caption: `${product.name}${product.price ? ` - ${product.price} ${product.currency}` : ''}`,
                    });
                  } catch (imgError) {
                    this.logger.warn(`Failed to send product image for ${product.name}: ${imgError.message}`);
                  }
                }
              }
            }
          }
        }
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

      this.logger.log(`🔍 Searching media in KB ${knowledgeBaseId} with keywords: ${keywords.join(', ')}`);

      // First, let's see all media documents in this KB for debugging
      const allMedia = await this.knowledgeDocumentRepository
        .createQueryBuilder('doc')
        .where('doc.knowledgeBaseId = :knowledgeBaseId', { knowledgeBaseId })
        .andWhere('doc.type IN (:...mediaTypes)', {
          mediaTypes: ['image', 'video']
        })
        .getMany();

      this.logger.log(`📸 Total media in KB: ${allMedia.length}`);
      allMedia.forEach((m, i) => {
        this.logger.log(`   Media ${i + 1}: ${m.title} | type=${m.type} | status=${m.status} | path=${m.filePath?.substring(0, 50)}...`);
      });

      if (keywords.length === 0) {
        // If no keywords, return all available media (up to 3)
        this.logger.log('No keywords extracted, returning all available media');
        const availableMedia = allMedia
          .filter(m => m.status === 'processed' || m.status === 'uploaded')
          .slice(0, 3);
        return availableMedia;
      }

      // Build OR conditions for each keyword - include both 'processed' and 'uploaded' status
      const queryBuilder = this.knowledgeDocumentRepository
        .createQueryBuilder('doc')
        .where('doc.knowledgeBaseId = :knowledgeBaseId', { knowledgeBaseId })
        .andWhere('doc.type IN (:...mediaTypes)', {
          mediaTypes: ['image', 'video']
        })
        .andWhere('doc.status IN (:...statuses)', {
          statuses: ['processed', 'uploaded']
        });

      // Build dynamic OR conditions for keywords
      const keywordConditions = keywords.map((_, index) =>
        `(LOWER(doc.title) LIKE :kw${index} OR LOWER(doc.filename) LIKE :kw${index} OR LOWER(COALESCE(doc.content, \'\')) LIKE :kw${index})`
      ).join(' OR ');

      const keywordParams = {};
      keywords.forEach((keyword, index) => {
        keywordParams[`kw${index}`] = `%${keyword.toLowerCase()}%`;
      });

      queryBuilder.andWhere(`(${keywordConditions})`, keywordParams);

      const mediaDocuments = await queryBuilder
        .orderBy('doc.updatedAt', 'DESC')
        .limit(5)
        .getMany();

      this.logger.log(`🎯 Found ${mediaDocuments.length} matching media documents`);

      // If no matching keywords but we have media, return first available
      if (mediaDocuments.length === 0 && allMedia.length > 0) {
        this.logger.log(`No keyword match, but KB has media - returning first available`);
        const firstMedia = allMedia.find(m => m.status === 'processed' || m.status === 'uploaded');
        return firstMedia ? [firstMedia] : [];
      }

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
      this.logger.log(`Media filePath: ${mediaDocument.filePath}`);

      // Convert local file path to public URL
      let mediaUrl = mediaDocument.filePath;

      // If it's a local path (starts with / or contains uploads/), convert to public URL
      if (mediaUrl && !mediaUrl.startsWith('http')) {
        const apiUrl = this.configService.get('API_URL', 'https://api.wazeapp.xyz');

        // Extract the relative path from the absolute path
        // e.g., /app/uploads/documents/file.jpg -> uploads/documents/file.jpg
        let relativePath = mediaUrl;

        // Handle different path formats
        if (mediaUrl.includes('/uploads/')) {
          relativePath = mediaUrl.substring(mediaUrl.indexOf('/uploads/') + 1);
        } else if (mediaUrl.startsWith('./uploads/')) {
          relativePath = mediaUrl.substring(2); // Remove ./
        } else if (mediaUrl.startsWith('uploads/')) {
          relativePath = mediaUrl;
        }

        mediaUrl = `${apiUrl}/${relativePath}`;
        this.logger.log(`Converted to public URL: ${mediaUrl}`);
      }

      // Determine media type based on document type
      let mediaType: string;
      if (mediaDocument.type === 'video') {
        mediaType = 'video';
      } else if (mediaDocument.type === 'audio') {
        mediaType = 'audio';
      } else {
        mediaType = 'image';
      }

      if (mediaType === 'audio') {
        // WhatsApp audio messages don't support captions
        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: '',
          type: 'audio',
          mediaUrl: mediaUrl,
        });
      } else {
        // Use only the title for caption (content often contains unreadable OCR text)
        const caption = `📁 ${mediaDocument.title}`;

        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: caption,
          type: mediaType,
          mediaUrl: mediaUrl,
          caption: caption
        });
      }

      // Track sent message for usage statistics
      await this.trackSentMessage(session.organizationId);

      this.logger.log(`Knowledge base media sent to ${fromNumber}: ${mediaDocument.title}`);

    } catch (error) {
      this.logger.error(`Failed to send knowledge base media: ${error.message}`);
      this.logger.error(`Media URL attempted: ${mediaDocument.filePath}`);
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
        usageMetric.value = Number(usageMetric.value) + 1;
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

  /**
   * Get available media (images/videos) from knowledge base with their slugs
   * Used to inform the AI about which images it can send
   */
  private async getAvailableMediaWithSlugs(agent: AiAgent): Promise<Array<{slug: string, title: string, type: string}>> {
    try {
      if (!agent.knowledgeBases || agent.knowledgeBases.length === 0) {
        return [];
      }

      const knowledgeBaseIds = agent.knowledgeBases.map(kb => kb.id);

      const mediaDocuments = await this.knowledgeDocumentRepository
        .createQueryBuilder('doc')
        .select(['doc.slug', 'doc.title', 'doc.type'])
        .where('doc.knowledgeBaseId IN (:...knowledgeBaseIds)', { knowledgeBaseIds })
        .andWhere('doc.type IN (:...mediaTypes)', { mediaTypes: ['image', 'video', 'audio'] })
        .andWhere('doc.status IN (:...statuses)', { statuses: ['processed', 'uploaded'] })
        .andWhere('doc.slug IS NOT NULL')
        .orderBy('doc.title', 'ASC')
        .getMany();

      return mediaDocuments.map(doc => ({
        slug: doc.slug,
        title: doc.title,
        type: doc.type,
      }));
    } catch (error) {
      this.logger.warn(`Failed to get available media: ${error.message}`);
      return [];
    }
  }

  /**
   * Find a media document by its slug in the knowledge base
   */
  private async findMediaBySlug(
    agent: AiAgent,
    slug: string
  ): Promise<KnowledgeDocument | null> {
    try {
      if (!agent.knowledgeBases || agent.knowledgeBases.length === 0) {
        return null;
      }

      const knowledgeBaseIds = agent.knowledgeBases.map(kb => kb.id);

      const document = await this.knowledgeDocumentRepository.findOne({
        where: {
          knowledgeBaseId: In(knowledgeBaseIds),
          slug,
          type: In(['image', 'video', 'audio']),
        },
      });

      return document;
    } catch (error) {
      this.logger.warn(`Failed to find media by slug: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse [IMAGE:slug], [VIDEO:slug], and [AUDIO:slug] tags from AI response and return clean text + media slugs
   */
  private parseImageTags(response: string): { cleanText: string; imageSlugs: string[]; productImageIndices: number[] } {
    const mediaTagRegex = /\[(?:IMAGE|VIDEO|AUDIO):([^\]]+)\]/gi;
    const productImageRegex = /\[PRODUCT_IMAGE:(\d+)\]/gi;
    const imageSlugs: string[] = [];
    const productImageIndices: number[] = [];

    // Extract all media slugs (KB images)
    let match;
    while ((match = mediaTagRegex.exec(response)) !== null) {
      imageSlugs.push(match[1].trim().toLowerCase());
    }

    // Extract product image indices (1-based from AI → 0-based)
    let productMatch;
    while ((productMatch = productImageRegex.exec(response)) !== null) {
      const idx = parseInt(productMatch[1], 10) - 1;
      if (idx >= 0 && !productImageIndices.includes(idx)) {
        productImageIndices.push(idx);
      }
    }

    // Remove all tags from response
    const cleanText = response
      .replace(mediaTagRegex, '')
      .replace(productImageRegex, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { cleanText, imageSlugs, productImageIndices };
  }

  /**
   * Get localized instruction strings based on agent's primary language
   */
  private getLocalizedInstructions(lang: AgentLanguage) {
    const instructions = {
      [AgentLanguage.FRENCH]: {
        styleHeader: '📝 STYLE DE RÉPONSE:',
        kbHeader: '📚 INFORMATIONS DE LA BASE DE CONNAISSANCES:',
        rulesHeader: 'RÈGLES IMPORTANTES:',
        noKbWarning: 'Aucune base de connaissances configurée.',
        fallbackInstruction: 'Si vous ne trouvez pas d\'information spécifique pour répondre à la question, répondez avec ce message exact:',
        absoluteRules: {
          title: 'RÈGLES IMPORTANTES:',
          neverInventPrices: 'Ne jamais inventer de prix. Si un prix n\'est pas dans la base de connaissances, dire "Je n\'ai pas le tarif exact, contactez-nous".',
          useExactInfo: 'Utiliser uniquement les informations exactes de la base de connaissances ci-dessus.',
          fcfaConversion: 'Conversion FCFA: Si le client demande en FCFA et que vous avez le prix en USD, multipliez par 600 (exemple: 850 USD = 510 000 FCFA).',
          noRedundantQuestions: 'Ne redemandez pas les informations déjà fournies.',
          redirectIfMissing: 'Si l\'information n\'est pas dans la base de connaissances, dire: "Pour le tarif exact, veuillez nous contacter directement."'
        }
      },
      [AgentLanguage.ENGLISH]: {
        styleHeader: '📝 RESPONSE STYLE:',
        kbHeader: '📚 KNOWLEDGE BASE INFORMATION:',
        rulesHeader: 'IMPORTANT RULES:',
        noKbWarning: 'No knowledge base configured.',
        fallbackInstruction: 'If you cannot find specific information to answer the question, respond with this exact message:',
        absoluteRules: {
          title: 'IMPORTANT RULES:',
          neverInventPrices: 'Never invent prices. If a price is not in the knowledge base, say "I don\'t have the exact price, please contact us".',
          useExactInfo: 'Use only exact information from the knowledge base above.',
          fcfaConversion: 'FCFA conversion: If the customer asks in FCFA and you have the price in USD, multiply by 600 (example: 850 USD = 510,000 FCFA).',
          noRedundantQuestions: 'Do not ask for information already provided.',
          redirectIfMissing: 'If information is not in the knowledge base, say: "For the exact details, please contact us directly."'
        }
      },
      [AgentLanguage.SPANISH]: {
        styleHeader: '📝 ESTILO DE RESPUESTA:',
        kbHeader: '📚 INFORMACIÓN DE LA BASE DE CONOCIMIENTOS:',
        rulesHeader: 'REGLAS IMPORTANTES:',
        noKbWarning: 'No hay base de conocimientos configurada.',
        fallbackInstruction: 'Si no puede encontrar información específica para responder a la pregunta, responda con este mensaje exacto:',
        absoluteRules: {
          title: 'REGLAS IMPORTANTES:',
          neverInventPrices: 'Nunca invente precios. Si un precio no está en la base de conocimientos, diga "No tengo el precio exacto, contáctenos".',
          useExactInfo: 'Use solo información exacta de la base de conocimientos anterior.',
          fcfaConversion: 'Conversión FCFA: Si el cliente pregunta en FCFA y tiene el precio en USD, multiplique por 600 (ejemplo: 850 USD = 510,000 FCFA).',
          noRedundantQuestions: 'No vuelva a preguntar información ya proporcionada.',
          redirectIfMissing: 'Si la información no está en la base de conocimientos, diga: "Para los detalles exactos, contáctenos directamente."'
        }
      }
    };

    // Default to English if language not found
    return instructions[lang] || instructions[AgentLanguage.ENGLISH];
  }

  /**
   * Build response style instructions based on agent configuration
   */
  private buildResponseStyleInstructions(agent: AiAgent): string {
    const instructions: string[] = [];

    // Tone instructions
    const toneInstructions: Record<AgentTone, string> = {
      [AgentTone.PROFESSIONAL]: "Adopte un ton professionnel et courtois.",
      [AgentTone.FRIENDLY]: "Sois amical et chaleureux dans tes réponses.",
      [AgentTone.CASUAL]: "Utilise un ton décontracté et informel.",
      [AgentTone.FORMAL]: "Maintiens un ton très formel et respectueux.",
      [AgentTone.EMPATHETIC]: "Sois empathique et compréhensif envers le client.",
      [AgentTone.TECHNICAL]: "Utilise un langage technique et précis.",
    };
    instructions.push(toneInstructions[agent.tone] || toneInstructions[AgentTone.PROFESSIONAL]);

    // Response length instructions
    const lengthInstructions: Record<ResponseLength, string> = {
      [ResponseLength.VERY_SHORT]: "IMPORTANT: Tes réponses doivent être TRÈS COURTES (1-2 phrases maximum). Va droit au but.",
      [ResponseLength.SHORT]: "Tes réponses doivent être courtes et concises (2-3 phrases maximum).",
      [ResponseLength.MEDIUM]: "Tes réponses doivent être modérées en longueur (3-5 phrases).",
      [ResponseLength.DETAILED]: "Tu peux donner des réponses détaillées et complètes quand nécessaire.",
    };
    const responseLength = agent.responseLength || ResponseLength.MEDIUM;
    instructions.push(lengthInstructions[responseLength]);

    // Verbosity instructions
    const verbosityInstructions: Record<VerbosityLevel, string> = {
      [VerbosityLevel.MINIMAL]: "Ne donne que l'information essentielle, sans détails supplémentaires.",
      [VerbosityLevel.CONCISE]: "Sois bref mais complet. Évite les répétitions et les formulations longues.",
      [VerbosityLevel.BALANCED]: "Équilibre entre concision et clarté.",
      [VerbosityLevel.VERBOSE]: "Tu peux donner des explications détaillées et des exemples.",
    };
    const verbosity = agent.verbosity || VerbosityLevel.BALANCED;
    instructions.push(verbosityInstructions[verbosity]);

    // Emoji usage
    if (agent.useEmojis) {
      instructions.push("Tu peux utiliser des emojis pour rendre tes réponses plus expressives. 😊");
    } else {
      instructions.push("N'utilise PAS d'emojis dans tes réponses.");
    }

    // Max response characters
    if (agent.maxResponseChars && agent.maxResponseChars > 0) {
      instructions.push(`LIMITE: Tes réponses ne doivent PAS dépasser ${agent.maxResponseChars} caractères.`);
    }

    // Additional config options
    if (agent.config?.avoidRepetition) {
      instructions.push("Évite de répéter les mêmes informations déjà mentionnées dans la conversation.");
    }
    if (agent.config?.useListsWhenAppropriate) {
      instructions.push("Utilise des listes à puces quand c'est approprié pour plus de clarté.");
    }
    if (agent.config?.includeGreetings === false) {
      instructions.push("Ne commence PAS tes réponses par des salutations. Va directement au contenu.");
    }
    if (agent.config?.signOffStyle === "none") {
      instructions.push("Ne termine PAS tes réponses par des formules de politesse.");
    } else if (agent.config?.signOffStyle === "simple") {
      instructions.push("Termine avec une formule simple si approprié.");
    }

    if (instructions.length === 0) {
      return "";
    }

    const i18n = this.getLocalizedInstructions(agent.primaryLanguage);
    return `\n\n${i18n.styleHeader}\n${instructions.map(i => `- ${i}`).join('\n')}`;
  }

  /**
   * Build image instructions for the system prompt
   */
  private buildImageInstructions(availableMedia: Array<{slug: string, title: string, type: string}>): string {
    if (availableMedia.length === 0) {
      return '';
    }

    const imageList = availableMedia
      .filter(m => m.type === 'image')
      .map(m => `  - [IMAGE:${m.slug}] → ${m.title}`)
      .join('\n');

    const videoList = availableMedia
      .filter(m => m.type === 'video')
      .map(m => `  - [VIDEO:${m.slug}] → ${m.title}`)
      .join('\n');

    const audioList = availableMedia
      .filter(m => m.type === 'audio')
      .map(m => `  - [AUDIO:${m.slug}] → ${m.title}`)
      .join('\n');

    const mediaTypes = ['images'];
    if (videoList) mediaTypes.push('vidéos');
    if (audioList) mediaTypes.push('audios');
    const mediaTypesStr = mediaTypes.join('/');

    let instructions = `

📷 ENVOI D'IMAGES/VIDÉOS/AUDIOS:
Tu peux envoyer des ${mediaTypesStr} de la base de connaissances en incluant un tag dans ta réponse.
Le tag sera automatiquement retiré et le média envoyé après ton message.

IMAGES DISPONIBLES:
${imageList || '  (aucune image disponible)'}
${videoList ? `\nVIDÉOS DISPONIBLES:\n${videoList}` : ''}
${audioList ? `\nAUDIOS DISPONIBLES:\n${audioList}` : ''}

EXEMPLE D'UTILISATION:
"Voici notre produit phare ! [IMAGE:box-tv-android]"
→ Le client recevra ton message PUIS le média correspondant.

RÈGLES:
- N'utilise ce tag QUE si c'est pertinent (demande du client, présentation produit)
- Un seul tag par message maximum
- Le tag doit correspondre EXACTEMENT à un slug disponible ci-dessus`;

    return instructions;
  }

  /**
   * Escalate a conversation to a human operator
   */
  private async escalateConversation(
    conversation: AgentConversation,
    agent: AiAgent,
    session: WhatsAppSession,
    fromNumber: string,
    reason: string,
  ): Promise<void> {
    try {
      // Update conversation to human-controlled
      conversation.isHumanControlled = true;
      conversation.escalationReason = reason;
      await this.conversationRepository.save(conversation);

      // Determine escalation message
      const escalationMessage = agent.escalationConfig?.escalationMessage
        || "Your conversation has been transferred to a human agent. Someone will assist you shortly. Thank you for your patience.";

      // Send escalation message to client via WhatsApp
      await this.baileysService.sendMessage(session.id, {
        to: fromNumber,
        message: escalationMessage,
        type: "text",
      });

      // Save system message in conversation
      const lastMessage = await this.messageRepository.findOne({
        where: { conversationId: conversation.id },
        order: { sequenceNumber: "DESC" },
      });
      const nextSequence = (lastMessage?.sequenceNumber || 0) + 1;

      const systemMessage = this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.SYSTEM,
        content: `Conversation escalated to human operator. Reason: ${reason}`,
        status: MessageStatus.SENT,
        sequenceNumber: nextSequence,
        metadata: {
          escalation: true,
          escalationReason: reason,
        } as any,
      });
      await this.messageRepository.save(systemMessage);

      // Save the escalation message sent to client
      const agentEscalationMsg = this.messageRepository.create({
        conversationId: conversation.id,
        role: MessageRole.AGENT,
        content: escalationMessage,
        status: MessageStatus.SENT,
        sequenceNumber: nextSequence + 1,
        metadata: {
          fromWhatsApp: true,
          originalSender: "agent",
          escalationMessage: true,
        } as any,
      });
      await this.messageRepository.save(agentEscalationMsg);

      // Emit escalation event for real-time notification
      this.eventEmitter.emit('conversation.escalated', {
        conversationId: conversation.id,
        agentId: agent.id,
        organizationId: agent.organizationId,
        clientPhoneNumber: fromNumber,
        reason,
        sessionId: session.id,
      });

      this.logger.log(`✅ Conversation ${conversation.id} escalated successfully. Reason: ${reason}`);
    } catch (error) {
      this.logger.error(`❌ Failed to escalate conversation ${conversation.id}: ${error.message}`, error.stack);
    }
  }

  @OnEvent('operator.message.send')
  async handleOperatorMessageSend(payload: {
    sessionId: string;
    clientPhoneNumber: string;
    message: string;
    conversationId: string;
    messageId: string;
    operatorId: string;
  }) {
    try {
      this.logger.log(`Sending operator message to ${payload.clientPhoneNumber} via session ${payload.sessionId}`);

      await this.baileysService.sendMessage(payload.sessionId, {
        to: `${payload.clientPhoneNumber}@s.whatsapp.net`,
        type: 'text',
        message: payload.message,
      });

      // Update message status to delivered
      await this.messageRepository.update(payload.messageId, {
        status: 'delivered' as any,
      });

      this.logger.log(`Operator message sent successfully to ${payload.clientPhoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send operator WhatsApp message: ${error.message}`, error.stack);

      // Update message status to failed
      await this.messageRepository.update(payload.messageId, {
        status: 'failed' as any,
      });
    }
  }
}
