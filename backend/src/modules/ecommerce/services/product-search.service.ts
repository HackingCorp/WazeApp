import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Product } from "@/common/entities";

@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);

  private readonly productKeywords = [
    // French
    "produit",
    "prix",
    "acheter",
    "commander",
    "catalogue",
    "article",
    "disponible",
    "stock",
    "combien",
    "coûte",
    "coute",
    "tarif",
    "promo",
    "promotion",
    "réduction",
    "reduction",
    "solde",
    "offre",
    "boutique",
    "magasin",
    "vente",
    "panier",
    "service",
    "prestation",
    // English
    "product",
    "price",
    "buy",
    "order",
    "catalog",
    "available",
    "how much",
    "cost",
    "discount",
    "sale",
    "shop",
    "store",
    "cart",
    "purchase",
    "item",
    "stock",
  ];

  // Patterns that indicate a general catalog browsing question (not searching for a specific product)
  private readonly generalCatalogPatterns = [
    // French
    /quel(?:s|les?)?\s+(?:produit|article|service|modèle|modele)/i,
    /avez[- ]vous\s+(?:des\s+)?(?:produit|article|service)/i,
    /(?:montrez|voir|consulter|afficher)\s+(?:le\s+)?(?:catalogue|produit|article|service)/i,
    /(?:qu'est-ce que|que)\s+(?:vous\s+)?(?:vendez|proposez|offrez|avez)/i,
    /(?:liste|lister)\s+(?:des\s+|les\s+)?(?:produit|article|service)/i,
    /(?:tout|tous)\s+(?:les|vos)\s+(?:produit|article|service)/i,
    /en\s+stock/i,
    /votre\s+(?:catalogue|boutique|magasin|offre)/i,
    /vos\s+(?:produit|article|service|offre|prestation)/i,
    /(?:qu.est.ce qui est)\s+disponible/i,
    // English
    /what\s+(?:product|item|service)s?\s+(?:do you|are)/i,
    /(?:show|list|see|view|browse)\s+(?:all\s+)?(?:product|item|catalog|service)/i,
    /what\s+(?:do you|can you)\s+(?:sell|offer|have)/i,
    /(?:all|your)\s+(?:product|item|service)/i,
    /in\s+stock/i,
  ];

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  isProductQuery(message: string): boolean {
    const lower = message.toLowerCase();
    return this.productKeywords.some((keyword) => lower.includes(keyword));
  }

  /**
   * Check if the message is a general catalog browsing question
   * (e.g., "what products do you have?", "quels produits avez-vous en stock?")
   * vs a specific product search (e.g., "price of iPhone 15")
   */
  private isGeneralCatalogQuery(message: string): boolean {
    return this.generalCatalogPatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Extract meaningful search terms from a user message,
   * filtering out common stop words and product keywords
   */
  private extractSearchTerms(message: string): string[] {
    const stopWords = new Set([
      // French
      "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
      "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
      "ce", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes",
      "son", "sa", "ses", "notre", "votre", "leur", "leurs",
      "qui", "que", "quoi", "quel", "quelle", "quels", "quelles",
      "est", "sont", "a", "ont", "ai", "as", "avez", "avons",
      "et", "ou", "mais", "donc", "car", "ni", "ne", "pas",
      "dans", "sur", "sous", "avec", "pour", "par", "en",
      "plus", "moins", "très", "bien", "tout", "tous", "toute", "toutes",
      "ici", "là", "où", "comment", "pourquoi", "quand",
      "être", "avoir", "faire", "dire", "pouvoir", "vouloir",
      "parle", "parler", "donne", "donner", "montre", "montrer",
      "cherche", "chercher", "voudrais", "veux", "veut",
      "s'il", "vous", "plaît", "plait", "svp", "merci",
      // English
      "i", "you", "he", "she", "it", "we", "they",
      "the", "a", "an", "is", "are", "was", "were",
      "do", "does", "did", "have", "has", "had",
      "and", "or", "but", "not", "no", "yes",
      "in", "on", "at", "to", "for", "with", "from", "by",
      "what", "which", "who", "how", "where", "when", "why",
      "can", "could", "would", "should", "will", "shall",
      "me", "my", "your", "his", "her", "its", "our", "their",
      "this", "that", "these", "those",
      "want", "need", "looking", "look", "find", "get", "show",
      "please", "thanks", "thank",
    ]);

    // Also exclude the product trigger keywords themselves (including plurals)
    const triggerWords = new Set(this.productKeywords);
    // Add common plural/variant forms
    for (const kw of this.productKeywords) {
      triggerWords.add(kw + "s");
      triggerWords.add(kw + "es");
    }
    // Add extra stop words for product search context
    const extraStops = new Set([
      "besoin", "bonjour", "bonsoir", "salut", "hello", "hey",
      "oui", "non", "bon", "merci", "svp",
      "modèle", "modele", "modèles", "modeles",
      "quelles", "quel", "quelle",
    ]);

    const words = message
      .toLowerCase()
      .replace(/[?!.,;:'"()\[\]{}]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word) && !triggerWords.has(word) && !extraStops.has(word));

    // Stem each word to its root form for better matching
    // e.g., "drones" → "drone", "sacs" → "sac", "chaussures" → "chaussur"
    return words.map(word => this.stemWord(word));
  }

  /**
   * Simple stemming: strip common French/English plural suffixes
   * to get shorter root that matches both singular and plural via ILIKE
   * e.g., "drones" → "drone" so %drone% matches "Drone" and "Drones"
   */
  /**
   * Strip accents/diacritics from a string for accent-insensitive matching
   */
  private stripAccents(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  private stemWord(word: string): string {
    // Don't stem very short words
    if (word.length <= 3) return word;

    // French/English plural suffixes (order matters - check longer suffixes first)
    if (word.endsWith("eaux")) return word.slice(0, -1);  // chapeaux → chapeau (keep 'eau')
    if (word.endsWith("aux") && word.length > 4) return word.slice(0, -2);  // animaux → anima (rough but ILIKE will match)
    if (word.endsWith("ies") && word.length > 4) return word.slice(0, -2);  // batteries → batteri
    if (word.endsWith("ses") && word.length > 4) return word.slice(0, -2);  // chaussures → keep, but "courses" → "cour" - too aggressive
    if (word.endsWith("es") && word.length > 4) return word.slice(0, -1);   // drones → drone, chaussures → chaussure
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1); // sacs → sac, drones handled above
    // French verb/noun suffixes
    if (word.endsWith("eur") && word.length > 5) return word.slice(0, -3);  // supporteur → support
    if (word.endsWith("er") && word.length > 5) return word.slice(0, -2);   // supporter → support, charger → charg
    if (word.endsWith("ment") && word.length > 6) return word.slice(0, -4); // chargement → charge
    return word;
  }

  async searchProducts(
    organizationId: string,
    query: string,
    limit: number = 10,
    storeIds?: string[],
  ): Promise<Product[]> {
    this.logger.log(`[searchProducts] orgId=${organizationId}, storeIds=${JSON.stringify(storeIds)}, query="${query?.substring(0, 50)}"`);

    const qb = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.variants", "variants")
      .leftJoinAndSelect("product.images", "images")
      .leftJoinAndSelect("product.categories", "categories");

    // Filter by organization: match orgId OR products with NULL orgId (for users without org)
    if (organizationId) {
      qb.where("(product.organizationId = :organizationId OR product.organizationId IS NULL)", { organizationId });
    }
    qb.andWhere("product.status = :status", { status: "active" });

    if (storeIds && storeIds.length > 0) {
      qb.andWhere("product.storeId IN (:...storeIds)", { storeIds });
    }

    // If it's a general catalog question, return all products (no text filter)
    if (!this.isGeneralCatalogQuery(query)) {
      // Extract meaningful search terms from the message
      const searchTerms = this.extractSearchTerms(query);

      if (searchTerms.length > 0) {
        // For each search term, also generate an unaccented version for accent-insensitive matching
        const allConditions: string[] = [];
        const params: Record<string, string> = {};
        let paramIdx = 0;

        searchTerms.forEach((term) => {
          const unaccented = this.stripAccents(term);
          const fields = ["product.name", "product.description", "product.shortDescription", "product.sku", "categories.name"];

          // Search with original term
          const key1 = `search${paramIdx}`;
          params[key1] = `%${term}%`;
          const cond1 = fields.map(f => `${f} ILIKE :${key1}`).join(" OR ");
          allConditions.push(`(${cond1})`);
          paramIdx++;

          // If unaccented is different, also search without accents
          if (unaccented !== term) {
            const key2 = `search${paramIdx}`;
            params[key2] = `%${unaccented}%`;
            const cond2 = fields.map(f => `${f} ILIKE :${key2}`).join(" OR ");
            allConditions.push(`(${cond2})`);
            paramIdx++;
          }
        });

        qb.andWhere(`(${allConditions.join(" OR ")})`, params);
      }
      // If no meaningful search terms extracted, return all products (same as general query)
    }

    qb.orderBy("product.name", "ASC").take(limit);

    const results = await qb.getMany();
    this.logger.log(`[searchProducts] Found ${results.length} products`);
    return results;
  }

  /**
   * Diagnostic: count products by different criteria
   */
  async countProductsDiagnostic(organizationId?: string): Promise<Record<string, number>> {
    const totalAll = await this.productRepository.count();
    const totalActive = await this.productRepository.count({ where: { status: "active" as any } });
    const totalNullOrg = await this.productRepository
      .createQueryBuilder("p")
      .where("p.organizationId IS NULL")
      .getCount();
    const totalNullOrgActive = await this.productRepository
      .createQueryBuilder("p")
      .where("p.organizationId IS NULL")
      .andWhere("p.status = :s", { s: "active" })
      .getCount();

    const result: Record<string, number> = {
      totalAllProducts: totalAll,
      totalActiveProducts: totalActive,
      totalNullOrgProducts: totalNullOrg,
      totalNullOrgActiveProducts: totalNullOrgActive,
    };

    if (organizationId) {
      const totalForOrg = await this.productRepository.count({
        where: { organizationId } as any,
      });
      const totalForOrgActive = await this.productRepository
        .createQueryBuilder("p")
        .where("p.organizationId = :orgId", { orgId: organizationId })
        .andWhere("p.status = :s", { s: "active" })
        .getCount();
      result.totalForOrg = totalForOrg;
      result.totalForOrgActive = totalForOrgActive;
    }

    return result;
  }

  formatProductsForPrompt(products: Product[]): string {
    if (!products.length) return "";

    let result = "\n\n=== YOUR PRODUCT CATALOG ===\n";
    result +=
      "IMPORTANT: The following products are from YOUR store catalog. These are real products that you sell. When the customer asks about any of these products, you MUST present them with their names, prices, and availability. NEVER say you don't have a product if it appears in this list.\n\n";

    products.forEach((product, i) => {
      result += `--- Product ${i + 1} ---\n`;
      result += `Name: ${product.name}\n`;
      result += `Image Tag: [PRODUCT_IMAGE:${i + 1}]\n`;

      if (product.description) {
        const desc =
          product.description.length > 200
            ? product.description.substring(0, 200) + "..."
            : product.description;
        result += `Description: ${desc}\n`;
      }

      if (product.price !== null && product.price !== undefined) {
        result += `Price: ${product.price} ${product.currency}\n`;
      }

      if (
        product.compareAtPrice !== null &&
        product.compareAtPrice !== undefined
      ) {
        result += `Original Price: ${product.compareAtPrice} ${product.currency} (ON SALE)\n`;
      }

      result += `In Stock: ${product.inStock ? "Yes" : "No"}`;
      if (product.stockQuantity !== null && product.stockQuantity !== undefined) {
        result += ` (${product.stockQuantity} available)`;
      }
      result += "\n";

      if (product.variants?.length > 1) {
        result += "Variants:\n";
        product.variants.forEach((v) => {
          const options = Object.entries(v.options || {})
            .map(([k, val]) => `${k}: ${val}`)
            .join(", ");
          result += `  - ${v.name}`;
          if (options) result += ` (${options})`;
          if (v.price) result += ` - ${v.price} ${product.currency}`;
          result += v.inStock ? " [In Stock]" : " [Out of Stock]";
          result += "\n";
        });
      }

      if (product.externalUrl) {
        result += `Link: ${product.externalUrl}\n`;
      }

      result += "\n";
    });

    result +=
      "=== END CATALOG ===\n\nCRITICAL INSTRUCTIONS:\n" +
      "- You MUST use the products listed above to answer the customer. Present matching products with their exact names, prices, and stock status.\n" +
      "- NEVER claim you don't have a product if it appears in the catalog above.\n" +
      "- When you present a product to the customer, include its image tag (e.g. [PRODUCT_IMAGE:1]) in your response so the customer can see the product photo.\n" +
      "- ONLY include image tags for products you are actively presenting or discussing. Do NOT include image tags for products you are not talking about.\n" +
      "- ORDERING: When confirming a customer order, you MUST include the [ORDER] tag. Without this tag, the order is NOT saved. See ORDER CREATION instructions above.\n";

    return result;
  }
}
