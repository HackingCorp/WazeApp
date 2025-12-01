import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import * as AWS from "aws-sdk";

export interface CDNUploadOptions {
  filePath: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

export interface CDNUploadResult {
  url: string;
  cdnUrl: string;
  publicId: string;
  size: number;
}

@Injectable()
export class CDNService {
  private readonly logger = new Logger(CDNService.name);
  private readonly provider: "cloudflare" | "bunny" | "s3" | "local";

  // Cloudflare R2 configuration
  private r2Client?: AWS.S3;

  // Bunny CDN configuration
  private bunnyApiKey?: string;
  private bunnyStorageZone?: string;
  private bunnyPullZoneUrl?: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    // Determine CDN provider based on configuration
    this.provider = this.determineCDNProvider();
    this.initializeCDN();
  }

  /**
   * Upload file to CDN
   */
  async uploadFile(options: CDNUploadOptions): Promise<CDNUploadResult> {
    this.logger.log(`Uploading file to CDN: ${options.fileName}`);

    switch (this.provider) {
      case "cloudflare":
        return this.uploadToCloudflareR2(options);
      case "bunny":
        return this.uploadToBunnyCDN(options);
      case "s3":
        return this.uploadToS3(options);
      default:
        return this.uploadToLocal(options);
    }
  }

  /**
   * Delete file from CDN
   */
  async deleteFile(publicId: string): Promise<void> {
    this.logger.log(`Deleting file from CDN: ${publicId}`);

    switch (this.provider) {
      case "cloudflare":
        return this.deleteFromCloudflareR2(publicId);
      case "bunny":
        return this.deleteFromBunnyCDN(publicId);
      case "s3":
        return this.deleteFromS3(publicId);
      default:
        return this.deleteFromLocal(publicId);
    }
  }

  /**
   * Generate optimized URLs for different quality levels
   */
  generateOptimizedUrls(
    baseUrl: string,
    fileName: string,
  ): Record<string, string> {
    const urls: Record<string, string> = {
      original: baseUrl,
    };

    switch (this.provider) {
      case "cloudflare":
        // Cloudflare Image Resizing
        const cfBaseUrl = baseUrl.replace("/uploads/", "/cdn-cgi/image/");
        urls.thumbnail = `${cfBaseUrl}width=300,height=300,fit=cover/${fileName}`;
        urls.small = `${cfBaseUrl}width=600,height=600,fit=cover/${fileName}`;
        urls.medium = `${cfBaseUrl}width=1200,height=1200,fit=cover/${fileName}`;
        urls.large = `${cfBaseUrl}width=1920,height=1920,fit=cover/${fileName}`;
        break;

      case "bunny":
        // Bunny Optimizer
        const bunnyBase = baseUrl.replace(".b-cdn.net", ".b-cdn.net");
        urls.thumbnail = `${bunnyBase}?width=300&height=300&crop=true`;
        urls.small = `${bunnyBase}?width=600&height=600&crop=true`;
        urls.medium = `${bunnyBase}?width=1200&height=1200&crop=true`;
        urls.large = `${bunnyBase}?width=1920&height=1920&crop=true`;
        break;

      default:
        // Local variants (generated during processing)
        const basePath = baseUrl.replace(/\/[^/]+$/, "");
        urls.thumbnail = `${basePath}/variants/thumbnail_${fileName}`;
        urls.small = `${basePath}/variants/small_${fileName}`;
        urls.medium = `${basePath}/variants/medium_${fileName}`;
        urls.large = `${basePath}/variants/large_${fileName}`;
    }

    return urls;
  }

  /**
   * Determine CDN provider based on configuration
   */
  private determineCDNProvider(): "cloudflare" | "bunny" | "s3" | "local" {
    if (this.configService.get("CLOUDFLARE_R2_ACCESS_KEY_ID")) {
      return "cloudflare";
    }
    if (this.configService.get("BUNNY_CDN_API_KEY")) {
      return "bunny";
    }
    if (this.configService.get("AWS_ACCESS_KEY_ID")) {
      return "s3";
    }
    return "local";
  }

  /**
   * Initialize CDN configuration
   */
  private initializeCDN(): void {
    switch (this.provider) {
      case "cloudflare":
        this.initializeCloudflareR2();
        break;
      case "bunny":
        this.initializeBunnyCDN();
        break;
      case "s3":
        this.initializeS3();
        break;
    }

    this.logger.log(`Initialized CDN provider: ${this.provider}`);
  }

  /**
   * Initialize Cloudflare R2
   */
  private initializeCloudflareR2(): void {
    const accessKeyId = this.configService.get("CLOUDFLARE_R2_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get(
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    );
    const accountId = this.configService.get("CLOUDFLARE_ACCOUNT_ID");

    if (!accessKeyId || !secretAccessKey || !accountId) {
      throw new Error("Missing Cloudflare R2 configuration");
    }

    this.r2Client = new AWS.S3({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      accessKeyId,
      secretAccessKey,
      region: "auto",
      signatureVersion: "v4",
    });
  }

  /**
   * Initialize Bunny CDN
   */
  private initializeBunnyCDN(): void {
    this.bunnyApiKey = this.configService.get("BUNNY_CDN_API_KEY");
    this.bunnyStorageZone = this.configService.get(
      "BUNNY_CDN_STORAGE_ZONE_NAME",
    );
    this.bunnyPullZoneUrl = this.configService.get("BUNNY_CDN_PULLZONE_URL");

    if (!this.bunnyApiKey || !this.bunnyStorageZone) {
      throw new Error("Missing Bunny CDN configuration");
    }
  }

