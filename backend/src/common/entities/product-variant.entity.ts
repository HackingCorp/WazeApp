import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Product } from "./product.entity";

@Entity("product_variants")
export class ProductVariant extends BaseEntity {
  @ApiProperty({ description: "Variant name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Variant SKU" })
  @Column({ nullable: true })
  sku?: string;

  @ApiProperty({ description: "Variant price" })
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  price?: number;

  @ApiProperty({ description: "Compare at price" })
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  compareAtPrice?: number;

  @ApiProperty({ description: "Stock quantity" })
  @Column({ type: "int", nullable: true })
  stockQuantity?: number;

  @ApiProperty({ description: "In stock" })
  @Column({ default: true })
  inStock: boolean;

  @ApiProperty({ description: "External ID" })
  @Column({ nullable: true })
  externalId?: string;

  @ApiProperty({ description: "Variant options" })
  @Column({ type: "jsonb", default: {} })
  options: Record<string, string>;

  @ApiProperty({ description: "Variant image URL" })
  @Column({ nullable: true })
  imageUrl?: string;

  @ApiProperty({ description: "Sort order" })
  @Column({ type: "int", default: 0 })
  sortOrder: number;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ name: "productId" })
  productId: string;
}
