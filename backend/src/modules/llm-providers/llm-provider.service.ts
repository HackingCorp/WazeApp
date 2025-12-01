import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Between } from "typeorm";
import { LlmProvider, Organization, UsageMetric } from "../../common/entities";
import {
  ProviderStatus,
  ProviderType,
  DeploymentType,
  UsageMetricType,
  AuditAction,
} from "../../common/enums";
import {
  CreateLlmProviderDto,
  UpdateLlmProviderDto,
  LlmProviderQueryDto,
  LlmProviderStatsDto,
  TestProviderDto,
} from "./dto/llm-provider.dto";
import { AuditService } from "../audit/audit.service";
import { DeepSeekProvider } from "./providers/deepseek.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { OpenAIProvider } from "./providers/openai.provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { BaseLLMProvider } from "./interfaces/llm-provider.interface";

@Injectable()
export class LlmProviderService {
  constructor(
    @InjectRepository(LlmProvider)
    private readonly providerRepository: Repository<LlmProvider>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,

    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    createDto: CreateLlmProviderDto,
  ): Promise<LlmProvider> {
    // Validate configuration by creating a test instance
    const testProvider = this.createProviderInstance(createDto);
    const isValid = await testProvider.validateConfig();

    if (!isValid) {
      throw new BadRequestException("Provider configuration is invalid");
    }

    const provider = this.providerRepository.create({
      ...createDto,
      organizationId,
      status: ProviderStatus.ACTIVE,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        totalTokensUsed: 0,
        uptime: 1,
        errorRate: 0,
        monthlyUsage: {
          requests: 0,
          tokens: 0,
          cost: 0,
        },
      },
      healthCheck: {
        enabled: true,
        interval: 300, // 5 minutes
        timeout: 10,
        failureThreshold: 3,
        successThreshold: 2,
        ...createDto.healthCheck,
      },
    });