  /**
   * Initialize AWS S3
   */
  private initializeS3(): void {
    // AWS SDK automatically picks up environment variables
    // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
  }

  /**
   * Upload to Cloudflare R2
   */
  private async uploadToCloudflareR2(
    options: CDNUploadOptions,
  ): Promise<CDNUploadResult> {
    const bucket = this.configService.get("CLOUDFLARE_R2_BUCKET");
    const key = `media/${Date.now()}_${options.fileName}`;

    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: bucket,
      Key: key,
      Body: options.buffer,
      ContentType: options.contentType,
      ACL: "public-read",
    };

    const result = await this.r2Client!.upload(uploadParams).promise();
    const cdnUrl = `https://cdn.${this.configService.get("APP_DOMAIN")}/${key}`;

    return {
      url: result.Location,
      cdnUrl,
      publicId: key,
      size: options.buffer.length,
    };
  }

  /**
   * Upload to Bunny CDN
   */
  private async uploadToBunnyCDN(
    options: CDNUploadOptions,
  ): Promise<CDNUploadResult> {
    const fileName = `media/${Date.now()}_${options.fileName}`;
    const uploadUrl = `https://storage.bunnycdn.com/${this.bunnyStorageZone}/${fileName}`;

    const response = await firstValueFrom(
      this.httpService.put(uploadUrl, options.buffer, {
        headers: {
          AccessKey: this.bunnyApiKey!,
          "Content-Type": options.contentType,
        },
      }),
    );

    if (response.status !== 201) {
      throw new Error(`Bunny CDN upload failed: ${response.statusText}`);
    }

    const cdnUrl = `${this.bunnyPullZoneUrl}/${fileName}`;

    return {
      url: uploadUrl,
      cdnUrl,
      publicId: fileName,
      size: options.buffer.length,
    };
  }

  /**
   * Upload to AWS S3
   */
  private async uploadToS3(
    options: CDNUploadOptions,
  ): Promise<CDNUploadResult> {
    const s3 = new AWS.S3();
    const bucket = this.configService.get("AWS_S3_BUCKET");
    const key = `media/${Date.now()}_${options.fileName}`;

    const uploadParams: AWS.S3.PutObjectRequest = {
      Bucket: bucket,
      Key: key,
      Body: options.buffer,
      ContentType: options.contentType,
      ACL: "public-read",
    };

    const result = await s3.upload(uploadParams).promise();

    return {
      url: result.Location,
      cdnUrl: result.Location,
      publicId: key,
      size: options.buffer.length,
    };
  }

  /**
   * Upload to local storage (fallback)
   */
  private async uploadToLocal(
    options: CDNUploadOptions,
  ): Promise<CDNUploadResult> {
    const uploadDir = this.configService.get("UPLOAD_PATH", "./uploads");
    const fileName = `${Date.now()}_${options.fileName}`;
    const filePath = `${uploadDir}/${fileName}`;
    const url = `${this.configService.get("APP_URL")}/uploads/${fileName}`;

    // This would be handled by the media-handling service
    return {
      url,
      cdnUrl: url,
      publicId: fileName,
      size: options.buffer.length,
    };
  }

  /**
   * Delete from Cloudflare R2
   */
  private async deleteFromCloudflareR2(publicId: string): Promise<void> {
    const bucket = this.configService.get("CLOUDFLARE_R2_BUCKET");

    await this.r2Client!.deleteObject({
      Bucket: bucket,
      Key: publicId,
    }).promise();
  }

  /**
   * Delete from Bunny CDN
   */
  private async deleteFromBunnyCDN(publicId: string): Promise<void> {
    const deleteUrl = `https://storage.bunnycdn.com/${this.bunnyStorageZone}/${publicId}`;

    await firstValueFrom(
      this.httpService.delete(deleteUrl, {
        headers: {
          AccessKey: this.bunnyApiKey!,
        },
      }),
    );
  }

  /**
   * Delete from AWS S3
   */
  private async deleteFromS3(publicId: string): Promise<void> {
    const s3 = new AWS.S3();
    const bucket = this.configService.get("AWS_S3_BUCKET");

    await s3
      .deleteObject({
        Bucket: bucket,
        Key: publicId,
      })
      .promise();
  }

  /**
   * Delete from local storage
   */
  private async deleteFromLocal(publicId: string): Promise<void> {
    // This would be handled by the media-handling service
    this.logger.log(`Would delete local file: ${publicId}`);
  }

  /**
   * Get CDN provider info
   */
  getCDNInfo(): { provider: string; configured: boolean; features: string[] } {
    const features = ["upload", "delete"];

    switch (this.provider) {
      case "cloudflare":
        features.push("image_resizing", "global_distribution", "analytics");
        break;
      case "bunny":
        features.push("image_optimization", "video_streaming", "edge_storage");
        break;
      case "s3":
        features.push(
          "versioning",
          "lifecycle_policies",
          "cross_region_replication",
        );
        break;
      default:
        features.push("local_storage");
    }

    return {
      provider: this.provider,
      configured: this.provider !== "local",
      features,
    };
  }
}
