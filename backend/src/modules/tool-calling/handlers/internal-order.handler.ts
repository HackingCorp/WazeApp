import { Injectable, Logger } from '@nestjs/common';
import { ToolDefinition, ToolResult, ToolExecutionContext, ToolHandler } from '../interfaces/tool.interface';
import { OrderService } from '../../orders/services/order.service';

@Injectable()
export class InternalOrderHandler implements ToolHandler {
  private readonly logger = new Logger(InternalOrderHandler.name);

  private readonly toolNames = ['create_order', 'get_order_status', 'list_recent_orders'];

  constructor(
    private readonly orderService: OrderService,
  ) {}

  handles(name: string): boolean {
    return this.toolNames.includes(name);
  }

  getToolDefinitions(_context: ToolExecutionContext): ToolDefinition[] {
    return [
      {
        name: 'create_order',
        description: 'Create a new order for the customer. Requires at least one item with product name, quantity and unit price.',
        parameters: {
          type: 'object',
          properties: {
            clientName: {
              type: 'string',
              description: 'Name of the customer',
            },
            clientPhone: {
              type: 'string',
              description: 'Phone number of the customer',
            },
            items: {
              type: 'array',
              description: 'List of items to order',
              items: {
                type: 'object',
                properties: {
                  productName: { type: 'string', description: 'Product name' },
                  quantity: { type: 'number', description: 'Quantity' },
                  unitPrice: { type: 'number', description: 'Price per unit' },
                  productId: { type: 'string', description: 'Product ID if known' },
                  variantId: { type: 'string', description: 'Variant ID if applicable' },
                },
              },
            },
            deliveryAddress: {
              type: 'string',
              description: 'Delivery address',
            },
            notes: {
              type: 'string',
              description: 'Additional notes for the order',
            },
          },
          required: ['clientPhone', 'items'],
        },
      },
      {
        name: 'get_order_status',
        description: 'Get the current status of an order by its order number.',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: {
              type: 'string',
              description: 'The order number to look up',
            },
          },
          required: ['orderNumber'],
        },
      },
      {
        name: 'list_recent_orders',
        description: 'List recent orders for a customer by their phone number.',
        parameters: {
          type: 'object',
          properties: {
            clientPhone: {
              type: 'string',
              description: 'Phone number of the customer',
            },
          },
          required: ['clientPhone'],
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    switch (name) {
      case 'create_order':
        return this.createOrder(args, context);
      case 'get_order_status':
        return this.getOrderStatus(args, context);
      case 'list_recent_orders':
        return this.listRecentOrders(args, context);
      default:
        return { success: false, error: `Unknown order tool: ${name}` };
    }
  }

  private async createOrder(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const order = await this.orderService.createFromAI({
        organizationId: context.organizationId,
        agentId: context.agentId,
        conversationId: context.conversationId,
        clientPhoneNumber: args.clientPhone || context.clientPhoneNumber,
        clientName: args.clientName,
        deliveryAddress: args.deliveryAddress,
        items: args.items,
        notes: args.notes,
      });

      return {
        success: true,
        data: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          currency: order.currency,
          status: order.status,
          itemCount: order.items?.length || 0,
        },
      };
    } catch (error) {
      this.logger.error(`create_order failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async getOrderStatus(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await this.orderService.findAll(context.organizationId, {
        search: args.orderNumber,
        limit: 1,
      });

      if (!result.orders?.length) {
        return { success: true, data: { found: false, message: 'Order not found' } };
      }

      const order = result.orders[0];
      return {
        success: true,
        data: {
          found: true,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: order.totalAmount,
          currency: order.currency,
          createdAt: order.createdAt,
          items: order.items?.map(i => ({
            productName: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`get_order_status failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async listRecentOrders(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    try {
      const result = await this.orderService.findAll(context.organizationId, {
        search: args.clientPhone,
        limit: 5,
      });

      const orders = (result.orders || []).map(o => ({
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        currency: o.currency,
        createdAt: o.createdAt,
        itemCount: o.items?.length || 0,
      }));

      return { success: true, data: { orders, total: result.total } };
    } catch (error) {
      this.logger.error(`list_recent_orders failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
