import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { User } from "@/common/entities";
import { StoreService } from "../services/store.service";
import { ShopifyService } from "../services/shopify.service";
import { WooCommerceService } from "../services/woocommerce.service";
import { EMarketService } from "../services/emarket.service";
import { SyncService } from "../services/sync.service";
import { ConnectShopifyDto, ConnectWooCommerceDto, ConnectEMarketDto, CreateManualCatalogDto } from "../dto/store.dto";
import { QuotaEnforcementService } from "../../subscriptions/quota-enforcement.service";

@ApiTags("E-Commerce - Stores")
@Controller("ecommerce/stores")
export class StoreController {
  private readonly logger = new Logger(StoreController.name);

  constructor(
    private readonly storeService: StoreService,
    private readonly shopifyService: ShopifyService,
    private readonly wooCommerceService: WooCommerceService,
    private readonly eMarketService: EMarketService,
    private readonly syncService: SyncService,
    private readonly configService: ConfigService,
    private readonly quotaEnforcementService: QuotaEnforcementService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List connected stores" })
  @ApiResponse({ status: 200, description: "Stores list" })
  async findAll(@CurrentUser() user: User) {
    const organizationId = (user as any).organizationId || null;
    const stores = await this.storeService.findAll(organizationId);
    return { data: stores };
  }

  @Post("manual")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Create a manual catalog" })
  @ApiResponse({ status: 201, description: "Catalog created" })
  async createManualCatalog(
    @CurrentUser() user: User,
    @Body() dto: CreateManualCatalogDto,
  ) {
    const organizationId = (user as any).organizationId || user.id;
    await this.quotaEnforcementService.enforceFeatureAccess(organizationId, 'ecommerce');
    const store = await this.storeService.createManualCatalog(
      organizationId,
      user.id,
      dto,
    );
    return { data: store };
  }

  @Get(":id")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get store details" })
  @ApiResponse({ status: 200, description: "Store details" })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    const store = await this.storeService.findOne(organizationId, id);
    return { data: store };
  }

  @Post("shopify/auth-url")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Generate Shopify OAuth URL" })
  @ApiResponse({ status: 200, description: "OAuth URL generated" })
  async getShopifyAuthUrl(
    @CurrentUser() user: User,
    @Body() dto: ConnectShopifyDto,
  ) {
    const organizationId = (user as any).organizationId || user.id;
    await this.quotaEnforcementService.enforceFeatureAccess(organizationId, 'ecommerce');
    const authUrl = this.shopifyService.generateAuthUrl(
      dto.shopDomain,
      organizationId,
    );
    return { data: { authUrl } };
  }

  @Get("shopify/callback")
  @Public()
  @ApiOperation({ summary: "Shopify OAuth callback" })
  async shopifyCallback(
    @Query("code") code: string,
    @Query("shop") shop: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const dashboardUrl = this.configService.get<string>(
      "DASHBOARD_URL",
      "https://app.wazeapp.ai",
    );

    try {
      const { organizationId } = JSON.parse(
        Buffer.from(state, "base64").toString(),
      );

      const accessToken = await this.shopifyService.exchangeCodeForToken(
        shop,
        code,
      );

      const store = await this.storeService.createShopifyStore(
        organizationId,
        "system",
        shop,
        accessToken,
      );

      // Trigger initial sync
      await this.syncService.triggerFullSync(store.id);

      return res.redirect(
        `${dashboardUrl}/products/stores?connected=shopify`,
      );
    } catch (error) {
      return res.redirect(
        `${dashboardUrl}/products/stores?error=${encodeURIComponent(error.message)}`,
      );
    }
  }

  @Post("woocommerce/connect")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Connect WooCommerce store" })
  @ApiResponse({ status: 201, description: "Store connected" })
  async connectWooCommerce(
    @CurrentUser() user: User,
    @Body() dto: ConnectWooCommerceDto,
  ) {
    const organizationId = (user as any).organizationId || user.id;
    await this.quotaEnforcementService.enforceFeatureAccess(organizationId, 'ecommerce');

    // Test connection first
    await this.wooCommerceService.testConnection(
      dto.storeUrl,
      dto.consumerKey,
      dto.consumerSecret,
    );

    const store = await this.storeService.createWooCommerceStore(
      organizationId,
      user.id,
      dto,
    );

    // Trigger initial sync
    await this.syncService.triggerFullSync(store.id);

    return { data: store };
  }

  @Post("emarket/connect")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Connect E-Market store" })
  @ApiResponse({ status: 201, description: "Store connected" })
  async connectEMarket(
    @CurrentUser() user: User,
    @Body() dto: ConnectEMarketDto,
  ) {
    const organizationId = (user as any).organizationId || user.id;
    await this.quotaEnforcementService.enforceFeatureAccess(organizationId, 'ecommerce');

    // Test connection first (skip if it fails, still save the store)
    try {
      await this.eMarketService.testConnection(dto.storeUrl, dto.apiKey);
    } catch (error) {
      this.logger.warn(`E-Market connection test failed: ${error.message}`);
    }

    const store = await this.storeService.createEMarketStore(
      organizationId,
      user.id,
      dto.storeUrl,
      dto.apiKey,
      dto.name,
    );

    // Trigger initial sync
    await this.syncService.triggerFullSync(store.id);

    return { data: store };
  }

  @Post(":id/sync")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Trigger store sync" })
  @ApiResponse({ status: 200, description: "Sync triggered" })
  async triggerSync(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.storeService.findOne(organizationId, id); // Verify access
    const result = await this.syncService.triggerFullSync(id);
    return { data: result };
  }

  @Get(":id/sync-status")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get sync status" })
  @ApiResponse({ status: 200, description: "Sync status" })
  async getSyncStatus(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.storeService.findOne(organizationId, id); // Verify access
    const status = await this.syncService.getSyncStatus(id);
    return { data: status };
  }

  @Post(":id/disconnect")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Disconnect store" })
  @ApiResponse({ status: 200, description: "Store disconnected" })
  async disconnect(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.storeService.disconnect(organizationId, user.id, id);
    return { message: "Store disconnected" };
  }

  @Delete(":id")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete store and all its products" })
  @ApiResponse({ status: 200, description: "Store deleted" })
  async delete(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const organizationId = (user as any).organizationId || null;
    await this.storeService.delete(organizationId, user.id, id);
    return { message: "Store deleted" };
  }
}
