import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
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
} from "@/common/enums";
import { LLMRouterService } from "../llm-providers/llm-router.service";
import { BaileysService } from "./baileys.service";
import { WebSearchService } from "./web-search.service";
import { MediaAnalysisService } from "./media-analysis.service";

interface WhatsAppMessageEvent {
  sessionId: string;
  message: any;
  type: string;
}

@Injectable()
export class WhatsAppAIResponderService {
  private readonly logger = new Logger(WhatsAppAIResponderService.name);
  private readonly processingMessages = new Set<string>();

  // Fonction simple de détection de langue basée sur des mots-clés
  private detectLanguage(text: string): string {
    const lowerText = text.toLowerCase();
    
    // Mots-clés par langue
    const languageKeywords = {
      'fr': ['bonjour', 'bonsoir', 'salut', 'merci', 'oui', 'non', 'comment', 'quoi', 'où', 'quand', 'pourquoi', 'je', 'tu', 'nous', 'vous', 'ça', 'avec', 'pour', 'sur', 'dans', 'de', 'le', 'la', 'les', 'un', 'une', 'des', 'qui', 'est', 'être', 'avoir', 'faire', 'dire', 'aller'],
      'en': ['hello', 'hi', 'thank', 'yes', 'no', 'how', 'what', 'where', 'when', 'why', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
      'es': ['hola', 'gracias', 'sí', 'si', 'no', 'cómo', 'como', 'qué', 'que', 'dónde', 'donde', 'cuándo', 'cuando', 'por', 'para', 'con', 'en', 'de', 'el', 'la', 'los', 'las', 'un', 'una'],
      'de': ['hallo', 'danke', 'ja', 'nein', 'wie', 'was', 'wo', 'wann', 'warum', 'ich', 'du', 'wir', 'sie', 'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'mit', 'für'],
      'it': ['ciao', 'grazie', 'sì', 'si', 'no', 'come', 'cosa', 'dove', 'quando', 'perché', 'perche', 'io', 'tu', 'noi', 'voi', 'il', 'la', 'gli', 'le', 'un', 'una', 'con', 'per'],
      'pt': ['olá', 'ola', 'obrigado', 'sim', 'não', 'nao', 'como', 'que', 'onde', 'quando', 'por', 'para', 'com', 'em', 'de', 'o', 'a', 'os', 'as', 'um', 'uma'],
      'ar': ['السلام', 'مرحبا', 'شكرا', 'نعم', 'لا', 'كيف', 'ماذا', 'أين', 'متى', 'لماذا', 'في', 'على', 'من', 'إلى', 'هذا', 'هذه', 'التي', 'الذي'],
      'zh': ['你好', '谢谢', '是', '不是', '什么', '怎么', '哪里', '什么时候', '为什么', '的', '在', '和', '或者', '但是', '这', '那', '一个', '我', '你', '他', '她'],
      'ja': ['こんにちは', 'ありがとう', 'はい', 'いいえ', 'どう', '何', 'なに', 'どこ', 'いつ', 'なぜ', 'です', 'である', 'この', 'その', 'あの', 'が', 'を', 'に', 'で', 'と']
    };

    const scores = {};
    
    // Calculer le score pour chaque langue
    Object.keys(languageKeywords).forEach(lang => {
      scores[lang] = 0;
      languageKeywords[lang].forEach(keyword => {
        if (lowerText.includes(keyword)) {
          scores[lang] += keyword.length; // Les mots plus longs ont plus de poids
        }
      });
    });

    // Retourner la langue avec le meilleur score
    const bestLang = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    
    // Si aucune langue n'a de score, utiliser l'anglais par défaut
    return scores[bestLang] > 0 ? bestLang : 'en';
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
    private llmRouterService: LLMRouterService,
    private baileysService: BaileysService,
    private webSearchService: WebSearchService,
    private mediaAnalysisService: MediaAnalysisService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    console.log('🔧 WhatsAppAIResponderService: Service initialized and ready to receive events');
    this.logger.log('WhatsAppAIResponderService initialized');
    
    // Écoute manuelle des événements WhatsApp
    this.eventEmitter.on('whatsapp.message.received', (data) => {
      console.log('🎯 MANUAL LISTENER: Event received!', data);
      this.handleIncomingMessage(data).catch(error => {
        console.error('Error in manual event handler:', error);
      });
    });
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
      systemPrompt: `Tu es un assistant IA spécialisé pour ${organization?.name || "cette organisation"} qui répond aux messages WhatsApp.

INSTRUCTIONS CRITIQUES:
- Réponds UNIQUEMENT avec ta réponse finale dans la langue du client
- Ne montre JAMAIS ton processus de réflexion ou d'analyse
- N'utilise JAMAIS de phrases comme "Laisse-moi analyser", "Je vois que", "D'après", "En regardant", etc.
- Ne traduis PAS les messages du client ni n'expliques ce qu'il a dit
- Réponds directement et utilement

RÈGLES DE RÉPONSE:
- Détecte automatiquement la langue du client (français, anglais, espagnol, etc.)
- Réponds dans la même langue que le client utilise
- Sois utile, précis et informatif
- Utilise un ton amical et professionnel
- Si tu ne connais pas une information, propose des alternatives

GESTION DES MÉDIAS:
- Quand un client envoie une IMAGE, tu peux voir le contenu et y faire référence
- Si c'est une image de produit, aide avec les questions sur ce produit
- Si c'est une image générale, commente ce que tu vois de manière utile
- Quand un client envoie un LIEN FACEBOOK/E-COMMERCE, tu peux voir les métadonnées produit
- Quand un client envoie une VIDÉO de produit, aide avec des questions sur ce produit
- Quand un client envoie un DOCUMENT, tu peux voir le contenu si lisible
- RÉAGIS naturellement aux médias comme si tu les voyais vraiment

GESTION DES DEMANDES D'ACHAT:
- Si le client dit "Je voudrais acheter ce produit" après avoir partagé un lien/image
- Confirme le produit qu'il veut acheter en étant spécifique
- Demande les détails nécessaires (couleur, taille, quantité si applicable)
- Propose d'aider pour la commande ou le contact du vendeur
- Sois proactif pour faciliter la transaction

BASE DE CONNAISSANCES:
- Tu as accès à une base de connaissances spécifique à cette organisation
- Utilise cette base de connaissances pour enrichir tes réponses quand c'est pertinent
- Si la question concerne les produits/services, utilise les informations disponibles

EXEMPLES DE BONNES RÉPONSES:
Client: "Quel produit vendez vous?"
Toi: "Nous vendons des Box TV Android pour le streaming. Ces appareils permettent de regarder vos contenus préférés en haute définition."

Client: [envoie un lien Facebook E-Market avec sac à dos 8000 FCFA]
Toi: "Je vois ce sac à dos E-Market en promotion à 8000 FCFA ! C'est un excellent modèle pour enfants, très solide avec plusieurs compartiments. Il est disponible en plusieurs couleurs (bleu, rouge, rose). Souhaitez-vous passer commande ?"

Client: "Je voudrais acheter ce produit"
Toi: "Parfait ! Je confirme que vous souhaitez acheter le sac à dos E-Market à 8000 FCFA. Quelle couleur préférez-vous ? Et avez-vous besoin des coordonnées du vendeur (Ydc: 673226374, Dia: 673209196) ?"

MAUVAIS EXEMPLE (à éviter):
"Alright, let me figure out what's going on. The user just said 'Quel produit vendez vous' which means..."

Réponds toujours directement et dans la langue du client.`,
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
          `Using agent's knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
        );
      } else if (session.knowledgeBase) {
        // Fallback: base de connaissances directement associée à la session (legacy)
        knowledgeBase = session.knowledgeBase;
        this.logger.log(
          `Using session's direct knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
        );
      } else {
        // Fallback: chercher par organisation
        knowledgeBase = await this.knowledgeBaseRepository.findOne({
          where: { organizationId: session.organizationId },
          relations: ["documents"],
        });
        if (knowledgeBase) {
          this.logger.log(
            `Using organization's default knowledge base: ${knowledgeBase.name} (${knowledgeBase.id})`,
          );
        }
      }

      if (!knowledgeBase) {
        this.logger.debug(`No knowledge base found for session ${session.id}`);
        return "";
      }

      this.logger.log(
        `Searching knowledge base ${knowledgeBase.id} for: "${userMessage}"`,
      );

      // Recherche simple par mots-clés dans les documents
      const searchTerms = userMessage
        .toLowerCase()
        .split(" ")
        .filter((term) => term.length > 2); // Ignorer les mots de moins de 3 caractères

      const documents = await this.knowledgeDocumentRepository
        .createQueryBuilder("doc")
        .where("doc.knowledgeBaseId = :kbId", { kbId: knowledgeBase.id })
        .andWhere("doc.status = :status", { status: "processed" })
        .andWhere(
          searchTerms
            .map(
              (_, index) =>
                `(LOWER(doc.content) LIKE :term${index} OR LOWER(doc.title) LIKE :term${index})`,
            )
            .join(" OR "),
          Object.fromEntries(
            searchTerms.map((term, index) => [`term${index}`, `%${term}%`]),
          ),
        )
        .orderBy("doc.createdAt", "DESC")
        .limit(3)
        .getMany();

      if (documents.length === 0) {
        this.logger.debug(
          `No relevant documents found in knowledge base ${knowledgeBase.id}`,
        );
        return "";
      }

      // Construire le contexte à partir des documents trouvés
      const contextParts = documents.map((doc) => {
        // Extraire un extrait pertinent du contenu
        const content = doc.content || "";
        const excerpt = this.extractRelevantExcerpt(content, searchTerms, 200);

        return `**${doc.title}**:\n${excerpt}`;
      });

      const context = `INFORMATIONS DE LA BASE DE CONNAISSANCES:\n\n${contextParts.join("\n\n---\n\n")}`;

      this.logger.log(
        `Found ${documents.length} relevant documents in knowledge base`,
      );
      return context;
    } catch (error) {
      this.logger.error(`Error searching knowledge base: ${error.message}`);
      return "";
    }
  }

  private extractRelevantExcerpt(
    content: string,
    searchTerms: string[],
    maxLength: number,
  ): string {
    if (!content) return "";

    // Chercher la première occurrence d'un terme de recherche
    const lowerContent = content.toLowerCase();
    let bestPosition = -1;

    for (const term of searchTerms) {
      const position = lowerContent.indexOf(term.toLowerCase());
      if (position !== -1 && (bestPosition === -1 || position < bestPosition)) {
        bestPosition = position;
      }
    }

    if (bestPosition === -1) {
      // Aucun terme trouvé, prendre le début
      return (
        content.substring(0, maxLength) +
        (content.length > maxLength ? "..." : "")
      );
    }

    // Extraire autour de la position trouvée
    const start = Math.max(0, bestPosition - maxLength / 2);
    const end = Math.min(content.length, start + maxLength);

    let excerpt = content.substring(start, end);

    // Ajouter des points de suspension si nécessaire
    if (start > 0) excerpt = "..." + excerpt;
    if (end < content.length) excerpt = excerpt + "...";

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

      // Get conversation history (last 10 messages)
      const recentMessages = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        order: { createdAt: "DESC" },
        take: 10,
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
        systemPrompt += `\n\n${knowledgeContext}\n\nUtilise ces informations pour enrichir ta réponse si elles sont pertinentes à la question.`;
      }
      if (webContext) {
        systemPrompt += `\n\n${webContext}`;
      }

      // Create a simple context for the LLM Router
      const messages = [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        ...recentMessages.slice(-5).map((msg) => ({
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

      // Ajouter instruction de langue spécifique au début des messages
      const languageInstruction = {
        role: "system" as const,
        content: `CRITICAL: You MUST respond ONLY in ${languageNames[detectedLanguage] || 'English'}. The user is writing in ${languageNames[detectedLanguage] || 'English'}, so respond in the same language.`
      };

      const enhancedMessages = [languageInstruction, ...messages];

      // Use LLM router directly with enhanced parameters for better quality
      const response = await this.llmRouterService.generateResponse({
        messages: enhancedMessages,
        temperature: agent.config.temperature || 0.6,
        maxTokens: agent.config.maxTokens || 300,
        topP: 0.9, // For better response diversity
        frequencyPenalty: 0.1, // Reduce repetition
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
        await this.baileysService.sendMessage(session.id, {
          to: fromNumber,
          message: response.content,
          type: "text",
        });

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
      
      this.logger.log(`Knowledge base media sent to ${fromNumber}: ${mediaDocument.title}`);

    } catch (error) {
      this.logger.error(`Failed to send knowledge base media: ${error.message}`);
      throw error;
    }
  }
}
