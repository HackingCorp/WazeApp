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

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  isProductQuery(message: string): boolean {
    const lower = message.toLowerCase();
    return this.productKeywords.some((keyword) => lower.includes(keyword));
  }

  async searchProducts(
    organizationId: string,
    query: string,
    limit: number = 5,
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

    // Search across multiple fields
    qb.andWhere(
      `(
        product.name ILIKE :search
        OR product.description ILIKE :search
        OR product.shortDescription ILIKE :search
        OR product.sku ILIKE :search
        OR :searchTerm = ANY(product.tags)
        OR categories.name ILIKE :search
      )`,
      {
        search: `%${query}%`,
        searchTerm: query.toLowerCase(),
      },
    );

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
