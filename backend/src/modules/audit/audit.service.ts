import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditLog } from "@/common/entities";
import { AuditAction } from "@/common/enums";

export interface AuditLogData {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  userId?: string;
  organizationId?: string;
  description?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  async log(data: AuditLogData): Promise<void> {
    const auditLog = this.auditRepository.create(data);
    await this.auditRepository.save(auditLog);
  }

  async getUserActivityCount(
    userId: string,
    organizationId?: string,
  ): Promise<number> {
    const queryBuilder = this.auditRepository
      .createQueryBuilder("audit")
      .where("audit.userId = :userId", { userId });

    if (organizationId) {
      queryBuilder.andWhere("audit.organizationId = :organizationId", {
        organizationId,
      });
    }

    return queryBuilder.getCount();
  }
}
