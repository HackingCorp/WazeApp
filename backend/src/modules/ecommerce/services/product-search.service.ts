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
    /quel(?:s|les?)?\s+(?:produit|article|service)/i,
    /avez[- ]vous\s+(?:des\s+)?(?:produit|article|service)/i,
    /(?:montrez|voir|consulter|afficher)\s+(?:le\s+)?(?:catalogue|produit|article|service)/i,
    /(?:qu'est-ce que|que)\s+(?:vous\s+)?(?:vendez|proposez|offrez)/i,
    /(?:liste|lister)\s+(?:des\s+|les\s+)?(?:produit|article|service)/i,
    /(?:tout|tous)\s+(?:les|vos)\s+(?:produit|article|service)/i,
    /en\s+stock/i,
    /votre\s+(?:catalogue|boutique|magasin|offre)/i,
    /vos\s+(?:produit|article|service|offre|prestation)/i,
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

    // Also exclude the product trigger keywords themselves
    const triggerWords = new Set(this.productKeywords);

    return message
      .toLowerCase()
      .replace(/[?!.,;:'"()\[\]{}]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word) && !triggerWords.has(word));
  }

  async searchProducts(
    organizationId: string,
    query: string,
    limit: number = 10,
    storeIds?: string[],
  ): Promise<Product[]> {
    const qb = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.variants", "variants")
      .leftJoinAndSelect("product.images", "images")
      .leftJoinAndSelect("product.categories", "categories")
      .where("product.organizationId = :organizationId", { organizationId })
      .andWhere("product.status = :status", { status: "active" });

    if (storeIds && storeIds.length > 0) {
      qb.andWhere("product.storeId IN (:...storeIds)", { storeIds });
    }

    // If it's a general catalog question, return all products (no text filter)
    if (!this.isGeneralCatalogQuery(query)) {
      // Extract meaningful search terms from the message
      const searchTerms = this.extractSearchTerms(query);

      if (searchTerms.length > 0) {
        // Build OR conditions for each search term
        const conditions = searchTerms.map((_, i) =>
          `(product.name ILIKE :search${i} OR product.description ILIKE :search${i} OR product.shortDescription ILIKE :search${i} OR product.sku ILIKE :search${i} OR categories.name ILIKE :search${i})`
        ).join(" OR ");

        const params: Record<string, string> = {};
        searchTerms.forEach((term, i) => {
          params[`search${i}`] = `%${term}%`;
        });

        qb.andWhere(`(${conditions})`, params);
      }
      // If no meaningful search terms extracted, return all products (same as general query)
    }

    qb.orderBy("product.name", "ASC").take(limit);

    return qb.getMany();
  }

  formatProductsForPrompt(products: Product[]): string {
    if (!products.length) return "";

    let result = "\n\n=== PRODUCT CATALOG ===\n";
    result +=
      "Here are products from the catalog that may be relevant to the customer's question:\n\n";

    products.forEach((product, i) => {
      result += `--- Product ${i + 1} ---\n`;
      result += `Name: ${product.name}\n`;

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

      if (product.images?.length > 0) {
        const sorted = [...product.images].sort(
          (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0),
        );
        result += `Images:\n`;
        sorted.forEach((img) => {
          result += `  - ${img.isPrimary ? "[PRIMARY] " : ""}${img.url}${img.altText ? ` (${img.altText})` : ""}\n`;
        });
      }

      result += "\n";
    });

    result +=
      "=== END CATALOG ===\n\nUse the above product information to help the customer. Mention exact prices and availability. If a product is out of stock, let the customer know.\n";

    return result;
  }
}
