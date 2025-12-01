import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
// import { Mistral } from '@mistralai/mistralai'; // TODO: Install package
import { VectorEmbeddingService } from "./vector-embedding.service";
import { LLMRouterService } from "../../llm-providers/llm-router.service";
import {
  AiAgent,
  AgentMessage,
  AgentConversation,
  ConversationContext,
  KnowledgeBase,
  DocumentChunk,
  LlmProvider,
} from "../../../common/entities";
import {
  MessageRole,
  AgentLanguage,
  ProviderType,
  KnowledgeBaseStatus,
} from "../../../common/enums";

export interface ResponseGenerationRequest {
  conversationId: string;
  agentId: string;
  userMessage: string;
  context: ConversationContext;
  conversationHistory: AgentMessage[];
  mediaAnalysis?: string;
  priority?: "low" | "normal" | "high";
}

export interface RAGContext {
  relevantChunks: DocumentChunk[];
  knowledgeBases: KnowledgeBase[];
  contextScore: number;
  sources: string[];
}

export interface GeneratedResponse {
  content: string;
  confidence: number;
  sources?: string[];
  metadata: {
    model: string;
    tokensUsed: number;
    processingTimeMs: number;
    ragUsed: boolean;
    sentimentTone: string;
    language: string;
    fallbackUsed?: boolean;
  };
}

@Injectable()
export class ResponseGenerationService {
  private readonly logger = new Logger(ResponseGenerationService.name);
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private mistral?: any; // TODO: Replace with proper Mistral type
  private deepseekBaseUrl: string;

  constructor(
    @InjectRepository(AiAgent)
    private agentRepository: Repository<AiAgent>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(ConversationContext)
    private contextRepository: Repository<ConversationContext>,
    @InjectRepository(KnowledgeBase)
    private knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(DocumentChunk)
    private chunkRepository: Repository<DocumentChunk>,
    @InjectRepository(LlmProvider)
    private llmProviderRepository: Repository<LlmProvider>,
    private vectorEmbeddingService: VectorEmbeddingService,
    private httpService: HttpService,
    private configService: ConfigService,
    private llmRouterService: LLMRouterService,
  ) {
    this.initializeLLMProviders();
  }

