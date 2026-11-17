import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import { ConfigService } from "@nestjs/config";
import { encrypt, decrypt, isEncrypted } from "@/common/utils/crypto.util";
import { EcommerceStore } from "@/common/entities";
import {
  EcommercePlatform,
  StoreConnectionStatus,
  AuditAction,
} from "@/common/enums";
import { AuditService } from "../../audit/audit.service";
import { ConnectWooCommerceDto, CreateManualCatalogDto } from "../dto/store.dto";

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectRepository(EcommerceStore)
    private readonly storeRepository: Repository<EcommerceStore>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Secret used to sign inbound webhooks for a store.
   *
   * Webhooks are now refused when a store has none, so every store must get
   * one at creation — otherwise its integration silently stops receiving
   * updates.
   */
  private encryptionKey(): string {
    return this.configService.get<string>("TOOL_ENCRYPTION_KEY") || "";
  }

  /**
   * Store credentials live in a jsonb column and were kept in clear text, so
   * any dump or read access to the database exposed every tenant's API key.
   * Secrets are encrypted at rest from here on; decrypt() passes through any
   * value that is not encrypted, so keys written before this change keep
   * working and get encrypted on their next save.
   */
  private static readonly SECRET_FIELDS = [
    "apiKey",
    "accessToken",
    "consumerKey",
    "consumerSecret",
    "password",
  ];

  private encryptCredentials(
    credentials: Record<string, any> | null | undefined,
  ): Record<string, any> {
    const key = this.encryptionKey();
    if (!credentials) return {};
    if (!key) {
      this.logger.warn(
        "TOOL_ENCRYPTION_KEY is not set — store credentials are saved in clear text.",
      );
      return credentials;
    }

    const out = { ...credentials };
    for (const field of StoreService.SECRET_FIELDS) {
      const value = out[field];
      if (typeof value === "string" && value && !isEncrypted(value)) {
        out[field] = encrypt(value, key);
      }
    }
    return out;
  }

  /** Credentials ready to use against the provider's API. */
  decryptCredentials(
    credentials: Record<string, any> | null | undefined,
  ): Record<string, any> {
    const key = this.encryptionKey();
    if (!credentials || !key) return credentials || {};

    const out = { ...credentials };
    for (const field of StoreService.SECRET_FIELDS) {
      const value = out[field];
      if (typeof value === "string" && value) {
        out[field] = decrypt(value, key);
      }
    }
    return out;
  }

  private static newWebhookSecret(): string {
    return randomBytes(32).toString("hex");
  }

  async findAll(organizationId: string | null): Promise<EcommerceStore[]> {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return this.storeRepository.find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async findOne(
    organizationId: string | null,
    id: string,
  ): Promise<EcommerceStore> {
    const where: any = { id };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    const store = await this.storeRepository.findOne({ where });
    if (!store) {
      throw new NotFoundException(`Store ${id} not found`);
    }
    return store;
  }

  async findById(id: string): Promise<EcommerceStore> {
    const store = await this.storeRepository.findOne({ where: { id } });
    if (!store) {
      throw new NotFoundException(`Store ${id} not found`);
    }
    return store;
  }

  async createManualCatalog(
    organizationId: string,
    userId: string,
    dto: CreateManualCatalogDto,
  ): Promise<EcommerceStore> {
    const store = this.storeRepository.create({
      name: dto.name,
      platform: EcommercePlatform.MANUAL,
      status: StoreConnectionStatus.CONNECTED,
      credentials: {},
      syncConfig: {},
      organizationId,
      createdBy: userId,
    });

    const saved = await this.storeRepository.save(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ecommerce_store",
      resourceId: saved.id,
      description: `Created manual catalog: ${dto.name}`,
      metadata: { platform: "manual", name: dto.name },
    });

    return saved;
  }

  async createShopifyStore(
    organizationId: string,
    userId: string,
    shopDomain: string,
    accessToken: string,
  ): Promise<EcommerceStore> {
    const store = this.storeRepository.create({
      name: shopDomain,
      platform: EcommercePlatform.SHOPIFY,
      status: StoreConnectionStatus.CONNECTED,
      storeUrl: `https://${shopDomain}`,
      credentials: this.encryptCredentials({ accessToken }),
      syncConfig: {
        autoSync: true,
        syncIntervalMinutes: 30,
        totalProductsSynced: 0,
        webhookSecret: StoreService.newWebhookSecret(),
      },
      organizationId,
      createdBy: userId,
    });

    const saved = await this.storeRepository.save(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ecommerce_store",
      resourceId: saved.id,
      description: `Connected Shopify store: ${shopDomain}`,
      metadata: { platform: "shopify", shopDomain },
    });

    return saved;
  }

  async createWooCommerceStore(
    organizationId: string,
    userId: string,
    dto: ConnectWooCommerceDto,
  ): Promise<EcommerceStore> {
    const store = this.storeRepository.create({
      name: dto.name || new URL(dto.storeUrl).hostname,
      platform: EcommercePlatform.WOOCOMMERCE,
      status: StoreConnectionStatus.CONNECTED,
      storeUrl: dto.storeUrl,
      credentials: this.encryptCredentials({
        consumerKey: dto.consumerKey,
        consumerSecret: dto.consumerSecret,
      }),
      syncConfig: {
        autoSync: true,
        syncIntervalMinutes: 30,
        totalProductsSynced: 0,
        webhookSecret: StoreService.newWebhookSecret(),
      },
      organizationId,
      createdBy: userId,
    });

    const saved = await this.storeRepository.save(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ecommerce_store",
      resourceId: saved.id,
      description: `Connected WooCommerce store: ${dto.storeUrl}`,
      metadata: { platform: "woocommerce", storeUrl: dto.storeUrl },
    });

    return saved;
  }

  async createEMarketStore(
    organizationId: string,
    userId: string,
    storeUrl: string,
    apiKey: string,
    name?: string,
  ): Promise<EcommerceStore> {
    const store = this.storeRepository.create({
      name: name || new URL(storeUrl).hostname,
      platform: EcommercePlatform.EMARKET,
      status: StoreConnectionStatus.CONNECTED,
      storeUrl,
      credentials: this.encryptCredentials({ apiKey }),
      syncConfig: {
        autoSync: true,
        syncIntervalMinutes: 30,
        totalProductsSynced: 0,
        webhookSecret: StoreService.newWebhookSecret(),
      },
      organizationId,
      createdBy: userId,
    });

    const saved = await this.storeRepository.save(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "ecommerce_store",
      resourceId: saved.id,
      description: `Connected E-Market store: ${storeUrl}`,
      metadata: { platform: "emarket", storeUrl },
    });

    return saved;
  }

  async updateStatus(
    id: string,
    status: StoreConnectionStatus,
  ): Promise<void> {
    await this.storeRepository.update(id, { status });
  }

  async updateSyncConfig(
    id: string,
    syncConfig: Partial<EcommerceStore["syncConfig"]>,
  ): Promise<void> {
    const store = await this.findById(id);
    store.syncConfig = { ...store.syncConfig, ...syncConfig };
    await this.storeRepository.save(store);
  }

  async disconnect(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<void> {
    const store = await this.findOne(organizationId, id);
    store.status = StoreConnectionStatus.DISCONNECTED;
    store.credentials = {};
    await this.storeRepository.save(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "ecommerce_store",
      resourceId: id,
      description: `Disconnected store: ${store.name}`,
      metadata: { name: store.name },
    });
  }

  async delete(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<void> {
    const store = await this.findOne(organizationId, id);
    await this.storeRepository.remove(store);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "ecommerce_store",
      resourceId: id,
      description: `Deleted store: ${store.name}`,
      metadata: { name: store.name },
    });
  }
}
