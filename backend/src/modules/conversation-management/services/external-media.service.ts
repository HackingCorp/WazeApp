import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Redis } from "ioredis";
import {
  MediaAsset,
  Organization,
  Subscription,
  UsageMetric,
} from "../../../common/entities";
import {
  MediaSearchProvider,
  MediaType,
  SubscriptionPlan,
  UsageMetricType,
} from "../../../common/enums";

export interface MediaSearchRequest {
  query: string;
  mediaType: MediaType;
  limit?: number;
  safeSearch?: boolean;
  organizationId: string;
}

export interface MediaSearchResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  source: MediaSearchProvider;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    fileSize?: number;
    license?: string;
    attribution?: string;
    tags?: string[];
  };
}

export interface SearchResponse {
  results: MediaSearchResult[];
  totalResults: number;
  provider: MediaSearchProvider;
  cached: boolean;
  quotaUsed: number;
}

@Injectable()
export class ExternalMediaService {
  private readonly logger = new Logger(ExternalMediaService.name);
  private readonly redis: Redis;

  // API configurations
  private readonly googleApiKey: string;
  private readonly googleCxId: string;
  private readonly youtubeApiKey: string;
  private readonly bingApiKey: string;
  private readonly pexelsApiKey: string;
  private readonly unsplashApiKey: string;

  // API quota limits (per day)
  private readonly quotaLimits = {
    [MediaSearchProvider.GOOGLE]: 100,
    [MediaSearchProvider.YOUTUBE]: 100,
    [MediaSearchProvider.BING]: 1000,
    [MediaSearchProvider.PEXELS]: 200,
    [MediaSearchProvider.UNSPLASH]: 50,
  };

  // Subscription tier limits
  private readonly tierLimits = {
    [SubscriptionPlan.FREE]: 0, // No external media search
    [SubscriptionPlan.STANDARD]: 0, // No external media search
    [SubscriptionPlan.PRO]: 50, // 50 searches per day
    [SubscriptionPlan.ENTERPRISE]: 200, // 200 searches per day
  };