  /**
   * Initialize LLM provider SDKs
   */
  private initializeLLMProviders(): void {
    // Initialize OpenAI
    const openaiApiKey = this.configService.get("OPENAI_API_KEY");
    if (openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: openaiApiKey,
        organization: this.configService.get("OPENAI_ORGANIZATION"),
      });
      this.logger.log("OpenAI client initialized");
    }

    // Initialize Anthropic Claude
    const anthropicApiKey = this.configService.get("ANTHROPIC_API_KEY");
    if (anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: anthropicApiKey,
      });
      this.logger.log("Anthropic client initialized");
    }

    // Initialize Mistral
    const mistralApiKey = this.configService.get("MISTRAL_API_KEY");
    if (mistralApiKey) {
      // this.mistral = new MistralApi(mistralApiKey); // TODO: Install Mistral package
      this.logger.log("Mistral client initialized");
    }

    // Initialize DeepSeek
    this.deepseekBaseUrl = this.configService.get(
      "DEEPSEEK_BASE_URL",
      "https://api.deepseek.com",
    );
    const deepseekApiKey = this.configService.get("DEEPSEEK_API_KEY");
    if (deepseekApiKey) {
      this.logger.log("DeepSeek configuration loaded");
    }
  }

  /**
   * Generate response using RAG pipeline
   */
  async generateResponse(
    request: ResponseGenerationRequest,
  ): Promise<GeneratedResponse> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Generating response for conversation: ${request.conversationId}`,
      );

      // Get agent configuration
      const agent = await this.agentRepository.findOne({
        where: { id: request.agentId },
        relations: ["knowledgeBases", "llmProvider"],
      });

      if (!agent) {
        throw new Error(`Agent not found: ${request.agentId}`);
      }

      // Retrieve relevant context using RAG
      const ragContext = await this.retrieveRelevantContext(
        request.userMessage,
        agent,
        request.context,
      );

      // Analyze conversation sentiment
      const sentiment = this.analyzeSentiment(
        request.userMessage,
        request.conversationHistory,
      );

      // Generate response based on context and agent configuration
      let response: GeneratedResponse;

      if (ragContext.relevantChunks.length > 0) {
        // Generate RAG-enhanced response
        response = await this.generateRAGResponse(
          request,
          agent,
          ragContext,
          sentiment,
        );
      } else {
        // Generate conversation-only response
        response = await this.generateConversationalResponse(
          request,
          agent,
          sentiment,
        );
      }

      // Post-process response
      response = await this.postProcessResponse(
        response,
        agent,
        request.context,
      );

      response.metadata.processingTimeMs = Date.now() - startTime;

      this.logger.log(
        `Response generated in ${response.metadata.processingTimeMs}ms`,
      );
      return response;
    } catch (error) {
      this.logger.error(
        `Response generation failed: ${error.message}`,
        error.stack,
      );

      // Generate fallback response
      return this.generateFallbackResponse(request, Date.now() - startTime);
    }
  }

  /**
   * Retrieve relevant context using vector search and knowledge bases
   */
  private async retrieveRelevantContext(
    userMessage: string,
    agent: AiAgent,
    context: ConversationContext,
  ): Promise<RAGContext> {
    this.logger.debug("Retrieving relevant context for RAG");

    const relevantChunks: DocumentChunk[] = [];
    const knowledgeBases: KnowledgeBase[] = [];
    const sources: string[] = [];

    // Get agent's knowledge bases
    // TODO: Fix knowledge base query - need proper relation
    const agentKnowledgeBases = await this.knowledgeBaseRepository.find({
      where: {
        status: KnowledgeBaseStatus.ACTIVE,
      },
    });

    for (const kb of agentKnowledgeBases) {
      knowledgeBases.push(kb);

      // Search for relevant chunks in this knowledge base
      const chunks = await this.searchKnowledgeBase(
        userMessage,
        kb.id,
        5,
        agent.organizationId,
      );
      relevantChunks.push(...chunks);

      if (chunks.length > 0) {
        sources.push(kb.name);
      }
    }

    // Calculate context relevance score
    const contextScore = this.calculateContextRelevance(
      userMessage,
      relevantChunks,
    );

    return {
      relevantChunks: relevantChunks.slice(0, 10), // Limit to top 10 chunks
      knowledgeBases,
      contextScore,
      sources: [...new Set(sources)],
    };
  }

  /**
   * Search knowledge base for relevant chunks using vector similarity
   */
  private async searchKnowledgeBase(
    query: string,
    knowledgeBaseId: string,
    limit: number,
    organizationId: string,
  ): Promise<DocumentChunk[]> {
    try {
      // Use vector search for better semantic matching
      const vectorResults =
        await this.vectorEmbeddingService.searchSimilarChunks({
          query,
          knowledgeBaseIds: [knowledgeBaseId],
          organizationId,
          limit,
          scoreThreshold: 0.7, // Minimum similarity threshold
        });

      return vectorResults.map((result) => result.chunk);
    } catch (error) {
      this.logger.warn(
        `Vector search failed, falling back to text search: ${error.message}`,
      );

      // Fallback to simple text search if vector search fails
      const chunks = await this.chunkRepository
        .createQueryBuilder("chunk")
        .innerJoin("chunk.document", "document")
        .where("document.knowledgeBaseId = :knowledgeBaseId", {
          knowledgeBaseId,
        })
        .andWhere("chunk.content ILIKE :query", { query: `%${query}%` })
        .orderBy("chunk.characterCount", "DESC")
        .limit(limit)
        .getMany();

      return chunks;
    }
  }

  /**
   * Calculate context relevance score
   */
  private calculateContextRelevance(
    userMessage: string,
    chunks: DocumentChunk[],
  ): number {
    if (chunks.length === 0) return 0;

    // Simple relevance scoring based on keyword overlap
    const userWords = userMessage.toLowerCase().split(/\s+/);
    let totalScore = 0;

    for (const chunk of chunks) {
      const chunkWords = chunk.content.toLowerCase().split(/\s+/);
      const overlap = userWords.filter((word) =>
        chunkWords.includes(word),
      ).length;
      const score = overlap / userWords.length;
      totalScore += score;
    }

    return totalScore / chunks.length;
  }

  /**
   * Generate RAG-enhanced response
   */
  private async generateRAGResponse(
    request: ResponseGenerationRequest,
    agent: AiAgent,
    ragContext: RAGContext,
    sentiment: any,
  ): Promise<GeneratedResponse> {
    this.logger.debug("Generating RAG-enhanced response");

    // Build context from retrieved chunks
    const contextText = ragContext.relevantChunks
      .map((chunk) => chunk.content)
      .join("\n\n");

    // Build conversation history
    const conversationHistory = this.buildConversationHistory(
      request.conversationHistory,
      5, // Last 5 messages
    );

    // Create system prompt with RAG context
    const systemPrompt = this.buildRAGSystemPrompt(
      agent,
      contextText,
      ragContext.sources,
      request.context,
      sentiment,
    );

    // Generate response using LLM
    const llmResponse = await this.callLLM({
      systemPrompt,
      conversationHistory,
      userMessage: request.userMessage,
      agent,
      temperature: this.getTemperatureForSentiment(sentiment.tone),
    });

    return {
      content: llmResponse.content,
      confidence: this.calculateConfidence(
        llmResponse,
        ragContext.contextScore,
      ),
      sources: ragContext.sources,
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        processingTimeMs: 0, // Will be set by caller
        ragUsed: true,
        sentimentTone: sentiment.tone,
        language: request.context.detectedLanguage,
      },
    };
  }

  /**
   * Generate conversational response without RAG
   */
  private async generateConversationalResponse(
    request: ResponseGenerationRequest,
    agent: AiAgent,
    sentiment: any,
  ): Promise<GeneratedResponse> {
    this.logger.debug("Generating conversational response");

    const conversationHistory = this.buildConversationHistory(
      request.conversationHistory,
      8, // More history when no RAG context
    );

    const systemPrompt = this.buildConversationalSystemPrompt(
      agent,
      request.context,
      sentiment,
    );

    const llmResponse = await this.callLLM({
      systemPrompt,
      conversationHistory,
      userMessage: request.userMessage,
      agent,
      temperature: this.getTemperatureForSentiment(sentiment.tone),
    });

    return {
      content: llmResponse.content,
      confidence: this.calculateConfidence(llmResponse, 0.5), // Lower confidence without RAG
      metadata: {
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        processingTimeMs: 0,
        ragUsed: false,
        sentimentTone: sentiment.tone,
        language: request.context.detectedLanguage,
      },
    };
  }

  /**
   * Generate fallback response
   */
  private generateFallbackResponse(
    request: ResponseGenerationRequest,
    processingTime: number,
  ): GeneratedResponse {
    const fallbackResponses = {
      [AgentLanguage.ENGLISH]: [
        "I apologize, but I'm having trouble processing your request right now. Could you please try rephrasing your question?",
        "I'm experiencing some technical difficulties. Please try again in a moment, or contact support if the issue persists.",
        "I want to make sure I give you the best answer possible. Could you provide a bit more detail about what you're looking for?",
      ],
      [AgentLanguage.FRENCH]: [
        "Je m'excuse, mais j'ai des difficultés à traiter votre demande en ce moment. Pourriez-vous reformuler votre question ?",
        "Je rencontre quelques difficultés techniques. Veuillez réessayer dans un moment ou contacter le support si le problème persiste.",
      ],
      [AgentLanguage.SPANISH]: [
        "Disculpe, pero tengo problemas para procesar su solicitud ahora mismo. ¿Podría reformular su pregunta?",
        "Estoy experimentando algunas dificultades técnicas. Inténtelo de nuevo en un momento o contacte al soporte si el problema persiste.",
      ],
      [AgentLanguage.ARABIC]: [
        "أعتذر، ولكنني أواجه صعوبة في معالجة طلبك الآن. هل يمكنك إعادة صياغة سؤالك؟",
        "أواجه بعض الصعوبات التقنية. يرجى المحاولة مرة أخرى بعد قليل أو الاتصال بالدعم إذا استمرت المشكلة.",
      ],
    };

    const language =
      (request.context.detectedLanguage as AgentLanguage) ||
      AgentLanguage.ENGLISH;
    const responses =
      fallbackResponses[language] || fallbackResponses[AgentLanguage.ENGLISH];
    const selectedResponse =
      responses[Math.floor(Math.random() * responses.length)];

    return {
      content: selectedResponse,
      confidence: 0.3, // Low confidence for fallback
      metadata: {
        model: "fallback",
        tokensUsed: 0,
        processingTimeMs: processingTime,
        ragUsed: false,
        sentimentTone: "neutral",
        language,
        fallbackUsed: true,
      },
    };
  }

  /**
   * Post-process response
   */
  private async postProcessResponse(
    response: GeneratedResponse,
    agent: AiAgent,
    context: ConversationContext,
  ): Promise<GeneratedResponse> {
    // Adjust tone based on agent configuration
    if (agent.tone) {
      response.content = this.adjustTone(response.content, agent.tone);
    }

    // Add personalization if user profile exists
    if (context.sessionData?.userProfile?.name) {
      response.content = this.personalizeResponse(
        response.content,
        context.sessionData.userProfile,
      );
    }

    // Ensure response length is appropriate
    response.content = this.limitResponseLength(response.content, 1000);

    return response;
  }

  /**
   * Build RAG system prompt
   */
  private buildRAGSystemPrompt(
    agent: AiAgent,
    contextText: string,
    sources: string[],
    context: ConversationContext,
    sentiment: any,
  ): string {
    return `You are ${agent.name}, ${agent.description}

