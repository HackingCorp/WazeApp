import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Repository } from "typeorm";
import { Queue } from "bull";
import { ConfigService } from "@nestjs/config";
import * as sharp from "sharp";
import * as ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs/promises";
import {
  MediaAsset,
  Organization,
  Subscription,
  UsageMetric,
} from "../../../common/entities";
import {
  MediaType,
  MediaQuality,
  SubscriptionPlan,
  UsageMetricType,
} from "../../../common/enums";

export interface MediaUploadOptions {
  organizationId: string;
  userId?: string;
  tags?: string[];
  altText?: string;
  isTemplate?: boolean;
  quality?: MediaQuality;
  generateVariants?: boolean;
}

export interface MediaProcessingJob {
  assetId: string;
  originalPath: string;
  organizationId: string;
  generateThumbnail: boolean;
  generateVariants: boolean;
  optimizeBandwidth: boolean;
}

export interface MediaUploadResult {
  asset: MediaAsset;
  uploadUrl?: string;
  thumbnailUrl?: string;
  variants?: Record<MediaQuality, string>;
}

@Injectable()
export class MediaHandlingService {
  private readonly logger = new Logger(MediaHandlingService.name);
  private readonly uploadPath: string;
  private readonly maxFileSize: Record<SubscriptionPlan, number>;
  private readonly allowedTypes: Record<SubscriptionPlan, MediaType[]>;

  constructor(
    @InjectRepository(MediaAsset)
    private mediaRepository: Repository<MediaAsset>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    @InjectQueue("media-processing")
    private mediaQueue: Queue,
    private configService: ConfigService,
  ) {
    this.uploadPath = this.configService.get("UPLOAD_PATH", "./uploads");

    // File size limits by subscription tier (in bytes)
    this.maxFileSize = {
      [SubscriptionPlan.FREE]: 0, // No media for free tier
      [SubscriptionPlan.STANDARD]: 10 * 1024 * 1024, // 10MB
      [SubscriptionPlan.PRO]: 50 * 1024 * 1024, // 50MB
      [SubscriptionPlan.ENTERPRISE]: 200 * 1024 * 1024, // 200MB
    };

    // Allowed media types by subscription tier
    this.allowedTypes = {
      [SubscriptionPlan.FREE]: [], // No media for free tier
      [SubscriptionPlan.STANDARD]: [MediaType.IMAGE, MediaType.DOCUMENT],
      [SubscriptionPlan.PRO]: [
        MediaType.IMAGE,
        MediaType.DOCUMENT,
        MediaType.AUDIO,
      ],
      [SubscriptionPlan.ENTERPRISE]: [
        MediaType.IMAGE,
        MediaType.VIDEO,
        MediaType.AUDIO,
        MediaType.DOCUMENT,
      ],
    };
  }

  /**
   * Upload and process media file
   */
  async uploadMedia(
    file: Express.Multer.File,
    options: MediaUploadOptions,
  ): Promise<MediaUploadResult> {
    this.logger.log(`Uploading media file: ${file.originalname}`);

    // Validate subscription and file
    await this.validateUpload(file, options.organizationId);

    // Determine media type
    const mediaType = this.determineMediaType(file.mimetype);

    // Generate unique filename
    const fileName = this.generateFileName(file.originalname);
    const storagePath = path.join(
      this.uploadPath,
      options.organizationId,
      fileName,
    );

    // Ensure directory exists
    await this.ensureDirectoryExists(path.dirname(storagePath));

    // Save file
    await fs.writeFile(storagePath, file.buffer);

    // Get file dimensions for images/videos
    const dimensions = await this.getMediaDimensions(storagePath, mediaType);

    // Create media asset record
    const asset = this.mediaRepository.create({
      filename: file.originalname,
      mediaType,
      fileSize: file.size,
      mimeType: file.mimetype,
      storagePath,
      dimensions,
      tags: options.tags || [],
      altText: options.altText,
      isTemplate: options.isTemplate || false,
      organizationId: options.organizationId,
      qualityVariants: {},
      metadata: {
        source: "upload",
        attribution: file.originalname,
      },
    });

    const savedAsset = (await this.mediaRepository.save(asset)) as MediaAsset;

    // Queue for processing
    if (options.generateVariants !== false) {
      await this.queueMediaProcessing({
        assetId: savedAsset.id,
        originalPath: storagePath,
        organizationId: options.organizationId,
        generateThumbnail: true,
        generateVariants: true,
        optimizeBandwidth: await this.shouldOptimizeBandwidth(
          options.organizationId,
        ),
      });
    }

    // Record usage metrics
    await this.recordStorageUsage(options.organizationId, file.size);

    return {
      asset: savedAsset,
      uploadUrl: await this.generateAccessUrl(savedAsset),
    };
  }