    const saved = await this.providerRepository.save(provider);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "llm_provider",
      resourceId: saved.id,
      details: { name: saved.name, type: saved.type },
    });

    return saved;
  }

  async findAll(
    organizationId: string,
    query: LlmProviderQueryDto,
  ): Promise<{ data: LlmProvider[]; total: number }> {
    const queryBuilder = this.providerRepository
      .createQueryBuilder("provider")
      .where("provider.organizationId = :organizationId", { organizationId });

    if (query.type) {
      queryBuilder.andWhere("provider.type = :type", { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere("provider.status = :status", {
        status: query.status,
      });
    }

    if (query.deploymentType) {
      queryBuilder.andWhere("provider.deploymentType = :deploymentType", {
        deploymentType: query.deploymentType,
      });
    }

    queryBuilder.orderBy("provider.priority", "DESC");
    queryBuilder.addOrderBy("provider.updatedAt", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return { data, total };
  }

  async findGlobal(
    query: LlmProviderQueryDto,
  ): Promise<{ data: LlmProvider[]; total: number }> {
    const queryBuilder = this.providerRepository
      .createQueryBuilder("provider")
      .where("provider.organizationId IS NULL");

    if (query.type) {
      queryBuilder.andWhere("provider.type = :type", { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere("provider.status = :status", {
        status: query.status,
      });
    }

    queryBuilder.orderBy("provider.priority", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return { data, total };
  }

  async findOne(organizationId: string, id: string): Promise<LlmProvider> {
    const provider = await this.providerRepository.findOne({
      where: [
        { id, organizationId },
        { id, organizationId: IsNull() }, // Global providers
      ],
    });

    if (!provider) {
      throw new NotFoundException("LLM provider not found");
    }

    return provider;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    updateDto: UpdateLlmProviderDto,
  ): Promise<LlmProvider> {
    const provider = await this.findOne(organizationId, id);

    // If config is being updated, validate it
    if (updateDto.config) {
      const testProvider = this.createProviderInstance({
        type: provider.type,
        deploymentType: provider.deploymentType,
        config: { ...provider.config, ...updateDto.config },
      } as any);

      const isValid = await testProvider.validateConfig();
      if (!isValid) {
        throw new BadRequestException(
          "Updated provider configuration is invalid",
        );
      }
    }

    Object.assign(provider, updateDto);
    const updated = await this.providerRepository.save(provider);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "llm_provider",
      resourceId: id,
      details: { changes: updateDto },
    });

    return updated;
  }

  async delete(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    const provider = await this.findOne(organizationId, id);

    // Don't allow deleting global providers
    if (!provider.organizationId) {
      throw new BadRequestException("Cannot delete global providers");
    }

    await this.providerRepository.remove(provider);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "llm_provider",
      resourceId: id,
      details: { name: provider.name },
    });
  }

  async getStats(organizationId: string): Promise<LlmProviderStatsDto> {
    const providerStats = await this.providerRepository
      .createQueryBuilder("provider")
      .select([
        "COUNT(*) as total",
        "SUM(CASE WHEN provider.status = :active THEN 1 ELSE 0 END) as active",
      ])
      .where(
        "provider.organizationId = :organizationId OR provider.organizationId IS NULL",
      )
      .setParameter("active", ProviderStatus.ACTIVE)
      .setParameter("organizationId", organizationId)
      .getRawOne();

    const typeStats = await this.providerRepository
      .createQueryBuilder("provider")
      .select("provider.type", "type")
      .addSelect("COUNT(*)", "count")
      .where(
        "provider.organizationId = :organizationId OR provider.organizationId IS NULL",
      )
      .setParameter("organizationId", organizationId)
      .groupBy("provider.type")
      .getRawMany();

    const statusStats = await this.providerRepository
      .createQueryBuilder("provider")
      .select("provider.status", "status")
      .addSelect("COUNT(*)", "count")
      .where(
        "provider.organizationId = :organizationId OR provider.organizationId IS NULL",
      )
      .setParameter("organizationId", organizationId)
      .groupBy("provider.status")
      .getRawMany();

    // Get usage metrics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageStats = await this.usageMetricRepository
      .createQueryBuilder("metric")
      .select([
        "COUNT(*) as totalRequests",
        "SUM(metric.value) as totalTokens",
        "AVG(EXTRACT(epoch FROM (metric.updatedAt - metric.createdAt)) * 1000) as avgResponseTime",
      ])
      .where("metric.organizationId = :organizationId", { organizationId })
      .andWhere("metric.type = :type", { type: UsageMetricType.LLM_TOKENS })
      .andWhere("metric.timestamp >= :startDate", { startDate: thirtyDaysAgo })
      .getRawOne();

    const byType = Object.values(ProviderType).reduce(
      (acc, type) => {
        acc[type] = parseInt(
          typeStats.find((t) => t.type === type)?.count || "0",
        );
        return acc;
      },
      {} as Record<ProviderType, number>,
    );

    const byStatus = Object.values(ProviderStatus).reduce(
      (acc, status) => {
        acc[status] = parseInt(
          statusStats.find((s) => s.status === status)?.count || "0",
        );
        return acc;
      },
      {} as Record<ProviderStatus, number>,
    );

    return {
      total: parseInt(providerStats.total) || 0,
      active: parseInt(providerStats.active) || 0,
      byType,
      byStatus,
      totalRequests: parseInt(usageStats.totalRequests) || 0,
      totalTokens: parseInt(usageStats.totalTokens) || 0,
      averageResponseTime: parseFloat(usageStats.avgResponseTime) || 0,
      errorRate: 0, // Would calculate from success/failure metrics
      estimatedMonthlyCost: 0, // Would calculate based on token usage and pricing
    };
  }

  async testProvider(
    organizationId: string,
    id: string,
    testDto: TestProviderDto,
  ): Promise<any> {
    const provider = await this.findOne(organizationId, id);
    const providerInstance = this.createProviderInstance(provider);

    const testRequest = {
      messages: [{ role: "user" as const, content: testDto.message }],
      maxTokens: testDto.maxTokens,
    };

    try {
      const response = await providerInstance.generateResponse(testRequest);

      return {
        success: true,
        response: response.content,
        usage: response.usage,
        metadata: response.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async validateProvider(organizationId: string, id: string): Promise<boolean> {
    const provider = await this.findOne(organizationId, id);
    const providerInstance = this.createProviderInstance(provider);

    return providerInstance.validateConfig();
  }

  async checkProviderHealth(organizationId: string, id: string): Promise<any> {
    const provider = await this.findOne(organizationId, id);
    const providerInstance = this.createProviderInstance(provider);

    return providerInstance.checkHealth();
  }

  async getProviderUsage(
    organizationId: string,
    id: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const provider = await this.findOne(organizationId, id);

    const queryBuilder = this.usageMetricRepository
      .createQueryBuilder("metric")
      .where("metric.organizationId = :organizationId", { organizationId })
      .andWhere("metric.type = :type", { type: UsageMetricType.LLM_TOKENS })
      .andWhere("metric.metadata->'provider' = :providerName", {
        providerName: provider.name,
      });

    if (startDate && endDate) {
      queryBuilder.andWhere(
        "metric.timestamp BETWEEN :startDate AND :endDate",
        {
          startDate,
          endDate,
        },
      );
    }

    const usage = await queryBuilder
      .select([
        "DATE(metric.timestamp) as date",
        "COUNT(*) as requests",
        "SUM(metric.value) as tokens",
      ])
      .groupBy("DATE(metric.timestamp)")
      .orderBy("date", "ASC")
      .getRawMany();

    const totals = await queryBuilder
      .select([
        "COUNT(*) as totalRequests",
        "SUM(metric.value) as totalTokens",
        "MIN(metric.timestamp) as firstUsed",
        "MAX(metric.timestamp) as lastUsed",
      ])
      .getRawOne();

    return {
      provider: provider.name,
      usage,
      totals: {
        totalRequests: parseInt(totals.totalRequests) || 0,
        totalTokens: parseInt(totals.totalTokens) || 0,
        firstUsed: totals.firstUsed,
        lastUsed: totals.lastUsed,
      },
    };
  }

  private createProviderInstance(
    config: LlmProvider | CreateLlmProviderDto,
  ): BaseLLMProvider {
    switch (config.type) {
      case ProviderType.DEEPSEEK:
        return new DeepSeekProvider(config.config);

      case ProviderType.MISTRAL:
        return new MistralProvider(config.config);

      case ProviderType.OPENAI:
        return new OpenAIProvider(config.config);

      case ProviderType.OLLAMA:
        return new OllamaProvider(config.config);

      default:
        throw new BadRequestException(
          `Unsupported provider type: ${config.type}`,
        );
    }
  }
}
