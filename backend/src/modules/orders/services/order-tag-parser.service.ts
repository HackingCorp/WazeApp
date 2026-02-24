import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '@/common/entities';
import { OrderService } from './order.service';

@Injectable()
export class OrderTagParserService {
  private readonly logger = new Logger(OrderTagParserService.name);
  private readonly tagRegex = /\[ORDER\]([\s\S]*?)\[\/ORDER\]/;

  constructor(
    private readonly orderService: OrderService,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  hasTag(response: string): boolean {
    return this.tagRegex.test(response);
  }

  async parseAndProcess(
    response: string,
    context: {
      organizationId: string;
      agentId?: string;
      conversationId?: string;
      clientPhoneNumber: string;
    },
  ): Promise<{ cleanResponse: string; order?: any }> {
    const match = response.match(this.tagRegex);
    if (!match) return { cleanResponse: response };

    try {
      const jsonStr = match[1].trim();
      const data = JSON.parse(jsonStr);
      this.logger.log(`Parsed ORDER tag: ${JSON.stringify(data)}`);

      // Validate items
      if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
        this.logger.warn('ORDER tag missing items');
        return { cleanResponse: response.replace(this.tagRegex, '').trim() };
      }

      // Resolve product IDs by name if not provided
      const resolvedItems = [];
      for (const item of data.items) {
        let productId = item.productId;
        let variantId = item.variantId;
        let unitPrice = item.unitPrice || item.price || 0;
        let externalUrl = item.externalUrl;
        let sku = item.sku;

        if (!productId && item.productName) {
          const product = await this.productRepository.findOne({
            where: { name: item.productName, organizationId: context.organizationId },
            relations: ['variants'],
          });

          if (product) {
            productId = product.id;
            if (!unitPrice) unitPrice = product.price || 0;
            if (!externalUrl) externalUrl = product.externalUrl;
            if (!sku) sku = product.sku;

            // Resolve variant if specified
            if (item.variantName && product.variants?.length > 0) {
              const variant = product.variants.find(
                (v) => v.name.toLowerCase() === item.variantName.toLowerCase(),
              );
              if (variant) {
                variantId = variant.id;
                if (variant.price) unitPrice = variant.price;
                if (variant.sku) sku = variant.sku;
              }
            }
          }
        }

        resolvedItems.push({
          productName: item.productName || 'Unknown Product',
          variantName: item.variantName,
          quantity: item.quantity || 1,
          unitPrice: Number(unitPrice),
          productId,
          variantId,
          sku,
          externalUrl,
        });
      }

      const order = await this.orderService.createFromAI({
        organizationId: context.organizationId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        clientPhoneNumber: context.clientPhoneNumber,
        clientName: data.clientName,
        deliveryAddress: data.deliveryAddress,
        items: resolvedItems,
        currency: data.currency,
        notes: data.notes,
      });

      const cleanResponse = response.replace(this.tagRegex, '').trim();
      return { cleanResponse, order };
    } catch (error) {
      this.logger.error(`Failed to parse ORDER tag: ${error.message}`);
      return { cleanResponse: response.replace(this.tagRegex, '').trim() };
    }
  }
}