  /**
   * Process media file (called by queue processor)
   */
  async processMedia(job: MediaProcessingJob): Promise<void> {
    this.logger.log(`Processing media asset: ${job.assetId}`);

    const asset = await this.mediaRepository.findOne({
      where: { id: job.assetId },
    });

    if (!asset) {
      throw new Error(`Media asset not found: ${job.assetId}`);
    }

    try {
      const updates: Partial<MediaAsset> = {};

      // Generate thumbnail
      if (job.generateThumbnail) {
        const thumbnailUrl = await this.generateThumbnail(asset);
        if (thumbnailUrl) {
          updates.thumbnailUrl = thumbnailUrl;
        }
      }

      // Generate quality variants
      if (job.generateVariants) {
        const variants = await this.generateQualityVariants(
          asset,
          job.optimizeBandwidth,
        );
        updates.qualityVariants = variants;
      }

      // Update CDN URL if available
      updates.cdnUrl = await this.uploadToCDN(asset);

      // Save updates
      await this.mediaRepository.update(asset.id, updates);

      this.logger.log(`Media processing completed: ${job.assetId}`);
    } catch (error) {
      this.logger.error(
        `Media processing failed: ${error.message}`,
        error.stack,
      );

      // Update metadata with error
      await this.mediaRepository.update(job.assetId, {
        metadata: {
          ...asset.metadata,
          source: "processing_failed",
          attribution: `Failed: ${error.message}`,
        },
      });

      throw error;
    }
  }

  /**
   * Get media gallery for organization
   */
  async getMediaGallery(
    organizationId: string,
    filters?: {
      mediaType?: MediaType;
      tags?: string[];
      isTemplate?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    assets: MediaAsset[];
    total: number;
    totalSize: number;
  }> {
    const queryBuilder = this.mediaRepository
      .createQueryBuilder("media")
      .where("media.organizationId = :organizationId", { organizationId });

    if (filters?.mediaType) {
      queryBuilder.andWhere("media.mediaType = :mediaType", {
        mediaType: filters.mediaType,
      });
    }

    if (filters?.tags && filters.tags.length > 0) {
      queryBuilder.andWhere("media.tags && :tags", { tags: filters.tags });
    }

    if (filters?.isTemplate !== undefined) {
      queryBuilder.andWhere("media.isTemplate = :isTemplate", {
        isTemplate: filters.isTemplate,
      });
    }

    // Get total count and size
    const [assets, total] = await queryBuilder
      .orderBy("media.createdAt", "DESC")
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0)
      .getManyAndCount();

    // Calculate total storage size
    const sizeResult = await this.mediaRepository
      .createQueryBuilder("media")
      .where("media.organizationId = :organizationId", { organizationId })
      .select("SUM(media.fileSize)", "totalSize")
      .getRawOne();

    return {
      assets,
      total,
      totalSize: parseInt(sizeResult.totalSize) || 0,
    };
  }

