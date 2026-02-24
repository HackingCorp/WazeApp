import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Order, OrderItem, Product, ProductVariant } from '@/common/entities';
import { OrderStatus, OrderSource } from '@/common/enums';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(organizationId: string, query: {
    status?: OrderStatus;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, search, dateFrom, dateTo, page = 1, limit = 20 } = query;

    const qb = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.organizationId = :organizationId', { organizationId });

    if (status) {
      qb.andWhere('order.status = :status', { status });
    }
    if (search) {
      qb.andWhere(
        '(order.orderNumber ILIKE :search OR order.clientName ILIKE :search OR order.clientPhoneNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: `${dateTo}T23:59:59` });
    }

    qb.orderBy('order.createdAt', 'DESC');

    const total = await qb.getCount();
    const orders = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, organizationId: string) {
    const order = await this.orderRepository.findOne({
      where: { id, organizationId },
      relations: ['items'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getStats(organizationId: string) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [total, pending, confirmed, processing, shipped, delivered, cancelled] = await Promise.all([
      this.orderRepository.count({ where: { organizationId } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.PENDING } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.CONFIRMED } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.PROCESSING } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.SHIPPED } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.DELIVERED } }),
      this.orderRepository.count({ where: { organizationId, status: OrderStatus.CANCELLED } }),
    ]);

    // Revenue calculations
    const todayRevenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'revenue')
      .where('order.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :startOfDay', { startOfDay })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getRawOne();

    const monthlyRevenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'revenue')
      .where('order.organizationId = :organizationId', { organizationId })
      .andWhere('order.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getRawOne();

    return {
      total,
      pending,
      confirmed,
      processing,
      shipped,
      delivered,
      cancelled,
      todayRevenue: parseFloat(todayRevenueResult?.revenue || '0'),
      monthlyRevenue: parseFloat(monthlyRevenueResult?.revenue || '0'),
    };
  }

  async updateStatus(id: string, organizationId: string, status: OrderStatus, cancellationReason?: string) {
    const order = await this.findOne(id, organizationId);
    const previousStatus = order.status;

    order.status = status;
    const now = new Date();

    switch (status) {
      case OrderStatus.CONFIRMED:
        order.confirmedAt = now;
        break;
      case OrderStatus.SHIPPED:
        order.shippedAt = now;
        break;
      case OrderStatus.DELIVERED:
        order.deliveredAt = now;
        break;
      case OrderStatus.CANCELLED:
        order.cancelledAt = now;
        if (cancellationReason) order.cancellationReason = cancellationReason;
        // Restore stock
        await this.restoreStock(order);
        break;
    }

    const saved = await this.orderRepository.save(order);

    this.eventEmitter.emit('order.updated', {
      order: saved,
      organizationId,
      previousStatus,
    });

    return saved;
  }

  async create(organizationId: string, data: {
    clientPhoneNumber: string;
    clientName?: string;
    deliveryAddress?: any;
    currency?: string;
    notes?: string;
    source?: OrderSource;
    items: Array<{
      productName: string;
      variantName?: string;
      quantity: number;
      unitPrice: number;
      sku?: string;
      externalUrl?: string;
      productId?: string;
      variantId?: string;
    }>;
  }) {
    const items = data.items.map((item) => {
      const totalPrice = item.quantity * item.unitPrice;
      return this.orderItemRepository.create({
        ...item,
        totalPrice,
        currency: data.currency || 'XAF',
      });
    });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    const order = this.orderRepository.create({
      organizationId,
      clientPhoneNumber: data.clientPhoneNumber,
      clientName: data.clientName,
      deliveryAddress: data.deliveryAddress,
      currency: data.currency || 'XAF',
      notes: data.notes,
      source: data.source || OrderSource.DASHBOARD,
      totalAmount,
      items,
    });

    const saved = await this.orderRepository.save(order);

    // Decrement stock
    await this.decrementStock(saved);

    this.eventEmitter.emit('order.created', {
      order: saved,
      organizationId,
    });

    return saved;
  }

  async createFromAI(data: {
    organizationId: string;
    agentId?: string;
    conversationId?: string;
    clientPhoneNumber: string;
    clientName?: string;
    deliveryAddress?: any;
    items: Array<{
      productName: string;
      variantName?: string;
      quantity: number;
      unitPrice: number;
      productId?: string;
      variantId?: string;
      sku?: string;
      externalUrl?: string;
    }>;
    currency?: string;
    notes?: string;
  }) {
    const items = data.items.map((item) => {
      const totalPrice = item.quantity * item.unitPrice;
      return this.orderItemRepository.create({
        ...item,
        totalPrice,
        currency: data.currency || 'XAF',
      });
    });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);

    const order = this.orderRepository.create({
      organizationId: data.organizationId,
      agentId: data.agentId,
      conversationId: data.conversationId,
      clientPhoneNumber: data.clientPhoneNumber,
      clientName: data.clientName,
      deliveryAddress: data.deliveryAddress,
      currency: data.currency || 'XAF',
      notes: data.notes,
      source: OrderSource.WHATSAPP_AI,
      totalAmount,
      items,
    });

    const saved = await this.orderRepository.save(order);
    this.logger.log(`Order created from AI: ${saved.orderNumber} for ${saved.clientPhoneNumber}, total: ${saved.totalAmount} ${saved.currency}`);

    // Decrement stock
    await this.decrementStock(saved);

    this.eventEmitter.emit('order.created', {
      order: saved,
      organizationId: data.organizationId,
      conversationId: data.conversationId,
    });

    return saved;
  }

  private async decrementStock(order: Order) {
    for (const item of order.items) {
      if (item.productId) {
        try {
          await this.productRepository
            .createQueryBuilder()
            .update(Product)
            .set({ stockQuantity: () => `"stockQuantity" - ${item.quantity}` })
            .where('id = :id AND "stockQuantity" IS NOT NULL AND "stockQuantity" >= :qty', {
              id: item.productId,
              qty: item.quantity,
            })
            .execute();
        } catch (error) {
          this.logger.warn(`Failed to decrement stock for product ${item.productId}: ${error.message}`);
        }
      }
      if (item.variantId) {
        try {
          await this.variantRepository
            .createQueryBuilder()
            .update(ProductVariant)
            .set({ stockQuantity: () => `"stockQuantity" - ${item.quantity}` })
            .where('id = :id AND "stockQuantity" IS NOT NULL AND "stockQuantity" >= :qty', {
              id: item.variantId,
              qty: item.quantity,
            })
            .execute();
        } catch (error) {
          this.logger.warn(`Failed to decrement stock for variant ${item.variantId}: ${error.message}`);
        }
      }
    }
  }

  private async restoreStock(order: Order) {
    const items = order.items || await this.orderItemRepository.find({ where: { orderId: order.id } });
    for (const item of items) {
      if (item.productId) {
        try {
          await this.productRepository
            .createQueryBuilder()
            .update(Product)
            .set({ stockQuantity: () => `"stockQuantity" + ${item.quantity}` })
            .where('id = :id AND "stockQuantity" IS NOT NULL', { id: item.productId })
            .execute();
        } catch (error) {
          this.logger.warn(`Failed to restore stock for product ${item.productId}: ${error.message}`);
        }
      }
      if (item.variantId) {
        try {
          await this.variantRepository
            .createQueryBuilder()
            .update(ProductVariant)
            .set({ stockQuantity: () => `"stockQuantity" + ${item.quantity}` })
            .where('id = :id AND "stockQuantity" IS NOT NULL', { id: item.variantId })
            .execute();
        } catch (error) {
          this.logger.warn(`Failed to restore stock for variant ${item.variantId}: ${error.message}`);
        }
      }
    }
  }
}
