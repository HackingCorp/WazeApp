import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Product } from "./product.entity";

@Entity("product_images")
export class ProductImage extends BaseEntity {
  @ApiProperty({ description: "Image URL" })
  @Column()
  url: string;

  @ApiProperty({ description: "Alt text" })
  @Column({ nullable: true })
  altText?: string;

  @ApiProperty({ description: "Sort order" })
  @Column({ type: "int", default: 0 })
  sortOrder: number;

  @ApiProperty({ description: "Is primary image" })
  @Column({ default: false })
  isPrimary: boolean;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ name: "productId" })
  productId: string;
}
