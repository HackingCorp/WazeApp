import { Entity, Column, Index, ManyToOne, OneToMany, ManyToMany, JoinColumn, JoinTable } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { EcommerceStore } from "./ecommerce-store.entity";
import { ProductVariant } from "./product-variant.entity";
import { ProductImage } from "./product-image.entity";
import { ProductCategory } from "./product-category.entity";
import { ProductStatus, EcommercePlatform } from "../enums";

@Entity("products")
@Index("IDX_PRODUCT_ORG", ["organizationId"])
@Index("IDX_PRODUCT_STORE", ["storeId"])
@Index("IDX_PRODUCT_STATUS", ["status"])
@Index("IDX_PRODUCT_SKU", ["sku"])
@Index("IDX_PRODUCT_EXTERNAL", ["externalId", "storeId"])
export class Product extends BaseEntity {
  @ApiProperty({ description: "Product name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Product description" })
  @Column({ type: "text", nullable: true })
  description?: string;

  @ApiProperty({ description: "Short description" })
  @Column({ type: "text", nullable: true })
  shortDescription?: string;

  @ApiProperty({ description: "SKU code" })
  @Column({ nullable: true })
  sku?: string;

  @ApiProperty({ description: "Price" })
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  price?: number;

  @ApiProperty({ description: "Compare at price (strikethrough)" })
  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  compareAtPrice?: number;

  @ApiProperty({ description: "Currency" })
  @Column({ default: "XAF" })
  currency: string;

  @ApiProperty({ description: "Product status", enum: ProductStatus })
  @Column({ type: "enum", enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @ApiProperty({ description: "Product source", enum: EcommercePlatform })
  @Column({ type: "enum", enum: EcommercePlatform, default: EcommercePlatform.MANUAL })
  source: EcommercePlatform;

  @ApiProperty({ description: "External ID (Shopify/WooCommerce)" })
  @Column({ nullable: true })
  externalId?: string;

  @ApiProperty({ description: "External product URL" })
  @Column({ nullable: true })
  externalUrl?: string;

  @ApiProperty({ description: "Stock quantity" })
  @Column({ type: "int", nullable: true })
  stockQuantity?: number;

  @ApiProperty({ description: "In stock" })
  @Column({ default: true })
  inStock: boolean;

  @ApiProperty({ description: "Product tags" })
  @Column({ type: "text", array: true, default: [] })
  tags: string[];

  @ApiProperty({ description: "Product metadata" })
  @Column({ type: "jsonb", default: {} })
  metadata: {
    vendor?: string;
    productType?: string;
    weight?: number;
    barcode?: string;
    [key: string]: any;
  };

  // Relationships
  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ManyToOne(() => EcommerceStore, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "storeId" })
  store: EcommerceStore;

  @Column({ name: "storeId", nullable: true })
  storeId?: string;

  @Column({ name: "createdBy", nullable: true })
  createdBy?: string;

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants: ProductVariant[];

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images: ProductImage[];

  @ManyToMany(() => ProductCategory)
  @JoinTable({
    name: "product_category_map",
    joinColumn: { name: "productId", referencedColumnName: "id" },
    inverseJoinColumn: { name: "categoryId", referencedColumnName: "id" },
  })
  categories: ProductCategory[];
}
