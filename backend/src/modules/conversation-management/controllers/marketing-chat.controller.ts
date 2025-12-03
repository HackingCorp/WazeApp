import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import { LLMRouterService } from '@/modules/llm-providers/llm-router.service';
import { Logger } from '@nestjs/common';

interface MarketingChatRequest {
  message: string;
  context?: string;
  language?: string;
}

interface MarketingChatResponse {
  success: boolean;
  data: {
    response: string;
    timestamp: string;
    provider: string;
  };
}

@Controller('marketing')
export class MarketingChatController {
  private readonly logger = new Logger(MarketingChatController.name);

  constructor(
    private readonly llmRouterService: LLMRouterService
  ) {
    this.logger.log('🔧 MarketingChatController initialized');
    this.logger.log(`🔧 LLMRouterService injected: ${!!llmRouterService}`);
  }

  @Public()
  @Post('chat')
  async sendMessage(@Body() chatRequest: MarketingChatRequest): Promise<MarketingChatResponse> {
    this.logger.log(`📢 MARKETING CHAT REQUEST RECEIVED: ${chatRequest.message.substring(0, 100)}...`);
    
    try {

      const userLanguage = chatRequest.language || 'en';
      
      // Instructions de langue simplifiées et directes pour Qwen2.5
      const languageMap = {
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
      
      const targetLanguage = languageMap[userLanguage] || 'English';
      
      const systemPrompt = `You are WazeApp's AI assistant. WazeApp transforms WhatsApp into an intelligent AI assistant for businesses.

CRITICAL RULES:
1. Respond ONLY in ${targetLanguage}. Do not use any other language.
2. NO MARKDOWN FORMATTING - Do NOT use asterisks (*), underscores (_), or any markdown. Plain text only.
3. Keep responses short (2-3 sentences max).

Your role: WhatsApp automation expert, professional yet friendly.

PRICING (use these exact values):
- FREE: 0 FCFA/month - 100 messages/month, 1 agent
- STANDARD: 5,000 FCFA/month - 2,000 messages/month, 3 agents
- PRO: 15,000 FCFA/month - 8,000 messages/month, 10 agents
- ENTERPRISE: 45,000 FCFA/month - 30,000 messages/month, unlimited agents

KEY FEATURES:
- Complete WhatsApp conversation automation
- Support for 95+ languages with automatic translation
- Ultra-fast setup in just 30 seconds
- Native integrations with CRM, helpdesk and business tools
- Maximum security - GDPR compliance and end-to-end encryption
- Advanced analytics and real-time performance metrics

RESPONSE STYLE:
- Concise (2-3 sentences)
- Use emojis sparingly
- Ask questions to engage conversation
- Guide towards free trial when appropriate

Respond naturally to:`;

      // Use LLM Router Service which handles Ollama as primary provider
      const requestData = {
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: chatRequest.message }
        ],
        temperature: 0.7,
        maxTokens: 500,
        organizationId: null, // Marketing chat doesn't require organization
      };
      
      this.logger.log(`Calling LLM Router with: ${JSON.stringify(requestData)}`);
      const response = await this.llmRouterService.generateResponse(requestData);

      this.logger.log(`Marketing chat response generated successfully`);

      return {
        success: true,
        data: {
          response: this.stripMarkdown(response.content),
          timestamp: new Date().toISOString(),
          provider: response.model || 'ollama-direct'
        }
      };

    } catch (error) {
      this.logger.error(`❌ MARKETING CHAT ERROR: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      this.logger.error(`Error name: ${error.name}`);
      this.logger.error(`Full error: ${JSON.stringify(error, null, 2)}`);

      // Fallback intelligent avec langue adaptée
      const userLanguage = chatRequest.language || 'en';
      const fallbackResponses = this.getFallbackResponse(chatRequest.message, userLanguage);
      
      return {
        success: true,
        data: {
          response: fallbackResponses,
          timestamp: new Date().toISOString(),
          provider: 'fallback'
        }
      };
    }
  }

  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
      .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
      .replace(/__([^_]+)__/g, '$1')       // Remove __bold__
      .replace(/_([^_]+)_/g, '$1')         // Remove _italic_
      .replace(/`([^`]+)`/g, '$1')         // Remove `code`
      .replace(/```[\s\S]*?```/g, '')      // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links [text](url) -> text
      .replace(/#{1,6}\s/g, '')            // Remove headers
      .replace(/>\s/g, '')                 // Remove blockquotes
      .replace(/\n\s*[-*+]\s/g, '\n')      // Remove list markers
      .trim();
  }

  private getFallbackResponse(message: string, language: string = 'fr'): string {
    const lowerMessage = message.toLowerCase();
    
    // Détection du contexte de la question
    const isGreeting = lowerMessage.includes('salut') || lowerMessage.includes('hello') || lowerMessage.includes('bonjour') || lowerMessage.includes('hi');
    const isPricing = lowerMessage.includes('prix') || lowerMessage.includes('price') || lowerMessage.includes('coût') || lowerMessage.includes('tarif') || lowerMessage.includes('plan') || lowerMessage.includes('cost');
    const isHowTo = lowerMessage.includes('comment') || lowerMessage.includes('how') || lowerMessage.includes('marche') || lowerMessage.includes('fonctionne') || lowerMessage.includes('work');
    const isFeatures = lowerMessage.includes('feature') || lowerMessage.includes('fonctionnalité') || lowerMessage.includes('peut faire') || lowerMessage.includes('capable') || lowerMessage.includes('can do');
    const isSecurity = lowerMessage.includes('sécurit') || lowerMessage.includes('security') || lowerMessage.includes('données') || lowerMessage.includes('data') || lowerMessage.includes('rgpd') || lowerMessage.includes('gdpr');

    // Réponses multilingues
    const responses = {
      fr: {
        greeting: "Salut ! 👋 Je suis l'IA de WazeApp. Je peux vous expliquer comment transformer votre WhatsApp en assistant IA puissant qui automatise vos conversations client 24/7. Que souhaitez-vous savoir ?",
        pricing: "Excellente question ! 💰 WazeApp propose un plan GRATUIT (100 messages/mois), puis STANDARD à 5,000 FCFA/mois (2,000 messages), PRO à 15,000 FCFA/mois (8,000 messages). Voulez-vous essayer gratuitement ?",
        howto: "C'est très simple ! ⚡ 1) Connectez votre WhatsApp (30 sec) 2) Configurez votre IA avec vos infos business 3) Votre assistant automatise tout ! Il répond aux clients, prend des RDV, gère le SAV... Envie d'essayer gratuitement ?",
        features: "WazeApp c'est magique ! 🚀 Votre IA peut : répondre en 95+ langues, s'intégrer à vos outils (CRM, calendrier...), analyser les sentiments, créer des rapports... Plus jamais de messages perdus ! Quelle fonctionnalité vous intéresse le plus ?",
        security: "La sécurité est notre priorité ! 🛡️ Chiffrement bout-en-bout, conformité RGPD totale, vos données restent privées. Nous ne lisons jamais vos conversations. Audit de sécurité disponible pour les entreprises. Rassuré(e) ?",
        default: "Excellente question ! 🤔 WazeApp transforme WhatsApp en assistant IA complet pour automatiser votre communication client. Que vous cherchiez à améliorer votre SAV, augmenter vos ventes ou optimiser vos RDV, on a la solution ! Sur quoi puis-je vous éclairer précisément ?"
      },
      en: {
        greeting: "Hi there! 👋 I'm WazeApp's AI assistant. I can explain how to transform your WhatsApp into a powerful AI assistant that automates your customer conversations 24/7. What would you like to know?",
        pricing: "Great question! 💰 WazeApp offers a FREE plan (100 messages/month), then STANDARD at 5,000 FCFA/month (2,000 messages), PRO at 15,000 FCFA/month (8,000 messages). Want to try it for free?",
        howto: "It's super simple! ⚡ 1) Connect your WhatsApp (30 sec) 2) Configure your AI with your business info 3) Your assistant automates everything! It answers customers, books appointments, handles support... Want to try for free?",
        features: "WazeApp is amazing! 🚀 Your AI can: respond in 95+ languages, integrate with your tools (CRM, calendar...), analyze sentiment, create reports... Never miss a message again! Which feature interests you most?",
        security: "Security is our priority! 🛡️ End-to-end encryption, full GDPR compliance, your data stays private. We never read your conversations. Security audit available for enterprises. Feeling confident?",
        default: "Great question! 🤔 WazeApp transforms WhatsApp into a complete AI assistant to automate your customer communication. Whether you want to improve support, boost sales or optimize appointments, we have the solution! What can I clarify for you?"
      },
      es: {
        greeting: "¡Hola! 👋 Soy el asistente IA de WazeApp. Puedo explicarte cómo transformar tu WhatsApp en un asistente IA potente que automatiza tus conversaciones con clientes 24/7. ¿Qué te gustaría saber?",
        pricing: "¡Excelente pregunta! 💰 WazeApp ofrece un plan GRATIS (100 mensajes/mes), luego STANDARD a 5,000 FCFA/mes (2,000 mensajes), PRO a 15,000 FCFA/mes (8,000 mensajes). ¿Quieres probarlo gratis?",
        howto: "¡Es súper simple! ⚡ 1) Conecta tu WhatsApp (30 seg) 2) Configura tu IA con tu info empresarial 3) ¡Tu asistente automatiza todo! Responde clientes, agenda citas, maneja soporte... ¿Quieres probar gratis?",
        features: "¡WazeApp es increíble! 🚀 Tu IA puede: responder en 95+ idiomas, integrarse con tus herramientas (CRM, calendario...), analizar sentimientos, crear reportes... ¡Nunca más perderás un mensaje! ¿Qué función te interesa más?",
        security: "¡La seguridad es nuestra prioridad! 🛡️ Cifrado punto a punto, cumplimiento RGPD completo, tus datos permanecen privados. Nunca leemos tus conversaciones. Auditoría de seguridad disponible para empresas. ¿Te sientes seguro?",
        default: "¡Excelente pregunta! 🤔 WazeApp transforma WhatsApp en un asistente IA completo para automatizar tu comunicación con clientes. Ya sea que quieras mejorar soporte, aumentar ventas u optimizar citas, ¡tenemos la solución! ¿Qué puedo aclarar?"
      }
    };

    const langResponses = responses[language] || responses['en'];
    
    if (isGreeting) return langResponses.greeting;
    if (isPricing) return langResponses.pricing;
    if (isHowTo) return langResponses.howto;
    if (isFeatures) return langResponses.features;
    if (isSecurity) return langResponses.security;
    
    return langResponses.default;
  }
}