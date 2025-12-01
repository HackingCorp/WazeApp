import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { ProviderType } from "../enums";

export enum ProviderStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  MAINTENANCE = "maintenance",
  ERROR = "error",
}

export enum DeploymentType {
  SELF_HOSTED = "self_hosted",
  CLOUD_API = "cloud_api",
  HYBRID = "hybrid",
}

@Entity("llm_providers")
@Index("IDX_PROVIDER_ORG", ["organizationId"])
@Index("IDX_PROVIDER_TYPE", ["type"])
export class LlmProvider extends BaseEntity {
  @ApiProperty({ description: "Provider name" })
  @Column()
  name: string;

  @ApiProperty({ description: "Provider type", enum: ProviderType })
  @Column({ type: "enum", enum: ProviderType })
  type: ProviderType;

  @ApiProperty({ description: "Provider status", enum: ProviderStatus })
  @Column({
    type: "enum",
    enum: ProviderStatus,
    default: ProviderStatus.ACTIVE,
  })
  status: ProviderStatus;

  @ApiProperty({ description: "Deployment type", enum: DeploymentType })
  @Column({ type: "enum", enum: DeploymentType })
  deploymentType: DeploymentType;

  @ApiProperty({ description: "Provider configuration" })
  @Column({ type: "jsonb", default: {} })
  config: {
    apiEndpoint?: string;
    apiKey?: string; // encrypted
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    timeout?: number;
    retryAttempts?: number;
    rateLimits?: {
      requestsPerMinute: number;
      tokensPerMinute: number;
      requestsPerDay: number;
    };
    supportedFeatures?: {
      streaming: boolean;
      functionCalling: boolean;
      imageAnalysis: boolean;
      codeGeneration: boolean;
    };
  };

  @ApiProperty({ description: "Provider priority (higher = preferred)" })
  @Column({ default: 1 })
  priority: number;

  @ApiProperty({ description: "Provider metrics" })
  @Column({ type: "jsonb", default: {} })
  metrics: {
    totalRequests?: number;
    successfulRequests?: number;
    failedRequests?: number;
    averageResponseTime?: number;
    totalTokensUsed?: number;
    lastRequestAt?: Date;
    uptime?: number;
    errorRate?: number;
    costPerToken?: number;
    monthlyUsage?: {
      requests: number;
      tokens: number;
      cost: number;
    };
  };

  @ApiProperty({ description: "Health check configuration" })
  @Column({ type: "jsonb", default: {} })
  healthCheck: {
    enabled: boolean;
    interval: number; // seconds
    timeout: number; // seconds
    failureThreshold: number;
    successThreshold: number;
    lastCheck?: Date;
    lastStatus?: "healthy" | "unhealthy";
  };

  // Relationships
  @ApiProperty({ description: "Organization (null for global providers)" })
  @ManyToOne(() => Organization, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ name: "organizationId", nullable: true })
  organizationId?: string;
}
