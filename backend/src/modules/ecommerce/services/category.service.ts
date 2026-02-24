import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProductCategory } from "@/common/entities";
import { AuditService } from "../../audit/audit.service";
import { AuditAction } from "@/common/enums";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryQueryDto,
} from "../dto/category.dto";

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string | null,
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<ProductCategory> {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const category = this.categoryRepository.create({
      ...dto,
      slug,
      organizationId: organizationId || undefined,
    });

    const saved = await this.categoryRepository.save(category);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "product_category",
      resourceId: saved.id,
      description: `Created category: ${saved.name}`,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async findAll(
    organizationId: string | null,
    query: CategoryQueryDto,
  ): Promise<{ data: ProductCategory[]; total: number }> {
    const qb = this.categoryRepository
      .createQueryBuilder("category")
      .leftJoinAndSelect("category.children", "children")
      .leftJoinAndSelect("category.parent", "parent");

    if (organizationId) {
      qb.where("category.organizationId = :organizationId", {
        organizationId,
      });
    }

    if (query.search) {
      qb.andWhere("category.name ILIKE :search", {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy("category.sortOrder", "ASC").addOrderBy("category.name", "ASC");

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return { data, total };
  }

  async findOne(
    organizationId: string | null,
    id: string,
  ): Promise<ProductCategory> {
    const qb = this.categoryRepository
      .createQueryBuilder("category")
      .leftJoinAndSelect("category.children", "children")
      .leftJoinAndSelect("category.parent", "parent")
      .where("category.id = :id", { id });

    if (organizationId) {
      qb.andWhere("category.organizationId = :organizationId", {
        organizationId,
      });
    }

    const category = await qb.getOne();
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    return category;
  }

  async update(
    organizationId: string | null,
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<ProductCategory> {
    const category = await this.findOne(organizationId, id);

    if (dto.name) {
      dto["slug"] = dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }

    Object.assign(category, dto);
    const saved = await this.categoryRepository.save(category);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "product_category",
      resourceId: id,
      description: `Updated category: ${saved.name}`,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async delete(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<void> {
    const category = await this.findOne(organizationId, id);
    await this.categoryRepository.remove(category);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "product_category",
      resourceId: id,
      description: `Deleted category: ${category.name}`,
      metadata: { name: category.name },
    });
  }
}
