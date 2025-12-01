import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs/promises";
import * as path from "path";

export interface OpenSourceVisionResult {
  description: string;
  extractedText?: string;
  objects?: string[];
  confidence: number;
  provider: 'ollama' | 'tesseract' | 'basic';
}

@Injectable()
export class OpenSourceVisionService {
  private readonly logger = new Logger(OpenSourceVisionService.name);
  private readonly ollamaBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.ollamaBaseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
  }

  /**
   * Analyser une image avec des outils open source
   */
  async analyzeImage(base64Image: string, prompt?: string): Promise<OpenSourceVisionResult> {
    // 1. Essayer Ollama avec modèle vision (LLaVA, etc.)
    try {
      const ollamaResult = await this.analyzeWithOllama(base64Image, prompt);
      if (ollamaResult) {
        return ollamaResult;
      }
    } catch (error) {
      this.logger.warn(`Ollama vision analysis failed: ${error.message}`);
    }

    // 2. Essayer extraction OCR avec analyse basique
    try {
      const ocrResult = await this.analyzeWithOCR(base64Image);
      if (ocrResult && ocrResult.extractedText) {
        return {
          description: `Texte détecté dans l'image: ${ocrResult.extractedText}`,
          extractedText: ocrResult.extractedText,
          confidence: 0.7,
          provider: 'tesseract'
        };
      }
    } catch (error) {
      this.logger.warn(`OCR analysis failed: ${error.message}`);
    }

    // 3. Fallback : analyse basique
    return this.basicImageAnalysis(base64Image, prompt);
  }

  /**
   * Analyser avec Ollama (LLaVA ou autres modèles vision)
   */
  private async analyzeWithOllama(base64Image: string, prompt?: string): Promise<OpenSourceVisionResult | null> {
    try {
      // Vérifier si Ollama est disponible
      const healthResponse = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!healthResponse.ok) {
        throw new Error('Ollama not available');
      }

      const models = await healthResponse.json();
      
      // Chercher un modèle de vision disponible
      const visionModels = ['llava:latest', 'llava:7b', 'llava:13b', 'bakllava:latest', 'moondream:latest'];
      const availableModel = visionModels.find(model => 
        models.models?.some((m: any) => m.name === model)
      );

      if (!availableModel) {
        this.logger.warn('No vision models available in Ollama');
        return null;
      }

      this.logger.log(`Using Ollama vision model: ${availableModel}`);

      const analysisPrompt = prompt || `ANALYSE CETTE IMAGE DE PRODUIT E-COMMERCE:

1. PRODUIT PRINCIPAL:
   - Quel est le produit exactement? (sac, téléphone, vêtement, etc.)
   - Marque visible?
   - Couleur(s) dominante(s)?
   - Caractéristiques visibles?

2. PRIX ET PROMOTION:
   - Prix affiché en FCFA ou autre devise?
   - Y a-t-il une promotion ou réduction?
   - Texte promotionnel visible?

3. TEXTE VISIBLE:
   - Lis TOUT le texte français/anglais visible
   - Numéros de téléphone ou références?
   - Nom du magasin/vendeur?

4. CONTEXTE COMMERCIAL:
   - Est-ce une image de catalogue/promotion?
   - Plusieurs variantes de couleur montrées?
   - Call-to-action visible?

RÉPONDS DE MANIÈRE STRUCTURÉE ET PRÉCISE EN FRANÇAIS. Si tu vois un prix, mentionne-le clairement.`;

      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: availableModel,
          prompt: analysisPrompt,
          images: [base64Image.replace(/^data:image\/[^;]+;base64,/, '')],
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
          }
        }),
        signal: AbortSignal.timeout(30000) // 30 secondes timeout
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const description = data.response || 'Impossible d\'analyser l\'image';

      // Parser la réponse pour extraire des informations structurées
      const result = this.parseOllamaResponse(description);
      
      return {
        description: result.description,
        extractedText: result.extractedText,
        objects: result.objects,
        confidence: 0.8,
        provider: 'ollama'
      };

    } catch (error) {
      this.logger.error(`Ollama vision analysis error: ${error.message}`);
      return null;
    }
  }

  /**
   * Parser la réponse d'Ollama pour extraire des informations structurées
   */
  private parseOllamaResponse(response: string): {
    description: string;
    extractedText?: string;
    objects: string[];
  } {
    const result = {
      description: response,
      extractedText: undefined as string | undefined,
      objects: [] as string[]
    };

    // Extraire le texte mentionné
    const textMatches = response.match(/(?:texte|text|écrit|written)[^:]*:?\s*["']?([^"'\n.]+)/gi);
    if (textMatches && textMatches.length > 0) {
      result.extractedText = textMatches.map(match => 
        match.replace(/^[^:]*:?\s*["']?/, '').replace(/["'].*$/, '')
      ).join(' ');
    }

    // Extraire les objets/produits mentionnés
    const objectKeywords = [
      'sac', 'bag', 'backpack', 'sac à dos',
      'télévision', 'TV', 'écran', 'téléphone', 'phone',
      'ordinateur', 'laptop', 'computer', 'tablette',
      'vêtement', 'clothes', 'chaussure', 'shoes',
      'livre', 'book', 'document', 'carte', 'card',
      'voiture', 'car', 'véhicule', 'vehicle'
    ];

    result.objects = objectKeywords.filter(keyword => 
      response.toLowerCase().includes(keyword.toLowerCase())
    );

    return result;
  }

  /**
   * Analyser avec OCR (Tesseract ou alternative)
   */
  private async analyzeWithOCR(base64Image: string): Promise<{ extractedText: string } | null> {
    try {
      // OCR avec Tesseract.js si disponible
      try {
        const tesseract = require('tesseract.js');
        const { createWorker } = tesseract;
        
        this.logger.log('Starting OCR analysis with Tesseract.js...');
        
        const worker = await createWorker();
        await worker.loadLanguage('fra+eng');
        await worker.initialize('fra+eng');
        
        const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
        const { data: { text } } = await worker.recognize(imageBuffer);
        
        await worker.terminate();
        
        if (text && text.trim().length > 3) { // Au moins 3 caractères
          this.logger.log(`OCR extracted text: ${text.substring(0, 100)}...`);
          return { extractedText: text.trim() };
        }
      } catch (tesseractError) {
        this.logger.warn(`Tesseract.js not available: ${tesseractError.message}`);
      }

      // Fallback: OCR basique avec analyse de patterns
      return this.basicTextExtraction(base64Image);

    } catch (error) {
      this.logger.error(`OCR analysis error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extraction de texte basique (fallback)
   */
  private async basicTextExtraction(base64Image: string): Promise<{ extractedText: string } | null> {
    try {
      // Analyse basique de l'image pour détecter s'il y a probablement du texte
      const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
      
      // Si l'image est petite, c'est probablement pas du texte
      if (imageBuffer.length < 10000) { // < 10KB
        return null;
      }

      // Simulation d'extraction pour les cas évidents
      // Dans une vraie implémentation, on pourrait utiliser d'autres techniques
      this.logger.log('Basic text extraction fallback - analyzing image patterns');
      
      // Pour l'instant, retourner null pour forcer l'utilisation d'autres méthodes
      return null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Analyse basique sans IA (fallback)
   */
  private async basicImageAnalysis(base64Image: string, prompt?: string): Promise<OpenSourceVisionResult> {
    try {
      // Analyser les métadonnées de base de l'image
      const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
      const sizeKB = Math.round(imageBuffer.length / 1024);
      
      let description = `Image reçue (${sizeKB}KB)`;
      let objects: string[] = ['image'];

      // Détecter le type probable basé sur le contexte/prompt
      if (prompt) {
        const promptLower = prompt.toLowerCase();
        
        if (this.isProductContext(promptLower)) {
          description = `Image de produit reçue (${sizeKB}KB). Je ne peux pas voir le contenu exact, mais je peux vous aider avec des questions sur ce produit.`;
          objects = ['produit'];
        } else if (promptLower.includes('document') || promptLower.includes('facture')) {
          description = `Document/facture reçu (${sizeKB}KB). Pour une analyse complète, activez OCR ou utilisez un modèle de vision.`;
          objects = ['document'];
        } else if (promptLower.includes('carte') || promptLower.includes('map')) {
          description = `Carte ou plan reçu (${sizeKB}KB). Je peux vous aider à localiser des informations si vous me donnez plus de détails.`;
          objects = ['carte'];
        }
      }

      return {
        description,
        objects,
        confidence: 0.3,
        provider: 'basic'
      };

    } catch (error) {
      this.logger.error(`Basic image analysis error: ${error.message}`);
      return {
        description: 'Image reçue mais impossible à analyser',
        objects: [],
        confidence: 0.1,
        provider: 'basic'
      };
    }
  }

  /**
   * Détecter si le contexte indique une image de produit
   */
  private isProductContext(context: string): boolean {
    const productIndicators = [
      'produit', 'product', 'prix', 'price', 'coût', 'cost',
      'acheter', 'buy', 'vendre', 'sell', 'disponible', 'available',
      'stock', 'commande', 'order', 'promotion', 'promo',
      'catalogue', 'boutique', 'shop', 'magasin', 'store',
      'fcfa', 'eur', 'usd', '€', '$', 'franc'
    ];

    return productIndicators.some(indicator => context.includes(indicator));
  }

  /**
   * Vérifier si les services de vision open source sont disponibles
   */
  async checkAvailability(): Promise<{
    ollama: boolean;
    tesseract: boolean;
    models: string[];
  }> {
    const result = {
      ollama: false,
      tesseract: false,
      models: [] as string[]
    };

    // Vérifier Ollama
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        result.ollama = true;
        result.models = data.models?.map((m: any) => m.name) || [];
      }
    } catch (error) {
      this.logger.warn(`Ollama not available: ${error.message}`);
    }

    // Vérifier Tesseract (simulation)
    try {
      // Dans une vraie implémentation:
      // const tesseract = require('tesseract.js');
      // result.tesseract = true;
      result.tesseract = false; // Désactivé pour l'instant
    } catch (error) {
      result.tesseract = false;
    }

    return result;
  }

  /**
   * Installer un modèle de vision dans Ollama
   */
  async installVisionModel(modelName: string = 'llava:latest'): Promise<boolean> {
    try {
      this.logger.log(`Installing Ollama vision model: ${modelName}`);

      const response = await fetch(`${this.ollamaBaseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelName,
          stream: false
        }),
        signal: AbortSignal.timeout(300000) // 5 minutes timeout
      });

      return response.ok;

    } catch (error) {
      this.logger.error(`Failed to install vision model ${modelName}: ${error.message}`);
      return false;
    }
  }
}