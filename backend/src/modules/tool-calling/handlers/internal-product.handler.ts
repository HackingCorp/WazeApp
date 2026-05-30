import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition, ToolResult, ToolExecutionContext, ToolHandler } from '../interfaces/tool.interface';
import { ProductSearchService } from '../../ecommerce/services/product-search.service';
import { ProductService } from '../../ecommerce/services/product.service';

@Injectable()
export class InternalProductHandler implements ToolHandler {
  private readonly logger = new Logger(InternalProductHandler.name);

  private readonly toolNames = ['search_products', 'get_product_details'];

  constructor(
    private readonly productSearchService: ProductSearchService,
    private readonly productService: ProductService,
  ) {}

  handles(name: string): boolean {
    return this.toolNames.includes(name);
  }

  getToolDefinitions(_context: ToolExecutionContext): ToolDefinition[] {
    return [
      {
        name: 'search_products',
        description: 'Search the product catalog by keyword or category. Returns a list of matching products with names, prices, and availability.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (product name, keyword, or category)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_product_details',
        description: 'Get detailed information about a specific product by its ID, including variants, images, and full description.',
        parameters: {
          type: 'object',
          properties: {
            productId: {
              type: 'string',
              description: 'The unique ID of the product',
            },
          },
          required: ['productId'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    switch (name) {
      case 'search_products':
        return this.searchProducts(args, context);
      case 'get_product_details':
        return this.getProductDetails(args, context);
      default:
        return { success: false, error: `Unknown product tool: ${name}` };
    }
  }

  private async searchProducts(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const products = await this.productSearchService.searchProducts(
        context.organizationId,
        args.query,
        args.limit || 10,
      );

      const simplified = products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.shortDescription || p.description?.substring(0, 200),
        price: p.price,
        currency: p.currency || 'XAF',
        inStock: p.stockQuantity === null || p.stockQuantity > 0,
        variants: p.variants?.map(v => ({
          id: v.id,
          name: v.name,
          price: v.price,
          inStock: v.stockQuantity === null || v.stockQuantity > 0,
        })),
      }));

      return { success: true, data: { products: simplified, total: simplified.length } };
    } catch (error) {
      this.logger.error(`search_products failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async getProductDetails(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const product = await this.productService.findOne(context.organizationId, args.productId);

      return {
        success: true,
        data: {
          id: product.id,
          name: product.name,
          description: product.description,
          shortDescription: product.shortDescription,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          currency: product.currency || 'XAF',
          sku: product.sku,
          inStock: product.stockQuantity === null || product.stockQuantity > 0,
          stockQuantity: product.stockQuantity,
          variants: product.variants?.map(v => ({
            id: v.id,
            name: v.name,
            price: v.price,
            sku: v.sku,
            inStock: v.stockQuantity === null || v.stockQuantity > 0,
          })),
          categories: product.categories?.map(c => c.name),
          images: product.images?.map(i => i.url),
        },
      };
    } catch (error) {
      this.logger.error(`get_product_details failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
