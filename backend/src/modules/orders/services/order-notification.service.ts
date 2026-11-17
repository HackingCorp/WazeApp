import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OnEvent } from "@nestjs/event-emitter";
import {
  Order,
  OrderItem,
  OrganizationMember,
  User,
} from "@/common/entities";
import { OrderSource, OrderStatus, UserRole } from "@/common/enums";
import { EmailService } from "../../email/email.service";

/**
 * Notifie le marchand des commandes qui arrivent et relance celles
 * qui restent en attente. Sans ce maillon, une commande passee par
 * l'IA ne reveille personne.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  /** Une commande en attente plus longtemps que ca declenche une relance */
  private static readonly PENDING_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;

  /**
   * Au-dela de cette anciennete on ne relance plus: reveiller un marchand
   * sur une commande de l'an dernier (ou une commande de test oubliee en
   * base) n'a pas de sens.
   */
  private static readonly PENDING_ALERT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  /** Nombre maximum de relances envoyees par passage du cron */
  private static readonly REMINDER_BATCH_SIZE = 50;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrganizationMember)
    private readonly orgMemberRepository: Repository<OrganizationMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent("order.created")
  async handleOrderCreated(payload: {
    order: Order;
    organizationId: string;
  }): Promise<void> {
    const order = payload?.order;
    if (!order?.id) return;

    try {
      const recipients = await this.getMerchantRecipients(
        payload.organizationId || order.organizationId,
      );

      if (recipients.length === 0) {
        this.logger.warn(
          `Aucun destinataire pour la commande ${order.orderNumber} (org ${order.organizationId})`,
        );
        return;
      }

      const items = await this.loadItems(order);
      const details = {
        orderNumber: order.orderNumber,
        clientName: order.clientName,
        clientPhoneNumber: order.clientPhoneNumber,
        totalAmount: Number(order.totalAmount) || 0,
        currency: order.currency || "XAF",
        itemsSummary: this.summariseItems(items),
        itemCount: items.length,
        createdAt: order.createdAt || new Date(),
        sourceLabel: this.sourceLabel(order.source),
      };

      for (const recipient of recipients) {
        await this.emailService.sendNewOrderAlert(
          recipient.email,
          recipient.firstName || recipient.email.split("@")[0],
          details,
        );
      }

      await this.markMetadata(order.id, { merchantNotifiedAt: new Date().toISOString() });

      this.logger.log(
        `Commande ${order.orderNumber} signalee a ${recipients.length} destinataire(s)`,
      );
    } catch (error) {
      // Non bloquant: une notification ratee ne doit pas casser la commande
      this.logger.error(
        `Echec de la notification pour la commande ${order.orderNumber}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Relance les commandes laissees en attente au-dela de 24h.
   * Une seule relance par commande (trace dans metadata).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async remindPendingOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() - OrderNotificationService.PENDING_ALERT_AFTER_MS,
    );
    const floor = new Date(
      Date.now() - OrderNotificationService.PENDING_ALERT_MAX_AGE_MS,
    );

    try {
      const stale = await this.orderRepository
        .createQueryBuilder("order")
        .leftJoinAndSelect("order.items", "items")
        .where("order.status = :status", { status: OrderStatus.PENDING })
        .andWhere("order.createdAt < :cutoff", { cutoff })
        .andWhere("order.createdAt > :floor", { floor })
        .andWhere("(order.metadata->>'pendingReminderSentAt') IS NULL")
        .orderBy("order.createdAt", "ASC")
        .take(OrderNotificationService.REMINDER_BATCH_SIZE)
        .getMany();

      if (stale.length === 0) return;

      this.logger.log(`${stale.length} commande(s) en attente depuis plus de 24h`);

      for (const order of stale) {
        const recipients = await this.getMerchantRecipients(order.organizationId);
        if (recipients.length === 0) {
          // Pas de destinataire: on marque quand meme pour ne pas boucler chaque heure
          await this.markMetadata(order.id, {
            pendingReminderSentAt: new Date().toISOString(),
            pendingReminderSkipped: "no-recipient",
          });
          continue;
        }

        const pendingHours = Math.floor(
          (Date.now() - new Date(order.createdAt).getTime()) / (60 * 60 * 1000),
        );

        const details = {
          orderNumber: order.orderNumber,
          clientName: order.clientName,
          clientPhoneNumber: order.clientPhoneNumber,
          totalAmount: Number(order.totalAmount) || 0,
          currency: order.currency || "XAF",
          itemsSummary: this.summariseItems(order.items || []),
          createdAt: order.createdAt,
          pendingHours,
        };

        for (const recipient of recipients) {
          await this.emailService.sendPendingOrderReminder(
            recipient.email,
            recipient.firstName || recipient.email.split("@")[0],
            details,
          );
        }

        await this.markMetadata(order.id, {
          pendingReminderSentAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error(
        `Echec de la relance des commandes en attente: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Proprietaires et admins de l'organisation, avec repli sur
   * n'importe quel membre.
   */
  private async getMerchantRecipients(
    organizationId: string | null | undefined,
  ): Promise<User[]> {
    if (!organizationId) return [];

    const members = await this.orgMemberRepository.find({
      where: {
        organizationId,
        role: In([UserRole.OWNER, UserRole.ADMIN]),
      },
      relations: ["user"],
    });

    const admins = members.map((m) => m.user).filter((u) => u && u.email);
    if (admins.length > 0) return admins;

    const anyMember = await this.orgMemberRepository.findOne({
      where: { organizationId },
      relations: ["user"],
    });
    if (anyMember?.user?.email) return [anyMember.user];

    return [];
  }

  private async loadItems(order: Order): Promise<OrderItem[]> {
    if (order.items?.length) return order.items;
    const reloaded = await this.orderRepository.findOne({
      where: { id: order.id },
      relations: ["items"],
    });
    return reloaded?.items || [];
  }

  private summariseItems(items: OrderItem[]): string {
    if (!items || items.length === 0) return "Aucun article";
    const parts = items
      .slice(0, 5)
      .map((item) => {
        const name = item.variantName
          ? `${item.productName} (${item.variantName})`
          : item.productName;
        return `${item.quantity} x ${name}`;
      });
    if (items.length > 5) {
      parts.push(`+${items.length - 5} autre(s)`);
    }
    return parts.join(", ");
  }

  private sourceLabel(source: OrderSource): string {
    switch (source) {
      case OrderSource.WHATSAPP_AI:
        return "Agent IA WhatsApp";
      case OrderSource.DASHBOARD:
        return "Tableau de bord";
      case OrderSource.API:
        return "API";
      default:
        return source || "Inconnue";
    }
  }

  private async markMetadata(
    orderId: string,
    patch: Record<string, any>,
  ): Promise<void> {
    try {
      const order = await this.orderRepository.findOne({ where: { id: orderId } });
      if (!order) return;
      order.metadata = { ...(order.metadata || {}), ...patch };
      await this.orderRepository.save(order);
    } catch (error) {
      this.logger.warn(
        `Impossible de marquer la commande ${orderId}: ${error.message}`,
      );
    }
  }
}