CONTEXT INFORMATION:
${contextText}

SOURCES: ${sources.join(", ")}

INSTRUCTIONS:
- Use the provided context information to answer questions accurately
- If the context doesn't contain relevant information, acknowledge this
- Maintain a ${agent.tone} tone
- Respond in ${context.detectedLanguage}
- Current user sentiment: ${sentiment.tone}
- ${sentiment.tone === "negative" ? "Be extra empathetic and helpful" : ""}
- Always cite your sources when using context information

AGENT INSTRUCTIONS:
${agent.systemPrompt || "Be helpful, accurate, and professional."}`;
  }

  /**
   * Build conversational system prompt
   */
  private buildConversationalSystemPrompt(
    agent: AiAgent,
    context: ConversationContext,
    sentiment: any,
  ): string {
    return `You are ${agent.name}, ${agent.description}

INSTRUCTIONS:
- Maintain a ${agent.tone} tone
- Respond in ${context.detectedLanguage}
- Current user sentiment: ${sentiment.tone}
- ${sentiment.tone === "negative" ? "Be extra empathetic and helpful" : ""}
- If you don't know something, be honest about it
- Keep responses helpful and engaging

AGENT INSTRUCTIONS:
${agent.systemPrompt || "Be helpful, accurate, and professional."}`;
  }

  /**
   * Build conversation history string
   */
  private buildConversationHistory(
    messages: AgentMessage[],
    limit: number,
  ): string {
    return messages
      .slice(-limit)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Call LLM API using the unified router service
   */
  private async callLLM(params: {
    systemPrompt: string;
    conversationHistory: string;
    userMessage: string;
    agent: AiAgent;
    temperature: number;
  }): Promise<{
    content: string;
    model: string;
    tokensUsed: number;
  }> {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: params.systemPrompt }];

    // Add conversation history
    if (params.conversationHistory) {
      const historyLines = params.conversationHistory.split("\n");
      for (const line of historyLines) {
        if (line.startsWith("user:")) {
          messages.push({ role: "user", content: line.replace("user: ", "") });
        } else if (line.startsWith("agent:") || line.startsWith("assistant:")) {
          messages.push({
            role: "assistant",
            content: line.replace(/^(agent|assistant): /, ""),
          });
        }
      }
    }

    // Add current user message
    messages.push({ role: "user", content: params.userMessage });

    try {
      // Use the LLM router service for unified provider management
      const response = await this.llmRouterService.generateResponse({
        messages,
        temperature: params.temperature,
        maxTokens: 2000,
        organizationId: params.agent.organizationId,
        agentId: params.agent.id,
        priority: "normal",
      });

      return {
        content: response.content,
        model: response.model,
        tokensUsed: response.usage.totalTokens,
      };
    } catch (error) {
      this.logger.error(
        `LLM Router call failed: ${error.message}`,
        error.stack,
      );

      // If the router fails, try a fallback response
      return {
        content: this.getFallbackMessage(params.agent),
        model: "fallback",
        tokensUsed: 0,
      };
    }
  }

  /**
   * Get fallback message when LLM calls fail
   */
  private getFallbackMessage(agent: AiAgent): string {
    const fallbackMessages = {
      [AgentLanguage.ENGLISH]:
        "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
      [AgentLanguage.FRENCH]:
        "Je m'excuse, mais j'ai des difficultés à traiter votre demande en ce moment. Veuillez réessayer dans un moment.",
      [AgentLanguage.SPANISH]:
        "Me disculpo, pero tengo problemas para procesar su solicitud en este momento. Por favor, inténtelo de nuevo en un momento.",
      [AgentLanguage.ARABIC]:
        "أعتذر، لكنني أواجه مشكلة في معالجة طلبك الآن. يرجى المحاولة مرة أخرى بعد قليل.",
    };

    return fallbackMessages[AgentLanguage.ENGLISH]; // Fallback to English by default
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    messages: Array<{ role: string; content: string }>,
    provider: LlmProvider,
    temperature: number,
  ): Promise<{ content: string; model: string; tokensUsed: number }> {
    if (!this.openai) {
      throw new Error("OpenAI client not initialized");
    }

    const response = await this.openai.chat.completions.create({
      model: provider.config.model || "gpt-3.5-turbo",
      messages: messages as any,
      temperature,
      max_tokens: provider.config.maxTokens || 1000,
      presence_penalty: provider.config.presencePenalty || 0,
      frequency_penalty: provider.config.frequencyPenalty || 0,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error("Empty response from OpenAI");
    }

    return {
      content: choice.message.content,
      model: response.model,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(
    messages: Array<{ role: string; content: string }>,
    provider: LlmProvider,
    temperature: number,
  ): Promise<{ content: string; model: string; tokensUsed: number }> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized");
    }

    // Anthropic requires system message to be separate
    const systemMessage =
      messages.find((m) => m.role === "system")?.content || "";
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const response = await this.anthropic.messages.create({
      model: provider.config.model || "claude-3-haiku-20240307",
      system: systemMessage,
      messages: conversationMessages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
      temperature,
      max_tokens: provider.config.maxTokens || 1000,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Anthropic");
    }

    return {
      content: content.text,
      model: response.model,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  /**
   * Call Mistral AI API
   */
  private async callMistral(
    messages: Array<{ role: string; content: string }>,
    provider: LlmProvider,
    temperature: number,
  ): Promise<{ content: string; model: string; tokensUsed: number }> {
    if (!this.mistral) {
      throw new Error("Mistral client not initialized");
    }

    const response = await this.mistral.chat({
      model: provider.config.model || "mistral-small-latest",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature,
      max_tokens: provider.config.maxTokens || 1000,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error("Empty response from Mistral");
    }

    return {
      content: choice.message.content,
      model: response.model || provider.config.model || "mistral-small-latest",
      tokensUsed: response.usage?.total_tokens || 0,
    };
  }

  /**
   * Call DeepSeek API (OpenAI-compatible)
   */
  private async callDeepSeek(
    messages: Array<{ role: string; content: string }>,
    provider: LlmProvider,
    temperature: number,
  ): Promise<{ content: string; model: string; tokensUsed: number }> {
    const deepseekApiKey = this.configService.get("DEEPSEEK_API_KEY");
    if (!deepseekApiKey) {
      throw new Error("DeepSeek API key not configured");
    }

    const payload = {
      model: provider.config.model || "deepseek-chat",
      messages,
      temperature,
      max_tokens: provider.config.maxTokens || 1000,
      stream: false,
    };

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.deepseekBaseUrl}/v1/chat/completions`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${deepseekApiKey}`,
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const choice = response.data.choices[0];
    if (!choice?.message?.content) {
      throw new Error("Empty response from DeepSeek");
    }

    return {
      content: choice.message.content,
      model: response.data.model,
      tokensUsed: response.data.usage?.total_tokens || 0,
    };
  }

  /**
   * Analyze conversation sentiment
   */
  private analyzeSentiment(
    userMessage: string,
    conversationHistory: AgentMessage[],
  ): { tone: string; confidence: number } {
    // Simple sentiment analysis - replace with ML model
    const positiveWords = [
      "good",
      "great",
      "excellent",
      "happy",
      "love",
      "amazing",
      "perfect",
    ];
    const negativeWords = [
      "bad",
      "terrible",
      "hate",
      "awful",
      "horrible",
      "worst",
      "angry",
    ];

    const allText = [
      userMessage,
      ...conversationHistory.slice(-3).map((m) => m.content),
    ]
      .join(" ")
      .toLowerCase();

    const positiveCount = positiveWords.reduce(
      (count, word) => count + (allText.split(word).length - 1),
      0,
    );
    const negativeCount = negativeWords.reduce(
      (count, word) => count + (allText.split(word).length - 1),
      0,
    );

    if (positiveCount > negativeCount) {
      return { tone: "positive", confidence: 0.7 };
    } else if (negativeCount > positiveCount) {
      return { tone: "negative", confidence: 0.7 };
    }

    return { tone: "neutral", confidence: 0.5 };
  }

  /**
   * Get temperature based on sentiment
   */
  private getTemperatureForSentiment(sentiment: string): number {
    const temperatures = {
      positive: 0.7,
      neutral: 0.6,
      negative: 0.4, // More conservative for negative sentiment
    };
    return temperatures[sentiment] || 0.6;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    llmResponse: { content: string; tokensUsed: number },
    ragScore: number,
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence with RAG context
    confidence += ragScore * 0.3;

    // Consider response length (longer responses might be more confident)
    const lengthBoost = Math.min(llmResponse.content.length / 1000, 0.2);
    confidence += lengthBoost;

    return Math.min(confidence, 1.0);
  }

  /**
   * Adjust tone of response
   */
  private adjustTone(content: string, tone: string): string {
    // Simple tone adjustment - in production use more sophisticated methods
    switch (tone) {
      case "friendly":
        if (!content.includes("!") && Math.random() > 0.5) {
          content += " 😊";
        }
        break;
      case "professional":
        content = content.replace(/!+/g, ".");
        break;
      case "casual":
        content = content.replace(/\./g, "!");
        break;
    }

    return content;
  }

  /**
   * Personalize response with user profile
   */
  private personalizeResponse(
    content: string,
    userProfile: { name?: string; [key: string]: any },
  ): string {
    if (userProfile.name && !content.includes(userProfile.name)) {
      // Add name occasionally for personalization
      if (Math.random() > 0.7) {
        content = `${userProfile.name}, ${content.charAt(0).toLowerCase()}${content.slice(1)}`;
      }
    }

    return content;
  }

  /**
   * Limit response length
   */
  private limitResponseLength(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find last sentence within limit
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf(".");

    if (lastPeriod > maxLength * 0.7) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated.substring(0, maxLength - 3) + "...";
  }

  /**
   * Summarize conversation history for context
   */
  async summarizeConversationHistory(
    conversationId: string,
    maxMessages: number = 20,
  ): Promise<string> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: "DESC" },
      take: maxMessages,
    });

    if (messages.length === 0) {
      return "New conversation started.";
    }

    // Group messages by topic/intent
    const topics = new Set<string>();
    const intents = new Set<string>();
    let lastUserMessage = "";
    let lastAgentMessage = "";

    for (const message of messages.reverse()) {
      if (message.role === MessageRole.USER) {
        lastUserMessage = message.content;
        // Extract topics (simplified)
        const messageTopics = this.extractTopics(message.content);
        messageTopics.forEach((topic) => topics.add(topic));
      } else if (message.role === MessageRole.AGENT) {
        lastAgentMessage = message.content;
      }
    }

    const summary = [
      `Conversation summary (${messages.length} messages):`,
      topics.size > 0
        ? `Topics discussed: ${Array.from(topics).join(", ")}`
        : "",
      lastUserMessage
        ? `Last user message: ${lastUserMessage.substring(0, 100)}...`
        : "",
      lastAgentMessage
        ? `Last agent response: ${lastAgentMessage.substring(0, 100)}...`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return summary;
  }

  /**
   * Extract topics from message (simplified)
   */
  private extractTopics(message: string): string[] {
    const topics = [];
    const lowerMessage = message.toLowerCase();

    // Simple keyword-based topic extraction
    const topicKeywords = {
      pricing: ["price", "cost", "payment", "fee", "expensive", "cheap"],
      support: ["help", "support", "problem", "issue", "trouble"],
      product: ["product", "service", "feature", "functionality"],
      account: ["account", "profile", "login", "password", "user"],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((keyword) => lowerMessage.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }
}
