import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { AiAgent } from "./ai-agent.entity";
import { AgentConversation } from "./agent-conversation.entity";
import { OrderItem } from "./order-item.entity";
import { OrderStatus, OrderSource } from "../enums";

@Entity("orders")
@Index("IDX_ORDER_ORG", ["organizationId"])
@Index("IDX_ORDER_STATUS", ["status"])
@Index("IDX_ORDER_NUMBER", ["orderNumber"], { unique: true })
@Index("IDX_ORDER_CLIENT_PHONE", ["clientPhoneNumber"])
export class Order extends BaseEntity {
  @ApiProperty({ description: "Unique order number" })
  @Column({ unique: true })
  orderNumber: string;

  @ApiProperty({ description: "Order status", enum: OrderStatus })
  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @ApiProperty({ description: "Order source", enum: OrderSource })
  @Column({ type: "enum", enum: OrderSource, default: OrderSource.WHATSAPP_AI })
  source: OrderSource;

  @ApiProperty({ description: "Client phone number" })
  @Column()
  clientPhoneNumber: string;

  @ApiProperty({ description: "Client name" })
  @Column({ nullable: true })
  clientName?: string;

  @ApiProperty({ description: "Delivery address" })
  @Column({ type: "jsonb", nullable: true })
  deliveryAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    notes?: string;
  };

  @ApiProperty({ description: "Total amount" })
  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @ApiProperty({ description: "Currency" })
  @Column({ default: "XAF" })
  currency: string;

  @ApiProperty({ description: "Order notes" })
  @Column({ type: "text", nullable: true })
  notes?: string;

  @ApiProperty({ description: "Cancellation reason" })
  @Column({ type: "text", nullable: true })
  cancellationReason?: string;

  @ApiProperty({ description: "Order metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, any>;

  @ApiProperty({ description: "Confirmed at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  confirmedAt?: Date;

  @ApiProperty({ description: "Shipped at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  shippedAt?: Date;

  @ApiProperty({ description: "Delivered at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  deliveredAt?: Date;

  @ApiProperty({ description: "Cancelled at" })
  @Column({ type: "timestamp with time zone", nullable: true })
  cancelledAt?: Date;

  // Relationships
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId" })
  organizationId: string;

  @ManyToOne(() => AiAgent, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "agentId" })
  agent?: AiAgent;

  @Column({ name: "agentId", nullable: true })
  agentId?: string;

  @ManyToOne(() => AgentConversation, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "conversationId" })
  conversation?: AgentConversation;

  @Column({ name: "conversationId", nullable: true })
  conversationId?: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @BeforeInsert()
  generateOrderNumber() {
    if (!this.orderNumber) {
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
      const random = Math.floor(1000 + Math.random() * 9000);
      this.orderNumber = `ORD-${dateStr}-${random}`;
    }
  }
}
