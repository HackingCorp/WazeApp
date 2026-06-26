import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs/promises";
import * as path from "path";
import { WebSearchService } from "./web-search.service";
import { VisionService } from "./vision.service";
import { AudioTranscriptionService } from "./audio-transcription.service";

// Baileys v7 requires dynamic imports (ESM)
let downloadMediaMessage: any;

async function loadBaileysMedia() {
  const baileys = await import("@whiskeysockets/baileys");
  downloadMediaMessage = baileys.downloadMediaMessage;
}

export interface MediaAnalysisResult {
  type: 'image' | 'document' | 'audio' | 'video' | 'link';
  description: string;
  extractedText?: string;
  metadata?: any;
  url?: string;
  filename?: string;
}

@Injectable()
export class MediaAnalysisService implements OnModuleInit {
  private readonly logger = new Logger(MediaAnalysisService.name);

  constructor(
    private configService: ConfigService,
    private webSearchService: WebSearchService,
    private visionService: VisionService,
    private audioTranscriptionService: AudioTranscriptionService,
  ) {}

  async onModuleInit() {
    await loadBaileysMedia();
    this.logger.log("Baileys media module loaded");
  }

  /**
   * Analyse une image envoyée par l'utilisateur
   */
  async analyzeImage(
    imageBuffer: Buffer, 
    caption?: string,
    mimetype?: string
  ): Promise<MediaAnalysisResult> {
    try {
      // Convertir l'image en base64 pour l'analyse
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${mimetype || 'image/jpeg'};base64,${base64Image}`;

      // Utiliser le service de vision pour analyser l'image
      let description = "Image reçue";
      let extractedText = caption || "";
      
      try {
        // Utiliser GPT-4 Vision si disponible
        if (this.visionService.isVisionServiceAvailable()) {
          this.logger.log('Using GPT-4 Vision for image analysis');
          
          const visionResult = await this.visionService.analyzeImageWithGPT4Vision(
            dataUrl,
            caption ? `Analyse cette image. Contexte fourni par l'utilisateur: "${caption}"` : undefined
          );
          
          description = visionResult.description;
          
          // Si des produits sont détectés, enrichir la description
          if (visionResult.products && visionResult.products.length > 0) {
            const product = visionResult.products[0];
            description += `\n\n📦 Produit identifié: ${product.name}`;
            if (product.price) {
              description += `\n💰 Prix: ${product.price}`;
            }
          }
          
        } else {
          // Fallback: analyse basique
          if (caption) {
            description += ` avec légende: "${caption}"`;
          }

          // Analyser le type de produit si c'est une image de catalogue
          if (caption && this.isProductImage(caption)) {
            description = await this.analyzeProductImage(caption, dataUrl);
          }
        }
        
      } catch (error) {
        this.logger.warn(`Vision analysis failed, using fallback: ${error.message}`);
        if (caption) {
          description += ` avec légende: "${caption}"`;
        }
      }

      return {
        type: 'image',
        description,
        extractedText,
        metadata: {
          size: imageBuffer.length,
          mimetype: mimetype || 'image/jpeg',
          hasCaption: !!caption,
        }
      };

    } catch (error) {
      this.logger.error(`Error analyzing image: ${error.message}`);
      return {
        type: 'image',
        description: "Image reçue mais impossible à analyser",
        extractedText: caption || "",
      };
    }
  }

  /**
   * Analyse un document (PDF, DOC, etc.)
   */
  async analyzeDocument(
    documentBuffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<MediaAnalysisResult> {
    try {
      let extractedText = "";
      let description = `Document reçu: ${filename}`;

      // Skip text extraction if buffer is empty (download failed)
      if (documentBuffer.length === 0) {
        description = `Document reçu: ${filename} (contenu non téléchargé)`;
        return {
          type: 'document',
          description,
          extractedText: "",
          filename,
          metadata: { size: 0, mimetype },
        };
      }

      // Extraire le texte selon le type de document
      if (mimetype === 'application/pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(documentBuffer);
          extractedText = pdfData.text || "";
          description = `Document PDF: ${filename} (${pdfData.numpages} pages, ${extractedText.length} caractères extraits)`;
          this.logger.log(`PDF text extracted: ${extractedText.length} chars from ${filename}`);
        } catch (pdfError) {
          this.logger.warn(`PDF text extraction failed: ${pdfError.message}`);
          description = `Document PDF reçu: ${filename} (extraction de texte échouée)`;
        }
      } else if (mimetype.includes('text/')) {
        // Fichier texte simple
        extractedText = documentBuffer.toString('utf-8');
        description = `Fichier texte reçu: ${filename}`;
      } else if (mimetype.includes('word') || mimetype.includes('docx') || mimetype.includes('officedocument')) {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer: documentBuffer });
          extractedText = result.value || "";
          description = `Document Word: ${filename} (${extractedText.length} caractères extraits)`;
        } catch (docError) {
          this.logger.warn(`DOCX text extraction failed: ${docError.message}`);
          description = `Document Word reçu: ${filename}`;
        }
      } else {
        description = `Document reçu: ${filename} (${mimetype})`;
      }

      return {
        type: 'document',
        description,
        extractedText,
        filename,
        metadata: {
          size: documentBuffer.length,
          mimetype,
        }
      };

    } catch (error) {
      this.logger.error(`Error analyzing document: ${error.message}`);
      return {
        type: 'document',
        description: `Document reçu: ${filename} (impossible à analyser)`,
        filename,
      };
    }
  }

  /**
   * Analyse un lien envoyé dans un message - Généraliste pour tous types de liens
   */
  async analyzeLink(text: string): Promise<MediaAnalysisResult | null> {
    try {
      // Détecter les URLs dans le texte (amélioré pour capturer plus de formats)
      const urlRegex = /(https?:\/\/[^\s\[\]<>()]+)/g;
      const urls = text.match(urlRegex);

      if (!urls || urls.length === 0) {
        return null;
      }

      const url = urls[0]; // Prendre le premier lien trouvé
      
      // Extraire les métadonnées du lien
      const metadata = await this.extractLinkMetadata(url);

      // Analyser le domaine et le contenu pour détecter le type
      const domain = new URL(url).hostname.toLowerCase();
      const analysisResult = this.analyzeLinkType(domain, metadata);

      return {
        type: 'link',
        description: analysisResult.description,
        extractedText: metadata.description || analysisResult.summary || "",
        url,
        metadata: {
          title: metadata.title,
          description: metadata.description,
          image: metadata.image,
          siteName: metadata.siteName,
          price: metadata.price,
          domain: domain,
          category: analysisResult.category,
          confidence: analysisResult.confidence,
          // Drapeaux génériques pour tous types de sites
          isSocialMedia: analysisResult.isSocialMedia,
          isEcommerce: analysisResult.isEcommerce,
          isMarketplace: analysisResult.isMarketplace,
          hasProduct: analysisResult.hasProduct,
          // Drapeaux spécifiques
          isFacebook: domain.includes('facebook.com'),
          isInstagram: domain.includes('instagram.com'),
          isWhatsApp: domain.includes('whatsapp.com'),
          isYouTube: domain.includes('youtube.com') || domain.includes('youtu.be'),
          isTwitter: domain.includes('twitter.com') || domain.includes('x.com'),
          isTikTok: domain.includes('tiktok.com'),
          isShopify: domain.includes('shopify') || metadata.siteName?.toLowerCase().includes('shopify'),
          isWordPress: domain.includes('wordpress') || metadata.siteName?.toLowerCase().includes('wordpress'),
        }
      };

    } catch (error) {
      this.logger.error(`Error analyzing link: ${error.message}`);
      return {
        type: 'link',
        description: "Lien partagé",
        url: text.match(/(https?:\/\/[^\s\[\]<>()]+)/)?.[0] || text,
        metadata: { domain: 'unknown', category: 'unknown', confidence: 0.1 }
      };
    }
  }

  /**
   * Analyser le type de lien et générer une description appropriée
   */
  private analyzeLinkType(domain: string, metadata: any): {
    description: string;
    category: string;
    confidence: number;
    summary?: string;
    isSocialMedia: boolean;
    isEcommerce: boolean;
    isMarketplace: boolean;
    hasProduct: boolean;
  } {
    const title = metadata.title || '';
    const description = metadata.description || '';
    const price = metadata.price;
    const siteName = metadata.siteName || '';
    
    // Mots-clés pour détecter le contexte e-commerce/produit
    const ecommerceKeywords = [
      'acheter', 'buy', 'prix', 'price', 'vendre', 'sell', 'boutique', 'shop', 'store', 'magasin',
      'commande', 'order', 'panier', 'cart', 'checkout', 'produit', 'product', 'article', 'item',
      'promo', 'promotion', 'discount', 'solde', 'offre', 'deal', 'catalogue', 'fcfa', 'eur', 'usd',
      'livraison', 'delivery', 'shipping', 'stock', 'disponible', 'available', 'rupture'
    ];

    const contentText = `${title} ${description} ${siteName}`.toLowerCase();
    const hasEcommerceKeywords = ecommerceKeywords.some(keyword => 
      contentText.includes(keyword.toLowerCase())
    );

    // Analyse par domaine avec logique généraliste
    if (domain.includes('facebook.com')) {
      // Si Facebook est bloqué et on n'a pas de métadonnées
      if (metadata.blocked || (!title && !description)) {
        return {
          description: `Lien Facebook partagé (contenu non accessible automatiquement)`,
          category: 'social-blocked',
          confidence: 0.6,
          summary: 'Lien Facebook nécessitant une interaction humaine pour l\'analyse',
          isSocialMedia: true,
          isEcommerce: true,  // Assumer potentiellement commercial
          isMarketplace: true, // Les liens Facebook partagés sont souvent E-Market
          hasProduct: true    // Assumer qu'il peut y avoir un produit
        };
      }
      
      const hasMarketplace = contentText.includes('marketplace') || contentText.includes('e-market') || 
                            title.toLowerCase().includes('vendre') || title.toLowerCase().includes('à vendre');
      return {
        description: hasMarketplace || price ? 
          `Annonce Facebook Marketplace: ${title || 'Produit'}${price ? ` - ${price}` : ''}` :
          `Publication Facebook: ${title || 'Contenu partagé'}`,
        category: hasMarketplace ? 'marketplace' : 'social',
        confidence: 0.9,
        summary: hasMarketplace ? 'Annonce de vente sur Facebook' : 'Contenu Facebook',
        isSocialMedia: true,
        isEcommerce: hasMarketplace || !!price,
        isMarketplace: hasMarketplace,
        hasProduct: hasMarketplace || hasEcommerceKeywords || !!price
      };
    }

    if (domain.includes('instagram.com')) {
      return {
        description: hasEcommerceKeywords || price ?
          `Produit Instagram: ${title || 'Publication'}${price ? ` - ${price}` : ''}` :
          `Publication Instagram: ${title || 'Contenu'}`,
        category: hasEcommerceKeywords ? 'social-commerce' : 'social',
        confidence: 0.85,
        isSocialMedia: true,
        isEcommerce: hasEcommerceKeywords || !!price,
        isMarketplace: false,
        hasProduct: hasEcommerceKeywords || !!price
      };
    }

    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      return {
        description: `Vidéo YouTube: ${title || 'Vidéo'}${hasEcommerceKeywords ? ' (Présentation produit)' : ''}`,
        category: hasEcommerceKeywords ? 'video-commerce' : 'video',
        confidence: 0.9,
        isSocialMedia: true,
        isEcommerce: hasEcommerceKeywords,
        isMarketplace: false,
        hasProduct: hasEcommerceKeywords
      };
    }

    // Sites e-commerce connus
    const ecommerceDomains = ['amazon', 'ebay', 'shopify', 'woocommerce', 'prestashop', 'magento', 'jumia', 'aliexpress', 'alibaba'];
    const isKnownEcommerce = ecommerceDomains.some(ecommerce => domain.includes(ecommerce));
    
    if (isKnownEcommerce || price || hasEcommerceKeywords) {
      return {
        description: `Produit en ligne: ${title || 'Article'}${price ? ` - ${price}` : ''}`,
        category: 'ecommerce',
        confidence: isKnownEcommerce ? 0.95 : (price ? 0.8 : 0.6),
        summary: `Site de vente ${siteName || domain}`,
        isSocialMedia: false,
        isEcommerce: true,
        isMarketplace: domain.includes('marketplace') || domain.includes('ebay') || domain.includes('jumia'),
        hasProduct: true
      };
    }

    // Sites de news/blog
    const newsDomains = ['news', 'blog', 'article', 'journal', 'magazine', 'media'];
    const isNews = newsDomains.some(news => domain.includes(news)) || 
                   title.toLowerCase().includes('actualité') || 
                   title.toLowerCase().includes('news');

    if (isNews) {
      return {
        description: `Article: ${title || 'Contenu informatif'}`,
        category: 'news',
        confidence: 0.7,
        summary: description ? description.substring(0, 100) + '...' : 'Article d\'actualité',
        isSocialMedia: false,
        isEcommerce: false,
        isMarketplace: false,
        hasProduct: false
      };
    }

    // Lien générique - analyser le contenu
    if (title) {
      return {
        description: `Lien partagé: ${title}${price ? ` - ${price}` : ''}`,
        category: price || hasEcommerceKeywords ? 'commerce' : 'general',
        confidence: 0.5,
        summary: description || `Contenu de ${siteName || domain}`,
        isSocialMedia: false,
        isEcommerce: price || hasEcommerceKeywords,
        isMarketplace: false,
        hasProduct: price || hasEcommerceKeywords
      };
    }

    // Fallback
    return {
      description: `Lien partagé: ${domain}`,
      category: 'unknown',
      confidence: 0.3,
      isSocialMedia: false,
      isEcommerce: false,
      isMarketplace: false,
      hasProduct: false
    };
  }

  /**
   * Extraire les métadonnées d'un lien (titre, description, image)
   */
  private async extractLinkMetadata(url: string): Promise<{
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    price?: string;
    blocked?: boolean;
    error?: string;
  }> {
    try {
      // Headers plus réalistes pour éviter le blocage
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: AbortSignal.timeout(10000) // 10 secondes timeout
      });

      if (!response.ok) {
        const statusCode = response.status;
        this.logger.warn(`HTTP ${statusCode} for ${url}`);
        
        // Facebook et autres réseaux sociaux bloquent souvent les bots
        const domain = new URL(url).hostname.toLowerCase();
        if ((domain.includes('facebook.com') || domain.includes('instagram.com')) && (statusCode === 403 || statusCode === 401)) {
          return { 
            blocked: true, 
            error: `${domain} bloque l'accès aux métadonnées`,
            title: undefined, 
            description: undefined 
          };
        }
        
        return { error: `HTTP ${statusCode}` };
      }

      const html = await response.text();
      
      // Vérifier si c'est une page Facebook bloquée ou de connexion
      if (html.includes('facebook.com/login') || html.includes('You must log in') || html.length < 1000) {
        return { 
          blocked: true, 
          error: 'Facebook requiert une connexion pour voir le contenu',
          title: undefined, 
          description: undefined 
        };
      }
      
      // Extraire le titre (meta og:title en priorité, puis title)
      const ogTitleMatch = html.match(/<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"']+)["\'][^>]*>/i);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = ogTitleMatch ? ogTitleMatch[1].trim() : (titleMatch ? titleMatch[1].trim() : undefined);

      // Extraire la description (meta og:description en priorité)
      const ogDescMatch = html.match(/<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"']+)["\'][^>]*>/i);
      const descMatch = html.match(/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"']+)["\'][^>]*>/i);
      const description = ogDescMatch ? ogDescMatch[1].trim() : (descMatch ? descMatch[1].trim() : undefined);

      // Extraire l'image (meta og:image)
      const imageMatch = html.match(/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"']+)["\'][^>]*>/i);
      const image = imageMatch ? imageMatch[1].trim() : undefined;

      // Extraire le nom du site
      const siteNameMatch = html.match(/<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"']+)["\'][^>]*>/i);
      const siteName = siteNameMatch ? siteNameMatch[1].trim() : undefined;

      // Extraire le prix si présent (amélioré pour FCFA)
      const pricePatterns = [
        /(\d+[\d\s,]*(?:\.\d+)?)\s*(FCFA|FRC|F\b)/gi,  // FCFA patterns en priorité
        /(\d+[\d\s,]*(?:\.\d+)?)\s*(€|EUR|\$|USD|francs?)/gi  // Autres devises
      ];
      
      let price = undefined;
      for (const pattern of pricePatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          price = matches[0];
          break; // Prendre le premier prix trouvé
        }
      }

      this.logger.log(`Extracted metadata from ${url}: title="${title?.substring(0, 50)}...", hasImage=${!!image}, price=${price}`);

      return { title, description, image, siteName, price };

    } catch (error) {
      this.logger.warn(`Failed to extract link metadata for ${url}: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Vérifier si c'est une image de produit
   */
  private isProductImage(caption: string): boolean {
    return this.isProductContext(caption);
  }

  /**
   * Détecter si le contexte indique un produit
   */
  private isProductContext(context: string): boolean {
    const productIndicators = [
      'produit', 'product', 'prix', 'price', 'coût', 'cost',
      'acheter', 'buy', 'vendre', 'sell', 'disponible', 'available',
      'stock', 'commande', 'order', 'promotion', 'promo',
      'catalogue', 'boutique', 'shop', 'magasin', 'store',
      'fcfa', 'frc', 'eur', 'usd', '€', '$', 'franc',
      'sac', 'tv', 'téléphone', 'phone', 'ordinateur', 'computer',
      'vêtement', 'chaussure', 'accessoire', 'électronique'
    ];

    return productIndicators.some(indicator => 
      context.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Analyser une image de produit avec IA
   */
  private async analyzeProductImage(caption: string, dataUrl: string): Promise<string> {
    try {
      // Pour l'instant, analyser seulement la légende
      // TODO: Intégrer avec GPT-4 Vision pour analyser l'image réelle
      // Note: dataUrl sera utilisé quand GPT-4 Vision sera implémenté
      
      let analysis = `Image de produit reçue avec la description: "${caption}"\n\n`;
      
      // Extraire les informations du prix
      const priceMatch = caption.match(/(\d+[\d\s,]*)\s*(FCFA|F|€|EUR|\$|USD)/i);
      if (priceMatch) {
        analysis += `Prix identifié: ${priceMatch[1]} ${priceMatch[2]}\n`;
      }

      // Extraire le type de produit
      if (caption.toLowerCase().includes('sac')) {
        analysis += `Type de produit: Sac/Bagagerie\n`;
      } else if (caption.toLowerCase().includes('tv') || caption.toLowerCase().includes('télé')) {
        analysis += `Type de produit: Télévision/Électronique\n`;
      }

      analysis += "\nJe peux vous aider avec des questions sur ce produit ou vous orienter vers d'autres options similaires.";
      
      return analysis;

    } catch (error) {
      this.logger.error(`Error analyzing product image: ${error.message}`);
      return `Image de produit reçue: ${caption}`;
    }
  }

  /**
   * Analyser tout type de média
   */
  async analyzeMedia(message: any, sock?: any): Promise<MediaAnalysisResult | null> {
    // Wrap reuploadRequest to prevent uncaught TypeError: terminated
    // when the socket disconnects during media download
    const safeReuploadRequest = sock?.updateMediaMessage
      ? async (...args: any[]) => {
          try {
            return await sock.updateMediaMessage(...args);
          } catch (err) {
            this.logger.warn(`reuploadRequest failed (non-fatal): ${err?.message || err}`);
            return undefined;
          }
        }
      : undefined;

    try {
      // Image
      if (message.message?.imageMessage) {
        const imageMsg = message.message.imageMessage;
        
        let imageBuffer = Buffer.from('');
        
        // Télécharger l'image réelle si on a accès au socket Baileys
        if (sock) {
          try {
            this.logger.log('Downloading image from WhatsApp...');
            const downloadedMedia = await downloadMediaMessage(
              message,
              'buffer',
              {},
              {
                logger: this.logger as never,
                reuploadRequest: safeReuploadRequest,
              }
            );
            imageBuffer = Buffer.from(downloadedMedia);
            this.logger.log(`Image downloaded successfully: ${imageBuffer.length} bytes`);
          } catch (downloadError) {
            this.logger.warn(`Failed to download image: ${downloadError.message}`);
            // Continue with caption-only analysis
          }
        }
        
        return this.analyzeImage(
          imageBuffer,
          imageMsg.caption,
          imageMsg.mimetype
        );
      }

      // Document
      if (message.message?.documentMessage) {
        const docMsg = message.message.documentMessage;
        let docBuffer = Buffer.from('');

        // Download the actual document from WhatsApp
        if (sock) {
          try {
            this.logger.log(`Downloading document: ${docMsg.fileName || 'document'}`);
            const downloadedMedia = await downloadMediaMessage(
              message,
              'buffer',
              {},
              {
                logger: this.logger as never,
                reuploadRequest: safeReuploadRequest,
              }
            );
            docBuffer = Buffer.from(downloadedMedia);
            this.logger.log(`Document downloaded successfully: ${docBuffer.length} bytes`);
          } catch (downloadError) {
            this.logger.warn(`Failed to download document: ${downloadError.message}`);
          }
        }

        return this.analyzeDocument(
          docBuffer,
          docMsg.fileName || 'document',
          docMsg.mimetype || 'application/octet-stream'
        );
      }

      // Vidéo avec transcription audio
      if (message.message?.videoMessage) {
        const videoMsg = message.message.videoMessage;
        let description = "Vidéo reçue";
        let extractedText = videoMsg.caption || "";

        // Télécharger et transcrire l'audio de la vidéo si possible
        if (sock && this.audioTranscriptionService.isTranscriptionAvailable()) {
          try {
            this.logger.log('Downloading video for audio transcription...');

            const downloadedMedia = await downloadMediaMessage(
              message,
              'buffer',
              {},
              {
                logger: this.logger as never,
                reuploadRequest: safeReuploadRequest,
              }
            );

            const videoBuffer = Buffer.from(downloadedMedia);
            this.logger.log(`Video downloaded: ${videoBuffer.length} bytes`);

            // Extraire l'audio de la vidéo et transcrire
            const transcription = await this.extractAndTranscribeVideoAudio(
              videoBuffer,
              videoMsg.mimetype
            );

            if (transcription) {
              extractedText = transcription + (videoMsg.caption ? `\n[Légende: ${videoMsg.caption}]` : '');
              description = `Vidéo transcrite: "${transcription.substring(0, 150)}..."`;
              this.logger.log(`Video audio transcribed: "${transcription.substring(0, 100)}..."`);
            }

          } catch (downloadError) {
            this.logger.warn(`Failed to download/transcribe video: ${downloadError.message}`);
          }
        }

        // Fallback: analyser seulement la légende
        if (!extractedText && videoMsg.caption) {
          const caption = videoMsg.caption.toLowerCase();
          const isProductVideo = this.isProductContext(caption);

          if (isProductVideo) {
            const priceMatch = videoMsg.caption.match(/(\d+[\d\s,]*)\s*(FCFA|FRC|F|€|EUR|\$|USD|francs?)/gi);
            description = `Vidéo de présentation produit`;
            if (priceMatch) {
              description += ` - Prix mentionné: ${priceMatch[0]}`;
            }
            description += ` - ${videoMsg.caption}`;
          } else {
            description = `Vidéo reçue: ${videoMsg.caption}`;
          }
          extractedText = videoMsg.caption;
        }

        return {
          type: 'video',
          description,
          extractedText,
          metadata: {
            mimetype: videoMsg.mimetype,
            seconds: videoMsg.seconds,
            isProductVideo: videoMsg.caption ? this.isProductContext(videoMsg.caption.toLowerCase()) : false,
            duration: videoMsg.seconds ? `${Math.round(videoMsg.seconds)}s` : 'inconnue',
            hasTranscription: extractedText !== (videoMsg.caption || ""),
          }
        };
      }

      // Audio
      if (message.message?.audioMessage) {
        const audioMsg = message.message.audioMessage;
        let description = "Message audio reçu";
        let extractedText = "";
        
        // Télécharger et transcrire l'audio si possible
        if (sock && this.audioTranscriptionService.isTranscriptionAvailable()) {
          try {
            this.logger.log('Downloading and transcribing audio message...');
            
            const downloadedMedia = await downloadMediaMessage(
              message,
              'buffer',
              {},
              {
                logger: this.logger as never,
                reuploadRequest: safeReuploadRequest,
              }
            );
            
            const audioBuffer = Buffer.from(downloadedMedia);
            this.logger.log(`Audio downloaded: ${audioBuffer.length} bytes`);
            
            // Transcrire l'audio
            const transcription = await this.audioTranscriptionService.transcribeAudio(
              audioBuffer,
              {
                mimetype: audioMsg.mimetype,
                filename: 'whatsapp_audio'
              }
            );
            
            if (transcription.success && transcription.text) {
              extractedText = transcription.text;
              description = `Message audio transcrit: "${transcription.text}"`;
              this.logger.log(`Audio transcribed successfully: "${transcription.text.substring(0, 100)}..."`);
            } else {
              this.logger.warn(`Audio transcription failed: ${transcription.error}`);
              description = `Message audio reçu (${audioMsg.seconds || 0}s) - Transcription non disponible`;
            }
            
          } catch (downloadError) {
            this.logger.warn(`Failed to download/transcribe audio: ${downloadError.message}`);
            description = `Message audio reçu (${audioMsg.seconds || 0}s) - Erreur de téléchargement`;
          }
        } else {
          description = `Message audio reçu (${audioMsg.seconds || 0}s)`;
          if (!this.audioTranscriptionService.isTranscriptionAvailable()) {
            description += " - Service de transcription non configuré";
          }
        }
        
        return {
          type: 'audio',
          description,
          extractedText,
          metadata: {
            seconds: audioMsg.seconds,
            ptt: audioMsg.ptt, // Push-to-talk
            transcriptionAvailable: this.audioTranscriptionService.isTranscriptionAvailable(),
            hasTranscription: !!extractedText,
            mimetype: audioMsg.mimetype
          }
        };
      }

      // Vérifier les liens dans le texte
      const text = message.message?.conversation || 
                  message.message?.extendedTextMessage?.text || '';
      
      if (text && text.includes('http')) {
        return this.analyzeLink(text);
      }

      return null;

    } catch (error) {
      this.logger.error(`Error analyzing media: ${error.message}`);
      return null;
    }
  }

  /**
   * Extraire l'audio d'une vidéo et le transcrire
   */
  private async extractAndTranscribeVideoAudio(
    videoBuffer: Buffer,
    mimetype?: string
  ): Promise<string | null> {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const fs = require('fs/promises');
    const path = require('path');
    const crypto = require('crypto');

    const execFileAsync = promisify(execFile);
    const tempDir = path.join(process.cwd(), 'temp', 'video');

    try {
      // Créer le dossier temporaire
      await fs.mkdir(tempDir, { recursive: true });

      // Générer des noms de fichiers uniques
      const hash = crypto.createHash('md5').update(videoBuffer).digest('hex');
      const timestamp = Date.now();
      const videoExt = this.getVideoExtension(mimetype);
      const videoPath = path.join(tempDir, `video_${hash}_${timestamp}${videoExt}`);
      const audioPath = path.join(tempDir, `audio_${hash}_${timestamp}.ogg`);

      // Sauvegarder la vidéo temporairement
      await fs.writeFile(videoPath, videoBuffer);
      this.logger.log(`Video saved to: ${videoPath}`);

      // Extraire l'audio avec FFmpeg
      try {
        await execFileAsync('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'libopus', '-b:a', '64k', audioPath, '-y'], { timeout: 60000 });
        this.logger.log(`Audio extracted to: ${audioPath}`);
      } catch (ffmpegError) {
        // Essayer une autre méthode d'extraction
        try {
          await execFileAsync('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'copy', audioPath, '-y'], { timeout: 60000 });
        } catch {
          this.logger.warn(`FFmpeg audio extraction failed: ${ffmpegError.message}`);
          await this.cleanupFiles([videoPath]);
          return null;
        }
      }

      // Lire le fichier audio extrait
      const audioBuffer = await fs.readFile(audioPath);
      this.logger.log(`Audio file size: ${audioBuffer.length} bytes`);

      // Transcrire l'audio
      const transcription = await this.audioTranscriptionService.transcribeAudio(
        audioBuffer,
        { mimetype: 'audio/ogg' }
      );

      // Nettoyer les fichiers temporaires
      await this.cleanupFiles([videoPath, audioPath]);

      if (transcription.success && transcription.text) {
        return transcription.text;
      }

      this.logger.warn(`Video audio transcription failed: ${transcription.error}`);
      return null;

    } catch (error) {
      this.logger.error(`Error extracting video audio: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtenir l'extension de fichier vidéo basée sur le mimetype
   */
  private getVideoExtension(mimetype?: string): string {
    if (!mimetype) return '.mp4';

    const mimeMap: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/3gpp': '.3gp',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv'
    };

    return mimeMap[mimetype.toLowerCase()] || '.mp4';
  }

  /**
   * Nettoyer les fichiers temporaires
   */
  private async cleanupFiles(filePaths: string[]): Promise<void> {
    const fs = require('fs/promises');
    for (const filepath of filePaths) {
      try {
        await fs.unlink(filepath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}