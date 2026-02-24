import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import {
  Product,
  ProductVariant,
  ProductImage,
  ProductCategory,
} from "@/common/entities";
import { ProductStatus, EcommercePlatform } from "@/common/enums";
import { AuditService } from "../../audit/audit.service";
import { AuditAction } from "@/common/enums";
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  BulkDeleteDto,
  BulkStatusDto,
} from "../dto/product.dto";

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly imageRepository: Repository<ProductImage>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string | null,
    userId: string,
    dto: CreateProductDto,
  ): Promise<Product> {
    const { variants, images, categoryIds, storeId, ...productData } = dto;

    const product = this.productRepository.create({
      ...productData,
      source: EcommercePlatform.MANUAL,
      organizationId: organizationId || undefined,
      createdBy: userId,
      storeId: storeId || undefined,
    });

    const saved = await this.productRepository.save(product);

    // Create variants
    if (variants?.length) {
      const variantEntities = variants.map((v, i) =>
        this.variantRepository.create({
          ...v,
          productId: saved.id,
          sortOrder: v.sortOrder ?? i,
        }),
      );
      await this.variantRepository.save(variantEntities);
    }

    // Create images
    if (images?.length) {
      const imageEntities = images.map((img, i) =>
        this.imageRepository.create({
          ...img,
          productId: saved.id,
          sortOrder: img.sortOrder ?? i,
        }),
      );
      await this.imageRepository.save(imageEntities);
    }

    // Assign categories
    if (categoryIds?.length) {
      const categories = await this.categoryRepository.findBy({
        id: In(categoryIds),
      });
      saved.categories = categories;
      await this.productRepository.save(saved);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "product",
      resourceId: saved.id,
      description: `Created product: ${saved.name}`,
      metadata: { name: saved.name },
    });

    return this.findOne(organizationId, saved.id);
  }

  async findAll(
    organizationId: string | null,
    query: ProductQueryDto,
  ): Promise<{ data: Product[]; total: number }> {
    const qb = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.images", "images")
      .leftJoinAndSelect("product.variants", "variants")
      .leftJoinAndSelect("product.categories", "categories")
      .leftJoinAndSelect("product.store", "store");

    if (organizationId) {
      qb.where("product.organizationId = :organizationId", { organizationId });
    }

    if (query.search) {
      qb.andWhere(
        "(product.name ILIKE :search OR product.description ILIKE :search OR product.sku ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      qb.andWhere("product.status = :status", { status: query.status });
    }

    if (query.source) {
      qb.andWhere("product.source = :source", { source: query.source });
    }

    if (query.storeId) {
      qb.andWhere("product.storeId = :storeId", { storeId: query.storeId });
    }

    if (query.type) {
      qb.andWhere("product.type = :type", { type: query.type });
    }

    if (query.categoryId) {
      qb.andWhere("categories.id = :categoryId", {
        categoryId: query.categoryId,
      });
    }

    if (query.minPrice !== undefined) {
      qb.andWhere("product.price >= :minPrice", { minPrice: query.minPrice });
    }

    if (query.maxPrice !== undefined) {
      qb.andWhere("product.price <= :maxPrice", { maxPrice: query.maxPrice });
    }

    const sortBy = query.sortBy || "createdAt";
    const sortOrder = (query.sortOrder?.toUpperCase() as "ASC" | "DESC") || "DESC";
    qb.orderBy(`product.${sortBy}`, sortOrder);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return { data, total };
  }

  async findOne(organizationId: string | null, id: string): Promise<Product> {
    const qb = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.variants", "variants")
      .leftJoinAndSelect("product.images", "images")
      .leftJoinAndSelect("product.categories", "categories")
      .leftJoinAndSelect("product.store", "store")
      .where("product.id = :id", { id });

    if (organizationId) {
      qb.andWhere("product.organizationId = :organizationId", {
        organizationId,
      });
    }

    const product = await qb.getOne();
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  async update(
    organizationId: string | null,
    userId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(organizationId, id);
    const { variants, images, categoryIds, ...updateData } = dto;

    // Update basic fields
    Object.assign(product, updateData);
    await this.productRepository.save(product);

    // Update variants if provided
    if (variants !== undefined) {
      await this.variantRepository.delete({ productId: id });
      if (variants.length) {
        const variantEntities = variants.map((v, i) =>
          this.variantRepository.create({
            ...v,
            productId: id,
            sortOrder: v.sortOrder ?? i,
          }),
        );
        await this.variantRepository.save(variantEntities);
      }
    }

    // Update images if provided
    if (images !== undefined) {
      await this.imageRepository.delete({ productId: id });
      if (images.length) {
        const imageEntities = images.map((img, i) =>
          this.imageRepository.create({
            ...img,
            productId: id,
            sortOrder: img.sortOrder ?? i,
          }),
        );
        await this.imageRepository.save(imageEntities);
      }
    }

    // Update categories if provided
    if (categoryIds !== undefined) {
      const categories = categoryIds.length
        ? await this.categoryRepository.findBy({ id: In(categoryIds) })
        : [];
      product.categories = categories;
      await this.productRepository.save(product);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "product",
      resourceId: id,
      description: `Updated product: ${product.name}`,
      metadata: { name: product.name },
    });

    return this.findOne(organizationId, id);
  }

  async delete(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<void> {
    const product = await this.findOne(organizationId, id);
    await this.productRepository.remove(product);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "product",
      resourceId: id,
      description: `Deleted product: ${product.name}`,
      metadata: { name: product.name },
    });
  }

  async bulkDelete(
    organizationId: string | null,
    userId: string,
    dto: BulkDeleteDto,
  ): Promise<{ deleted: number }> {
    const qb = this.productRepository
      .createQueryBuilder("product")
      .where("product.id IN (:...ids)", { ids: dto.ids });

    if (organizationId) {
      qb.andWhere("product.organizationId = :organizationId", {
        organizationId,
      });
    }

    const products = await qb.getMany();
    if (products.length) {
      await this.productRepository.remove(products);
    }

    return { deleted: products.length };
  }

  async bulkUpdateStatus(
    organizationId: string | null,
    userId: string,
    dto: BulkStatusDto,
  ): Promise<{ updated: number }> {
    const qb = this.productRepository
      .createQueryBuilder()
      .update(Product)
      .set({ status: dto.status })
      .where("id IN (:...ids)", { ids: dto.ids });

    if (organizationId) {
      qb.andWhere("organizationId = :organizationId", { organizationId });
    }

    const result = await qb.execute();
    return { updated: result.affected || 0 };
  }

  async getStats(organizationId: string | null): Promise<{
    total: number;
    active: number;
    draft: number;
    archived: number;
    bySource: Record<string, number>;
  }> {
    const qb = this.productRepository.createQueryBuilder("product");

    if (organizationId) {
      qb.where("product.organizationId = :organizationId", { organizationId });
    }

    const total = await qb.getCount();

    const statusCounts = await this.productRepository
      .createQueryBuilder("product")
      .select("product.status", "status")
      .addSelect("COUNT(*)", "count")
      .where(
        organizationId
          ? "product.organizationId = :organizationId"
          : "1=1",
        { organizationId },
      )
      .groupBy("product.status")
      .getRawMany();

    const sourceCounts = await this.productRepository
      .createQueryBuilder("product")
      .select("product.source", "source")
      .addSelect("COUNT(*)", "count")
      .where(
        organizationId
          ? "product.organizationId = :organizationId"
          : "1=1",
        { organizationId },
      )
      .groupBy("product.source")
      .getRawMany();

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => (statusMap[s.status] = parseInt(s.count)));

    const bySource: Record<string, number> = {};
    sourceCounts.forEach((s) => (bySource[s.source] = parseInt(s.count)));

    return {
      total,
      active: statusMap[ProductStatus.ACTIVE] || 0,
      draft: statusMap[ProductStatus.DRAFT] || 0,
      archived: statusMap[ProductStatus.ARCHIVED] || 0,
      bySource,
    };
  }

  // Used by sync service to upsert products from external sources
  async upsertFromExternal(
    organizationId: string,
    storeId: string,
    externalId: string,
    productData: Partial<Product>,
    variantsData?: Partial<ProductVariant>[],
    imagesData?: Partial<ProductImage>[],
  ): Promise<Product> {
    let product = await this.productRepository.findOne({
      where: { externalId, storeId },
    });

    if (product) {
      Object.assign(product, productData);
      product = await this.productRepository.save(product);
    } else {
      product = this.productRepository.create({
        ...productData,
        externalId,
        storeId,
        organizationId,
      });
      product = await this.productRepository.save(product);
    }

    // Sync variants
    if (variantsData) {
      await this.variantRepository.delete({ productId: product.id });
      if (variantsData.length) {
        const variants = variantsData.map((v, i) =>
          this.variantRepository.create({
            ...v,
            productId: product.id,
            sortOrder: i,
          }),
        );
        await this.variantRepository.save(variants);
      }
    }

    // Sync images
    if (imagesData) {
      await this.imageRepository.delete({ productId: product.id });
      if (imagesData.length) {
        const imgs = imagesData.map((img, i) =>
          this.imageRepository.create({
            ...img,
            productId: product.id,
            sortOrder: i,
          }),
        );
        await this.imageRepository.save(imgs);
      }
    }

    return product;
  }

  async deleteByExternalId(storeId: string, externalId: string): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { externalId, storeId },
    });
    if (product) {
      await this.productRepository.remove(product);
    }
  }

  async deleteAllByStore(storeId: string): Promise<number> {
    const result = await this.productRepository.delete({ storeId });
    return result.affected || 0;
  }
}