  /**
   * Delete media asset
   */
  async deleteMedia(assetId: string, organizationId: string): Promise<void> {
    const asset = await this.mediaRepository.findOne({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new Error("Media asset not found");
    }

    try {
      // Delete files from storage
      await this.deleteFiles(asset);

      // Remove from CDN if exists
      if (asset.cdnUrl) {
        await this.removeFromCDN(asset.cdnUrl);
      }

      // Delete from database
      await this.mediaRepository.delete(assetId);

      // Update usage metrics
      await this.recordStorageUsage(organizationId, -asset.fileSize);

      this.logger.log(`Media asset deleted: ${assetId}`);
    } catch (error) {
      this.logger.error(`Failed to delete media asset: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get quick response templates
   */
  async getQuickResponseTemplates(
    organizationId: string,
  ): Promise<MediaAsset[]> {
    return this.mediaRepository.find({
      where: {
        organizationId,
        isTemplate: true,
      },
      order: { usageCount: "DESC" },
      take: 20,
    });
  }

  /**
   * Record media usage
   */
  async recordUsage(assetId: string): Promise<void> {
    await this.mediaRepository.update(assetId, {
      usageCount: () => "usageCount + 1",
      lastUsedAt: new Date(),
    });
  }

  /**
   * Validate upload permissions and limits
   */
  private async validateUpload(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      throw new BadRequestException("No subscription found");
    }

    // Check if media is allowed for this tier
    const mediaType = this.determineMediaType(file.mimetype);
    const allowedTypes = this.allowedTypes[subscription.plan];

    if (!allowedTypes.includes(mediaType)) {
      throw new BadRequestException(
        `Media type ${mediaType} not allowed for ${subscription.plan} plan`,
      );
    }

    // Check file size limits
    const maxSize = this.maxFileSize[subscription.plan];
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds limit of ${maxSize / (1024 * 1024)}MB`,
      );
    }

    // Check storage quota
    const currentUsage = await this.getCurrentStorageUsage(organizationId);
    const storageLimit = subscription.limits.maxStorageBytes;

    if (currentUsage + file.size > storageLimit) {
      throw new BadRequestException("Storage quota exceeded");
    }
  }

  /**
   * Determine media type from MIME type
   */
  private determineMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith("image/")) return MediaType.IMAGE;
    if (mimeType.startsWith("video/")) return MediaType.VIDEO;
    if (mimeType.startsWith("audio/")) return MediaType.AUDIO;
    return MediaType.DOCUMENT;
  }

  /**
   * Generate unique filename
   */
  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extension = path.extname(originalName);
    return `${timestamp}_${random}${extension}`;
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get media dimensions
   */
  private async getMediaDimensions(
    filePath: string,
    mediaType: MediaType,
  ): Promise<MediaAsset["dimensions"]> {
    try {
      if (mediaType === MediaType.IMAGE) {
        const metadata = await sharp(filePath).metadata();
        return {
          width: metadata.width || 0,
          height: metadata.height || 0,
        };
      }

      if (mediaType === MediaType.VIDEO) {
        return new Promise((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              resolve({ width: 0, height: 0, duration: 0 });
              return;
            }

            const videoStream = metadata.streams.find(
              (s) => s.codec_type === "video",
            );
            resolve({
              width: videoStream?.width || 0,
              height: videoStream?.height || 0,
              duration: metadata.format?.duration || 0,
            });
          });
        });
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get media dimensions: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate thumbnail for media
   */
  private async generateThumbnail(asset: MediaAsset): Promise<string | null> {
    const thumbnailDir = path.join(
      path.dirname(asset.storagePath),
      "thumbnails",
    );
    await this.ensureDirectoryExists(thumbnailDir);

    const thumbnailPath = path.join(
      thumbnailDir,
      `thumb_${path.basename(asset.storagePath, path.extname(asset.storagePath))}.jpg`,
    );

    try {
      if (asset.mediaType === MediaType.IMAGE) {
        await sharp(asset.storagePath)
          .resize(300, 300, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);
      } else if (asset.mediaType === MediaType.VIDEO) {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(asset.storagePath)
            .screenshots({
              timestamps: ["00:00:01.000"],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: "300x300",
            })
            .on("end", () => resolve())
            .on("error", reject);
        });
      }

      return await this.generateAccessUrl({
        storagePath: thumbnailPath,
      } as MediaAsset);
    } catch (error) {
      this.logger.warn(`Failed to generate thumbnail: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate quality variants
   */
  private async generateQualityVariants(
    asset: MediaAsset,
    optimizeBandwidth: boolean,
  ): Promise<Record<MediaQuality, any>> {
    const variants: Record<MediaQuality, any> = {
      [MediaQuality.LOW]: null,
      [MediaQuality.MEDIUM]: null,
      [MediaQuality.HIGH]: null,
      [MediaQuality.ORIGINAL]: null,
    };

    if (asset.mediaType !== MediaType.IMAGE) {
      return variants;
    }

    const qualities = optimizeBandwidth
      ? [MediaQuality.LOW, MediaQuality.MEDIUM, MediaQuality.HIGH]
      : [MediaQuality.HIGH];

    const variantDir = path.join(path.dirname(asset.storagePath), "variants");
    await this.ensureDirectoryExists(variantDir);

    for (const quality of qualities) {
      try {
        const { size, quality: jpegQuality } = this.getQualitySettings(quality);
        const variantPath = path.join(
          variantDir,
          `${quality}_${path.basename(asset.storagePath)}`,
        );

        const info = await sharp(asset.storagePath)
          .resize(size, size, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: jpegQuality })
          .toFile(variantPath);

        variants[quality] = {
          url: await this.generateAccessUrl({
            storagePath: variantPath,
          } as MediaAsset),
          size: info.size,
          width: info.width,
          height: info.height,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to generate ${quality} variant: ${error.message}`,
        );
      }
    }

    return variants;
  }

  /**
   * Get quality settings for image processing
   */
  private getQualitySettings(quality: MediaQuality): {
    size: number;
    quality: number;
  } {
    const settings = {
      [MediaQuality.LOW]: { size: 400, quality: 60 },
      [MediaQuality.MEDIUM]: { size: 800, quality: 75 },
      [MediaQuality.HIGH]: { size: 1200, quality: 85 },
      [MediaQuality.ORIGINAL]: { size: 2400, quality: 95 },
    };
    return settings[quality];
  }

  /**
   * Queue media processing job
   */
  private async queueMediaProcessing(job: MediaProcessingJob): Promise<void> {
    await this.mediaQueue.add("process-media", job, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });
  }

  /**
   * Check if should optimize bandwidth for organization
   */
  private async shouldOptimizeBandwidth(
    organizationId: string,
  ): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    // Only Pro and Enterprise get web fallback optimization
    return (
      subscription?.plan === SubscriptionPlan.PRO ||
      subscription?.plan === SubscriptionPlan.ENTERPRISE
    );
  }

  /**
   * Generate access URL for media (mock implementation)
   */
  private async generateAccessUrl(asset: MediaAsset): Promise<string> {
    // In production, this would generate signed URLs for S3/CDN
    const relativePath = asset.storagePath.replace(this.uploadPath, "");
    return `${this.configService.get("APP_URL")}/media${relativePath}`;
  }

  /**
   * Upload to CDN (mock implementation)
   */
  private async uploadToCDN(asset: MediaAsset): Promise<string | null> {
    // In production, implement CDN upload (CloudFlare/Bunny)
    return null;
  }

  /**
   * Remove from CDN (mock implementation)
   */
  private async removeFromCDN(cdnUrl: string): Promise<void> {
    // In production, implement CDN removal
  }

  /**
   * Delete files from storage
   */
  private async deleteFiles(asset: MediaAsset): Promise<void> {
    try {
      await fs.unlink(asset.storagePath);

      if (asset.thumbnailUrl) {
        // Delete thumbnail files
        const thumbnailDir = path.join(
          path.dirname(asset.storagePath),
          "thumbnails",
        );
        const files = await fs.readdir(thumbnailDir);
        const thumbFiles = files.filter((f) =>
          f.includes(
            path.basename(asset.storagePath, path.extname(asset.storagePath)),
          ),
        );

        for (const file of thumbFiles) {
          await fs.unlink(path.join(thumbnailDir, file));
        }
      }

      // Delete variant files
      const variantDir = path.join(path.dirname(asset.storagePath), "variants");
      try {
        const files = await fs.readdir(variantDir);
        const variantFiles = files.filter((f) =>
          f.includes(path.basename(asset.storagePath)),
        );

        for (const file of variantFiles) {
          await fs.unlink(path.join(variantDir, file));
        }
      } catch {
        // Variant directory might not exist
      }
    } catch (error) {
      this.logger.warn(`Failed to delete some files: ${error.message}`);
    }
  }

  /**
   * Get current storage usage
   */
  private async getCurrentStorageUsage(
    organizationId: string,
  ): Promise<number> {
    const result = await this.mediaRepository
      .createQueryBuilder("media")
      .where("media.organizationId = :organizationId", { organizationId })
      .select("SUM(media.fileSize)", "totalSize")
      .getRawOne();

    return parseInt(result.totalSize) || 0;
  }

  /**
   * Record storage usage metrics
   */
  private async recordStorageUsage(
    organizationId: string,
    sizeChange: number,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    try {
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
    } catch (error) {
      this.logger.warn(`Failed to record storage usage: ${error.message}`);
    }
  }
}
