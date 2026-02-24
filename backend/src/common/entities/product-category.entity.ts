import { Entity, Column, Index, ManyToOne, OneToMany, ManyToMany, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { Product } from "./product.entity";

@Entity("product_categories")
@Index("IDX_CATEGORY_ORG", ["organizationId"])
export class ProductCategory extends BaseEntity {
  @ApiProperty({ description: "Category name" })
  @Column()
  name: string;

  @ApiProperty({ description: "URL slug" })
  @Column({ nullable: true })
  slug?: string;

  @ApiProperty({ description: "Category description" })
  @Column({ type: "text", nullable: true })
  description?: string;

  @ApiProperty({ description: "Category image URL" })
  @Column({ nullable: true })
  imageUrl?: string;

  @ApiProperty({ description: "External ID" })
  @Column({ nullable: true })
  externalId?: string;

  @ApiProperty({ description: "Sort order" })
  @Column({ type: "int", default: 0 })
  sortOrder: number;

  @ManyToOne(() => ProductCategory, (cat) => cat.children, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "parentId" })
  parent: ProductCategory;

  @Column({ name: "parentId", nullable: true })
  parentId?: string;

  @OneToMany(() => ProductCategory, (cat) => cat.parent)
  children: ProductCategory[];

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;

  @ManyToMany(() => Product, (product) => product.categories)
  products: Product[];
}