  constructor(
    @InjectRepository(MediaAsset)
    private mediaRepository: Repository<MediaAsset>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get("REDIS_HOST", "localhost"),
      port: this.configService.get("REDIS_PORT", 6379),
      password: this.configService.get("REDIS_PASSWORD"),
    });

    // Initialize API keys
    this.googleApiKey = this.configService.get("GOOGLE_SEARCH_API_KEY");
    this.googleCxId = this.configService.get("GOOGLE_SEARCH_CX_ID");
    this.youtubeApiKey = this.configService.get("YOUTUBE_API_KEY");
    this.bingApiKey = this.configService.get("BING_SEARCH_API_KEY");
    this.pexelsApiKey = this.configService.get("PEXELS_API_KEY");
    this.unsplashApiKey = this.configService.get("UNSPLASH_API_KEY");
  }

  /**
   * Search for media across providers
   */
  async searchMedia(request: MediaSearchRequest): Promise<SearchResponse> {
    this.logger.log(`Searching media: ${request.query} (${request.mediaType})`);

    // Validate subscription and limits
    await this.validateSearchRequest(request);

    // Check cache first
    const cacheKey = this.generateCacheKey(request);
    const cached = await this.getCachedResults(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
        quotaUsed: 0,
      };
    }

    // Determine best provider for media type
    const providers = this.selectProvidersForMediaType(request.mediaType);
    let results: MediaSearchResult[] = [];
    let totalResults = 0;
    let usedProvider: MediaSearchProvider = providers[0];
    let quotaUsed = 0;

    // Try providers in order until we get results
    for (const provider of providers) {
      if (await this.checkQuotaAvailable(provider)) {
        try {
          const providerResults = await this.searchProvider(provider, request);
          results = providerResults.results;
          totalResults = providerResults.totalResults;
          usedProvider = provider;
          quotaUsed = 1;
          break;
        } catch (error) {
          this.logger.warn(`Provider ${provider} failed: ${error.message}`);
          continue;
        }
      }
    }

    // Filter and validate results
    results = await this.filterAndValidateResults(results, request);

    const response: SearchResponse = {
      results,
      totalResults,
      provider: usedProvider,
      cached: false,
      quotaUsed,
    };

    // Cache results
    await this.cacheResults(cacheKey, response);

    // Record usage metrics
    await this.recordSearchUsage(
      request.organizationId,
      usedProvider,
      quotaUsed,
    );

    return response;
  }

  /**
   * Import external media to organization gallery
   */
  async importMedia(
    organizationId: string,
    mediaResults: MediaSearchResult[],
    options?: {
      tags?: string[];
      isTemplate?: boolean;
    },
  ): Promise<MediaAsset[]> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      throw new BadRequestException("No subscription found");
    }

    const importedAssets: MediaAsset[] = [];

    for (const result of mediaResults) {
      try {
        // Download media file
        const response = await firstValueFrom(
          this.httpService.get(result.url, { responseType: "arraybuffer" }),
        );

        const buffer = Buffer.from(response.data);

        // Create media asset record
        const asset = this.mediaRepository.create({
          filename: `${result.source}_${result.id}`,
          mediaType: this.inferMediaType(result.url),
          fileSize: buffer.length,
          mimeType:
            response.headers["content-type"] || "application/octet-stream",
          storagePath: "", // Will be set after file is saved
          cdnUrl: result.url, // Use original URL temporarily
          thumbnailUrl: result.thumbnailUrl,
          dimensions: {
            width: result.metadata.width,
            height: result.metadata.height,
            duration: result.metadata.duration,
          },
          tags: [...(options?.tags || []), result.source],
          altText: result.description || result.title,
          isTemplate: options?.isTemplate || false,
          organizationId,
          qualityVariants: {},
          metadata: {
            source: result.source,
            originalUrl: result.url,
            license: result.metadata.license,
            attribution: result.metadata.attribution,
            searchQuery: options?.tags?.join(" "),
          },
        });

        const savedAsset = await this.mediaRepository.save(asset);
        importedAssets.push(savedAsset);

        // Record storage usage
        await this.recordStorageUsage(organizationId, buffer.length);
      } catch (error) {
        this.logger.warn(
          `Failed to import media ${result.id}: ${error.message}`,
        );
      }
    }

    return importedAssets;
  }

  /**
   * Get search suggestions based on query
   */
  async getSearchSuggestions(
    query: string,
    mediaType: MediaType,
    organizationId: string,
  ): Promise<string[]> {
    // Check recent searches for similar queries
    const recentSearches = await this.getRecentSearches(
      organizationId,
      mediaType,
    );

    // Simple suggestion algorithm - in production use ML/NLP
    const suggestions = recentSearches
      .filter((search) => search.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);

    // Add common suggestions based on media type
    const commonSuggestions = this.getCommonSuggestions(mediaType, query);

    return [...new Set([...suggestions, ...commonSuggestions])].slice(0, 8);
  }

  /**
   * Search Google Custom Search
   */
  private async searchGoogle(request: MediaSearchRequest): Promise<{
    results: MediaSearchResult[];
    totalResults: number;
  }> {
    if (!this.googleApiKey || !this.googleCxId) {
      throw new Error("Google Search API not configured");
    }

    const params = {
      key: this.googleApiKey,
      cx: this.googleCxId,
      q: request.query,
      searchType: request.mediaType === MediaType.IMAGE ? "image" : undefined,
      num: Math.min(request.limit || 10, 10),
      safe: request.safeSearch ? "high" : "medium",
    };

    const response = await firstValueFrom(
      this.httpService.get("https://www.googleapis.com/customsearch/v1", {
        params,
      }),
    );

    const results: MediaSearchResult[] = (response.data.items || []).map(
      (item: any) => ({
        id: item.cacheId || item.link,
        url: item.link,
        thumbnailUrl: item.pagemap?.cse_image?.[0]?.src,
        title: item.title,
        description: item.snippet,
        source: MediaSearchProvider.GOOGLE,
        metadata: {
          width: item.image?.width,
          height: item.image?.height,
          fileSize: item.image?.byteSize,
          tags: item.pagemap?.metatags?.[0]?.keywords?.split(",") || [],
        },
      }),
    );

    return {
      results,
      totalResults:
        parseInt(response.data.searchInformation?.totalResults) || 0,
    };
  }

  /**
   * Search YouTube Data API
   */
  private async searchYouTube(request: MediaSearchRequest): Promise<{
    results: MediaSearchResult[];
    totalResults: number;
  }> {
    if (!this.youtubeApiKey) {
      throw new Error("YouTube API not configured");
    }

    const params = {
      key: this.youtubeApiKey,
      part: "snippet",
      type: "video",
      q: request.query,
      maxResults: Math.min(request.limit || 10, 25),
      safeSearch: request.safeSearch ? "strict" : "moderate",
    };

    const response = await firstValueFrom(
      this.httpService.get("https://www.googleapis.com/youtube/v3/search", {
        params,
      }),
    );

    const results: MediaSearchResult[] = (response.data.items || []).map(
      (item: any) => ({
        id: item.id.videoId,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnailUrl:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.default?.url,
        title: item.snippet.title,
        description: item.snippet.description,
        source: MediaSearchProvider.YOUTUBE,
        metadata: {
          width: 1280,
          height: 720,
          tags: item.snippet.tags || [],
          license: "youtube",
        },
      }),
    );

    return {
      results,
      totalResults: response.data.pageInfo?.totalResults || 0,
    };
  }

  /**
   * Search Bing Image Search
   */
  private async searchBing(request: MediaSearchRequest): Promise<{
    results: MediaSearchResult[];
    totalResults: number;
  }> {
    if (!this.bingApiKey) {
      throw new Error("Bing Search API not configured");
    }

    const headers = {
      "Ocp-Apim-Subscription-Key": this.bingApiKey,
    };

    const params = {
      q: request.query,
      count: Math.min(request.limit || 10, 35),
      safeSearch: request.safeSearch ? "Strict" : "Moderate",
    };

    const endpoint =
      request.mediaType === MediaType.IMAGE
        ? "https://api.bing.microsoft.com/v7.0/images/search"
        : "https://api.bing.microsoft.com/v7.0/search";

    const response = await firstValueFrom(
      this.httpService.get(endpoint, { headers, params }),
    );

    const items = response.data.value || [];
    const results: MediaSearchResult[] = items.map((item: any) => ({
      id: item.imageId || item.id,
      url: item.contentUrl || item.url,
      thumbnailUrl: item.thumbnailUrl,
      title: item.name,
      description: item.snippet || item.description,
      source: MediaSearchProvider.BING,
      metadata: {
        width: item.width,
        height: item.height,
        fileSize: item.contentSize,
        license: item.licenseType,
      },
    }));

    return {
      results,
      totalResults: response.data.totalEstimatedMatches || 0,
    };
  }

  /**
   * Search Pexels API
   */
  private async searchPexels(request: MediaSearchRequest): Promise<{
    results: MediaSearchResult[];
    totalResults: number;
  }> {
    if (!this.pexelsApiKey) {
      throw new Error("Pexels API not configured");
    }

    const headers = {
      Authorization: this.pexelsApiKey,
    };

    const params = {
      query: request.query,
      per_page: Math.min(request.limit || 10, 80),
    };

    const endpoint =
      request.mediaType === MediaType.VIDEO
        ? "https://api.pexels.com/videos/search"
        : "https://api.pexels.com/v1/search";

    const response = await firstValueFrom(
      this.httpService.get(endpoint, { headers, params }),
    );

    const items =
      request.mediaType === MediaType.VIDEO
        ? response.data.videos || []
        : response.data.photos || [];

    const results: MediaSearchResult[] = items.map((item: any) => ({
      id: item.id.toString(),
      url:
        request.mediaType === MediaType.VIDEO
          ? item.video_files?.[0]?.link
          : item.src?.original,
      thumbnailUrl:
        request.mediaType === MediaType.VIDEO ? item.image : item.src?.medium,
      title: item.alt || `Pexels ${request.mediaType}`,
      description: item.alt,
      source: MediaSearchProvider.PEXELS,
      metadata: {
        width: item.width,
        height: item.height,
        duration: item.duration,
        license: "pexels",
        attribution: item.photographer,
      },
    }));

    return {
      results,
      totalResults: response.data.total_results || 0,
    };
  }

  /**
   * Search Unsplash API
   */
  private async searchUnsplash(request: MediaSearchRequest): Promise<{
    results: MediaSearchResult[];
    totalResults: number;
  }> {
    if (!this.unsplashApiKey) {
      throw new Error("Unsplash API not configured");
    }

    const headers = {
      Authorization: `Client-ID ${this.unsplashApiKey}`,
    };

    const params = {
      query: request.query,
      per_page: Math.min(request.limit || 10, 30),
    };

    const response = await firstValueFrom(
      this.httpService.get("https://api.unsplash.com/search/photos", {
        headers,
        params,
      }),
    );

    const results: MediaSearchResult[] = (response.data.results || []).map(
      (item: any) => ({
        id: item.id,
        url: item.urls?.full || item.urls?.regular,
        thumbnailUrl: item.urls?.thumb,
        title: item.description || item.alt_description,
        description: item.description,
        source: MediaSearchProvider.UNSPLASH,
        metadata: {
          width: item.width,
          height: item.height,
          license: "unsplash",
          attribution: item.user?.name,
          tags: item.tags?.map((tag: any) => tag.title) || [],
        },
      }),
    );

    return {
      results,
      totalResults: response.data.total || 0,
    };
  }

  /**
   * Select providers based on media type and availability
   */
  private selectProvidersForMediaType(
    mediaType: MediaType,
  ): MediaSearchProvider[] {
    const providers = {
      [MediaType.IMAGE]: [
        MediaSearchProvider.PEXELS,
        MediaSearchProvider.UNSPLASH,
        MediaSearchProvider.BING,
        MediaSearchProvider.GOOGLE,
      ],
      [MediaType.VIDEO]: [
        MediaSearchProvider.PEXELS,
        MediaSearchProvider.YOUTUBE,
        MediaSearchProvider.BING,
      ],
      [MediaType.AUDIO]: [MediaSearchProvider.GOOGLE, MediaSearchProvider.BING],
      [MediaType.DOCUMENT]: [
        MediaSearchProvider.GOOGLE,
        MediaSearchProvider.BING,
      ],
    };

    return providers[mediaType] || [MediaSearchProvider.GOOGLE];
  }

  /**
   * Search specific provider
   */
  private async searchProvider(
    provider: MediaSearchProvider,
    request: MediaSearchRequest,
  ): Promise<{ results: MediaSearchResult[]; totalResults: number }> {
    switch (provider) {
      case MediaSearchProvider.GOOGLE:
        return this.searchGoogle(request);
      case MediaSearchProvider.YOUTUBE:
        return this.searchYouTube(request);
      case MediaSearchProvider.BING:
        return this.searchBing(request);
      case MediaSearchProvider.PEXELS:
        return this.searchPexels(request);
      case MediaSearchProvider.UNSPLASH:
        return this.searchUnsplash(request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Validate search request
   */
  private async validateSearchRequest(
    request: MediaSearchRequest,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId: request.organizationId },
    });

    if (!subscription) {
      throw new BadRequestException("No subscription found");
    }

    // Check if external media search is allowed
    const tierLimit = this.tierLimits[subscription.plan];
    if (tierLimit === 0) {
      throw new BadRequestException(
        `External media search not available for ${subscription.plan} plan`,
      );
    }

    // Check daily usage limit
    const dailyUsage = await this.getDailySearchUsage(request.organizationId);
    if (dailyUsage >= tierLimit) {
      throw new BadRequestException(
        `Daily search limit exceeded (${tierLimit} searches)`,
      );
    }
  }

  /**
   * Check if quota is available for provider
   */
  private async checkQuotaAvailable(
    provider: MediaSearchProvider,
  ): Promise<boolean> {
    const today = new Date().toISOString().split("T")[0];
    const usageKey = `quota:${provider}:${today}`;
    const usage = await this.redis.get(usageKey);
    const dailyLimit = this.quotaLimits[provider];

    return !usage || parseInt(usage) < dailyLimit;
  }

  /**
   * Filter and validate search results
   */
  private async filterAndValidateResults(
    results: MediaSearchResult[],
    request: MediaSearchRequest,
  ): Promise<MediaSearchResult[]> {
    // Content safety filtering
    if (request.safeSearch) {
      results = results.filter((result) => this.isSafeContent(result));
    }

    // Deduplication
    const seen = new Set();
    results = results.filter((result) => {
      const key = result.url || result.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Validate URLs
    const validResults: MediaSearchResult[] = [];
    for (const result of results) {
      if (await this.validateUrl(result.url)) {
        validResults.push(result);
      }
    }

    return validResults.slice(0, request.limit || 10);
  }

  /**
   * Content safety check (simplified)
   */
  private isSafeContent(result: MediaSearchResult): boolean {
    const unsafeKeywords = ["adult", "explicit", "nsfw"];
    const text = `${result.title} ${result.description}`.toLowerCase();
    return !unsafeKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Validate URL accessibility
   */
  private async validateUrl(url: string): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.head(url, { timeout: 5000 }),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Cache management
   */
  private generateCacheKey(request: MediaSearchRequest): string {
    return `search:${request.mediaType}:${Buffer.from(request.query).toString("base64")}`;
  }

  private async getCachedResults(
    cacheKey: string,
  ): Promise<SearchResponse | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheResults(
    cacheKey: string,
    response: SearchResponse,
  ): Promise<void> {
    try {
      await this.redis.setex(cacheKey, 3600, JSON.stringify(response)); // Cache for 1 hour
    } catch (error) {
      this.logger.warn(`Failed to cache results: ${error.message}`);
    }
  }

  /**
   * Get daily search usage for organization
   */
  private async getDailySearchUsage(organizationId: string): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const metric = await this.usageMetricRepository.findOne({
      where: {
        organizationId,
        type: UsageMetricType.API_REQUESTS,
        date: today,
      },
    });

    return metric?.value || 0;
  }

  /**
   * Get recent searches for suggestions
   */
  private async getRecentSearches(
    organizationId: string,
    mediaType: MediaType,
  ): Promise<string[]> {
    const key = `recent_searches:${organizationId}:${mediaType}`;
    try {
      const searches = await this.redis.lrange(key, 0, 10);
      return searches;
    } catch {
      return [];
    }
  }

  /**
   * Get common suggestions based on media type
   */
  private getCommonSuggestions(mediaType: MediaType, query: string): string[] {
    const commonSuggestions = {
      [MediaType.IMAGE]: [
        "professional photos",
        "stock images",
        "business graphics",
        "nature photography",
      ],
      [MediaType.VIDEO]: [
        "promotional videos",
        "explainer videos",
        "product demos",
        "testimonials",
      ],
      [MediaType.AUDIO]: [
        "background music",
        "sound effects",
        "voice overs",
        "podcasts",
      ],
      [MediaType.DOCUMENT]: ["templates", "presentations", "reports", "guides"],
    };

    return commonSuggestions[mediaType] || [];
  }

  /**
   * Infer media type from URL
   */
  private inferMediaType(url: string): MediaType {
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const videoExts = [".mp4", ".avi", ".mov", ".wmv", ".webm"];
    const audioExts = [".mp3", ".wav", ".ogg", ".m4a"];

    const lowerUrl = url.toLowerCase();

    if (imageExts.some((ext) => lowerUrl.includes(ext))) return MediaType.IMAGE;
    if (videoExts.some((ext) => lowerUrl.includes(ext))) return MediaType.VIDEO;
    if (audioExts.some((ext) => lowerUrl.includes(ext))) return MediaType.AUDIO;

    return MediaType.DOCUMENT;
  }

  /**
   * Record search usage metrics
   */
  private async recordSearchUsage(
    organizationId: string,
    provider: MediaSearchProvider,
    quotaUsed: number,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Record organization usage
    await this.usageMetricRepository.upsert(
      {
        organizationId,
        type: UsageMetricType.API_REQUESTS,
        date: today,
        value: 1,
        metadata: {},
      },
      ["organizationId", "type", "date"],
    );

    // Record provider quota usage
    if (quotaUsed > 0) {
      const usageKey = `quota:${provider}:${today}`;
      await this.redis.incr(usageKey);
      await this.redis.expire(usageKey, 86400); // Expire in 24 hours
    }
  }

  /**
   * Record storage usage
   */
  private async recordStorageUsage(
    organizationId: string,
    sizeChange: number,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    await this.usageMetricRepository.upsert(
      {
        organizationId,
        type: UsageMetricType.STORAGE_USED,
        date: today,
        value: sizeChange,
        metadata: {},
      },
      ["organizationId", "type", "date"],
    );
  }
}
