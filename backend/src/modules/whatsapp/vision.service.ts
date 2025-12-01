import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenSourceVisionService } from "./open-source-vision.service";

export interface VisionAnalysisResult {
  description: string;
  objects: string[];
  text?: string;
  products?: {
    name: string;
    price?: string;
    description: string;
  }[];
  confidence: number;
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly openaiApiKey: string;

  constructor(
    private configService: ConfigService,
    private openSourceVisionService: OpenSourceVisionService,
  ) {
    this.openaiApiKey = this.configService.get('OPENAI_API_KEY') || '';
  }

  /**
   * Analyser une image avec priorité aux solutions open source
   */
  async analyzeImageWithGPT4Vision(
    base64Image: string,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    // 1. D'abord essayer les solutions open source (gratuit)
    try {
      this.logger.log('Trying open source vision analysis first...');
      const openSourceResult = await this.openSourceVisionService.analyzeImage(base64Image, prompt);
      
      if (openSourceResult && openSourceResult.confidence > 0.5) {
        this.logger.log(`Open source vision success with ${openSourceResult.provider} (confidence: ${openSourceResult.confidence})`);
        return {
          description: openSourceResult.description,
          objects: openSourceResult.objects || [],
          text: openSourceResult.extractedText,
          confidence: openSourceResult.confidence,
        };
      }
    } catch (error) {
      this.logger.warn(`Open source vision failed: ${error.message}`);
    }

    // 2. Fallback vers OpenAI GPT-4 Vision (payant)
    if (!this.openaiApiKey) {
      this.logger.warn('OpenAI API key not configured, using basic fallback analysis');
      return this.fallbackImageAnalysis(base64Image, prompt);
    }

    try {
      const analysisPrompt = prompt || `Analyse cette image en détail. Si c'est une image de produit ou catalogue:
- Identifie le produit principal
- Extrait le prix s'il est visible
- Décrit les caractéristiques visibles
- Identifie la marque si visible

Si c'est une image générale:
- Décris ce que tu vois
- Identifie les objets principaux
- Lis tout texte visible

Réponds en français et sois précis.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: analysisPrompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const analysisText = data.choices[0]?.message?.content || 'Impossible d\'analyser l\'image';

      // Parse la réponse pour extraire les informations structurées
      const result = this.parseVisionResponse(analysisText);
      result.confidence = 0.8; // High confidence avec GPT-4V

      this.logger.log(`GPT-4V analysis completed: ${analysisText.substring(0, 100)}...`);
      return result;

    } catch (error) {
      this.logger.error(`GPT-4V analysis failed: ${error.message}`);
      // 3. Dernier fallback : analyse basique
      return this.fallbackImageAnalysis(base64Image, prompt);
    }
  }

  /**
   * Analyser une image avec un service de vision local/fallback
   */
  private async fallbackImageAnalysis(
    base64Image: string,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    // Pour l'instant, analyse basique basée sur la taille et format
    try {
      const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
      const sizeKB = Math.round(imageBuffer.length / 1024);

      let description = `Image reçue (${sizeKB}KB)`;
      
      // Détecter si c'est probablement une image de produit basé sur le prompt/contexte
      if (prompt && this.isLikelyProductImage(prompt)) {
        description = `Image de produit reçue. Je ne peux pas voir le contenu exact de l'image, mais je peux vous aider avec des questions sur ce produit.`;
        
        return {
          description,
          objects: ['produit'],
          products: [{
            name: 'Produit visible dans l\'image',
            description: 'Détails du produit à partir de l\'image'
          }],
          confidence: 0.3,
        };
      }

      return {
        description,
        objects: ['image'],
        confidence: 0.2,
      };

    } catch (error) {
      this.logger.error(`Fallback image analysis failed: ${error.message}`);
      return {
        description: 'Image reçue mais impossible à analyser',
        objects: [],
        confidence: 0.1,
      };
    }
  }

  /**
   * Parser la réponse GPT-4V pour extraire les informations structurées
   */
  private parseVisionResponse(analysisText: string): VisionAnalysisResult {
    const result: VisionAnalysisResult = {
      description: analysisText,
      objects: [],
      products: [],
      confidence: 0.8,
    };

    // Extraire les prix mentionnés
    const priceRegex = /(\d+[\d\s,]*)\s*(FCFA|F|€|EUR|\$|USD|francs?)/gi;
    const priceMatches = analysisText.match(priceRegex);
    
    if (priceMatches && priceMatches.length > 0) {
      result.products = [{
        name: 'Produit identifié dans l\'image',
        price: priceMatches[0],
        description: analysisText.substring(0, 200) + '...',
      }];
    }

    // Extraire les objets mentionnés (mots-clés courants)
    const objectKeywords = [
      'sac', 'bag', 'backpack', 'sac à dos',
      'télévision', 'TV', 'écran', 'téléphone',
      'ordinateur', 'laptop', 'tablette',
      'vêtement', 'chaussure', 'accessoire',
      'livre', 'document', 'carte'
    ];

    result.objects = objectKeywords.filter(keyword => 
      analysisText.toLowerCase().includes(keyword.toLowerCase())
    );

    return result;
  }

  /**
   * Vérifier si c'est probablement une image de produit
   */
  private isLikelyProductImage(context: string): boolean {
    const productIndicators = [
      'prix', 'coût', 'vendre', 'acheter', 'produit',
      'disponible', 'stock', 'commande', 'promotion',
      'FCFA', '€', '$', 'EUR', 'USD',
      'catalogue', 'boutique', 'magasin'
    ];

    return productIndicators.some(indicator =>
      context.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Analyser du texte dans une image (OCR basique)
   */
  async extractTextFromImage(base64Image: string): Promise<string> {
    // Pour une implémentation complète, intégrer avec Google Vision OCR ou Tesseract
    // Pour l'instant, utiliser GPT-4V si disponible
    
    if (!this.openaiApiKey) {
      return '';
    }

    try {
      const result = await this.analyzeImageWithGPT4Vision(
        base64Image,
        'Extrait uniquement tout le texte visible dans cette image. Retourne seulement le texte, sans commentaires.'
      );

      return result.text || '';

    } catch (error) {
      this.logger.error(`Text extraction failed: ${error.message}`);
      return '';
    }
  }

  /**
   * Vérifier si les services de vision sont configurés
   */
  isVisionServiceAvailable(): boolean {
    return !!this.openaiApiKey;
  }

  /**
   * Obtenir le statut des services de vision disponibles
   */
  async getVisionServicesStatus(): Promise<{
    openai: boolean;
    ollama: boolean;
    tesseract: boolean;
    models: string[];
    recommended: string;
  }> {
    const openSourceStatus = await this.openSourceVisionService.checkAvailability();
    
    const status = {
      openai: !!this.openaiApiKey,
      ollama: openSourceStatus.ollama,
      tesseract: openSourceStatus.tesseract,
      models: openSourceStatus.models,
      recommended: 'basic'
    };

    // Déterminer la recommandation
    if (status.ollama && openSourceStatus.models.some(m => m.includes('llava'))) {
      status.recommended = 'ollama-llava';
    } else if (status.openai) {
      status.recommended = 'openai-gpt4v';
    } else if (status.tesseract) {
      status.recommended = 'tesseract-ocr';
    }

    return status;
  }

  /**
   * Installer un modèle de vision Ollama
   */
  async installOllamaVisionModel(modelName: string = 'llava:latest'): Promise<boolean> {
    return this.openSourceVisionService.installVisionModel(modelName);
  }
}