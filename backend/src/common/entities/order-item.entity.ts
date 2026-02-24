import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Order } from "./order.entity";
import { Product } from "./product.entity";
import { ProductVariant } from "./product-variant.entity";

@Entity("order_items")
export class OrderItem extends BaseEntity {
  @ApiProperty({ description: "Product name" })
  @Column()
  productName: string;

  @ApiProperty({ description: "Variant name" })
  @Column({ nullable: true })
  variantName?: string;

  @ApiProperty({ description: "Quantity" })
  @Column({ type: "int", default: 1 })
  quantity: number;

  @ApiProperty({ description: "Unit price" })
  @Column({ type: "decimal", precision: 12, scale: 2 })
  unitPrice: number;

  @ApiProperty({ description: "Total price" })
  @Column({ type: "decimal", precision: 12, scale: 2 })
  totalPrice: number;

  @ApiProperty({ description: "Currency" })
  @Column({ default: "XAF" })
  currency: string;

  @ApiProperty({ description: "SKU" })
  @Column({ nullable: true })
  sku?: string;

  @ApiProperty({ description: "External URL for direct purchase" })
  @Column({ nullable: true })
  externalUrl?: string;

  // Relationships
  @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order: Order;

  @Column({ name: "orderId" })
  orderId: string;

  @ManyToOne(() => Product, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "productId" })
  product?: Product;

  @Column({ name: "productId", nullable: true })
  productId?: string;

  @ManyToOne(() => ProductVariant, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "variantId" })
  variant?: ProductVariant;

  @Column({ name: "variantId", nullable: true })
  variantId?: string;
}
