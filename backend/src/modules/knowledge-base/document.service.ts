import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, In } from "typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import {
  KnowledgeDocument,
  DocumentChunk,
  KnowledgeBase,
  UsageMetric,
} from "../../common/entities";
import {
  DocumentType,
  DocumentStatus,
  UsageMetricType,
  AuditAction,
} from "../../common/enums";
import {
  UploadDocumentDto,
  UploadUrlDocumentDto,
  UploadMultipleUrlsDocumentDto,
  UpdateDocumentDto,
  DocumentQueryDto,
  DocumentSearchDto,
  DocumentStatsDto,
  CreateRichTextDocumentDto,
} from "./dto/document.dto";
import { AuditService } from "../audit/audit.service";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { WebScrapingService } from "./web-scraping.service";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

@Injectable()
export class DocumentService {
  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,

    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,

    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,

    @InjectRepository(UsageMetric)
    private readonly usageMetricRepository: Repository<UsageMetric>,

    @InjectQueue("document-processing")
    private readonly processingQueue: Queue,

    private readonly auditService: AuditService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly webScrapingService: WebScrapingService,
  ) {}

  async uploadFile(
    organizationId: string | null,
    userId: string,
    file: Express.Multer.File,
    uploadDto: UploadDocumentDto,
  ): Promise<KnowledgeDocument> {
    // Validate file size and type
    this.validateFile(file, uploadDto.type);

    // Check character limits before processing
    const estimatedChars = this.estimateCharacters(file, uploadDto.type);
    if (organizationId) {
      await this.knowledgeBaseService.checkCharacterLimit(
        organizationId,
        estimatedChars,
      );
    }

    // Generate unique filename and save file
    const fileExtension = path.extname(file.originalname);
    const filename = `${Date.now()}-${crypto.randomUUID()}${fileExtension}`;
    const filePath = path.join(process.cwd(), "uploads", "documents", filename);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    // Create document record
    const document = this.documentRepository.create({
      ...uploadDto,
      filename: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      filePath,
      uploadedBy: userId,
      knowledgeBaseId: uploadDto.knowledgeBaseId,
      metadata: {
        ...uploadDto.metadata,
        originalName: file.originalname,
        uploadedAt: new Date(),
      },
    });

    const saved = (await this.documentRepository.save(
      document,
    )) as KnowledgeDocument;

    // Queue for processing
    await this.processingQueue.add("process-document", {
      documentId: saved.id,
      organizationId,
      userId,
    });

    // Track usage only if organization exists
    if (organizationId) {
      await this.trackUsage(
        organizationId,
        UsageMetricType.STORAGE_USED,
        file.size,
      );
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "document",
      resourceId: saved.id,
      description: `Uploaded document: ${file.originalname}`,
      metadata: { filename: file.originalname, type: uploadDto.type },
    });

    return saved;
  }

  async uploadFromUrl(
    organizationId: string | null,
    userId: string,
    uploadDto: UploadUrlDocumentDto,
  ): Promise<KnowledgeDocument> {
    // Validate URL
    try {
      new URL(uploadDto.url);
    } catch {
      throw new BadRequestException("Invalid URL provided");
    }

    // Create document record
    const document = this.documentRepository.create({
      title: uploadDto.title,
      type: DocumentType.URL,
      filename: uploadDto.url,
      fileSize: 0,
      characterCount: 0,
      mimeType: "text/html",
      filePath: uploadDto.url,
      uploadedBy: userId,
      knowledgeBaseId: uploadDto.knowledgeBaseId,
      tags: uploadDto.tags,
      status: DocumentStatus.PENDING,
      metadata: {
        extractionMethod: "url_scraping",
      },
    });

    const saved = (await this.documentRepository.save(
      document,
    )) as KnowledgeDocument;

    // Queue for processing
    await this.processingQueue.add("process-document", {
      documentId: saved.id,
      organizationId,
      userId,
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "document",
      resourceId: saved.id,
      description: `Created document from URL: ${uploadDto.url}`,
      metadata: { url: uploadDto.url },
    });

    return saved;
  }

  async uploadFromMultipleUrls(
    organizationId: string | null,
    userId: string,
    uploadDto: UploadMultipleUrlsDocumentDto,
  ): Promise<{ documents: KnowledgeDocument[]; results: { url: string; success: boolean; error?: string }[] }> {
    // Validate all URLs
    const results: { url: string; success: boolean; error?: string }[] = [];
    const validUrls: string[] = [];

    for (const url of uploadDto.urls) {
      try {
        new URL(url);
        validUrls.push(url);
        results.push({ url, success: true });
      } catch (error) {
        results.push({ url, success: false, error: `Invalid URL: ${error.message}` });
      }
    }

    if (validUrls.length === 0) {
      throw new BadRequestException("No valid URLs provided");
    }

    // Create document records for all valid URLs
    const documents: KnowledgeDocument[] = [];
    
    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i];
      
      try {
        // Generate a unique title for each URL
        const urlObj = new URL(url);
        const urlTitle = `${uploadDto.baseTitle} - ${urlObj.hostname}${urlObj.pathname}`;
        
        const document = this.documentRepository.create({
          title: urlTitle,
          type: DocumentType.URL,
          filename: url,
          fileSize: 0,
          mimeType: "text/html",
          filePath: url,
          uploadedBy: userId,
          knowledgeBaseId: uploadDto.knowledgeBaseId,
          tags: uploadDto.tags,
          metadata: {
            extractionMethod: "url_scraping",
            batchUpload: true,
            batchIndex: i + 1,
            totalBatch: validUrls.length,
          } as any,
        });

        const saved = await this.documentRepository.save(document);
        documents.push(saved);

        // Queue each document for processing
        await this.processingQueue.add("process-document", {
          documentId: saved.id,
          organizationId,
          userId,
        });

        // Update success flag
        const resultIndex = results.findIndex(r => r.url === url);
        if (resultIndex >= 0) {
          results[resultIndex].success = true;
        }

      } catch (error) {
        // Update the result for this URL
        const resultIndex = results.findIndex(r => r.url === url);
        if (resultIndex >= 0) {
          results[resultIndex].success = false;
          results[resultIndex].error = `Failed to create document: ${error.message}`;
        }
      }
    }

    // Audit log for the batch upload
    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: "document",
      resourceId: documents.map(d => d.id).join(','),
      description: `Created ${documents.length} documents from multiple URLs`,
      metadata: { 
        urls: uploadDto.urls,
        successCount: documents.length,
        totalCount: uploadDto.urls.length 
      },
    });

    return { documents, results };
  }

  async createRichTextDocument(
    organizationId: string | null,
    userId: string,
    createDto: CreateRichTextDocumentDto,
  ): Promise<KnowledgeDocument> {
    // Validate knowledge base exists
    const knowledgeBase = await this.knowledgeBaseRepository.findOne({
      where: { id: createDto.knowledgeBaseId },
    });

    if (!knowledgeBase) {
      throw new NotFoundException("Knowledge base not found");
    }

    // Strip HTML tags to get text content for character count
    const textContent = createDto.content.replace(/<[^>]*>/g, '');
    const characterCount = textContent.length;

    // Check character limits
    if (organizationId) {
      await this.knowledgeBaseService.checkCharacterLimit(
        organizationId,
        characterCount,
      );
    }

    // Create document record
    const document = this.documentRepository.create({
      title: createDto.title,
      type: DocumentType.RICH_TEXT,
      filename: createDto.filename || `${createDto.title.replace(/[^a-zA-Z0-9]/g, '_')}.html`,
      fileSize: Buffer.byteLength(createDto.content, 'utf8'),
      mimeType: createDto.mimeType || 'text/html',
      filePath: '', // Rich text doesn't need file path
      content: createDto.content,
      characterCount,
      status: DocumentStatus.PROCESSED, // Rich text is immediately processed
      uploadedBy: userId,
      knowledgeBaseId: createDto.knowledgeBaseId,
      tags: createDto.tags || [],
      metadata: {
        extractionMethod: 'rich_text_editor',
        textLength: textContent.length,
        htmlLength: createDto.content.length,
        ...createDto.metadata,
      },
    });

    const saved = (await this.documentRepository.save(document)) as KnowledgeDocument;

    // Create chunks for the rich text content
    await this.createTextChunks(saved, textContent);

    // Update knowledge base statistics
    await this.knowledgeBaseService.updateStats(createDto.knowledgeBaseId);

    // Log audit
    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.CREATE,
      resourceType: 'document',
      resourceId: saved.id,
      description: `Created rich text document: ${createDto.title}`,
      metadata: { 
        type: 'rich_text',
        characterCount,
        knowledgeBaseId: createDto.knowledgeBaseId 
      },
    });

    return saved;
  }

  private async createTextChunks(document: KnowledgeDocument, content: string): Promise<void> {
    const chunkSize = 1000; // Characters per chunk
    const overlap = 200; // Overlap between chunks
    
    const chunks: string[] = [];
    
    // Split content into chunks
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
      const chunk = content.substring(i, i + chunkSize);
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
    }

    // Create chunk entities
    const chunkEntities = chunks.map((chunkText, index) => {
      const startPos = index * (chunkSize - overlap);
      const endPos = Math.min(startPos + chunkText.length, content.length);
      
      return this.chunkRepository.create({
        documentId: document.id,
        content: chunkText,
        chunkOrder: index,
        characterCount: chunkText.length,
        tokenCount: Math.ceil(chunkText.length / 4), // Rough token estimate
        startPosition: startPos,
        endPosition: endPos,
        metadata: {
          section: `chunk_${index}`,
          confidence: 1.0,
        },
      });
    });

    if (chunkEntities.length > 0) {
      await this.chunkRepository.save(chunkEntities);
    }
  }

  async findAll(
    organizationId: string | null,
    query: DocumentQueryDto,
  ): Promise<{ data: KnowledgeDocument[]; total: number }> {
    const queryBuilder = this.documentRepository
      .createQueryBuilder("doc")
      .leftJoinAndSelect("doc.uploader", "uploader")
      .leftJoinAndSelect("doc.knowledgeBase", "knowledgeBase");

    if (organizationId) {
      queryBuilder.where("knowledgeBase.organizationId = :organizationId", {
        organizationId,
      });
    } else {
      queryBuilder.where("knowledgeBase.organizationId IS NULL");
    }

    if (query.search) {
      queryBuilder.andWhere(
        "(doc.title ILIKE :search OR doc.filename ILIKE :search OR doc.content ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    if (query.type) {
      queryBuilder.andWhere("doc.type = :type", { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere("doc.status = :status", { status: query.status });
    }

    if (query.knowledgeBaseId) {
      queryBuilder.andWhere("doc.knowledgeBaseId = :kbId", {
        kbId: query.knowledgeBaseId,
      });
    }

    if (query.tags && query.tags.length > 0) {
      queryBuilder.andWhere("doc.tags && :tags", { tags: query.tags });
    }

    queryBuilder.orderBy("doc.updatedAt", "DESC");

    const total = await queryBuilder.getCount();
    const data = await queryBuilder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return { data, total };
  }

  async findOne(
    organizationId: string | null,
    id: string,
  ): Promise<KnowledgeDocument> {
    const queryBuilder = this.documentRepository
      .createQueryBuilder("doc")
      .leftJoinAndSelect("doc.uploader", "uploader")
      .leftJoinAndSelect("doc.knowledgeBase", "knowledgeBase")
      .leftJoinAndSelect("doc.chunks", "chunks")
      .where("doc.id = :id", { id });

    if (organizationId) {
      queryBuilder.andWhere("knowledgeBase.organizationId = :organizationId", {
        organizationId,
      });
    } else {
      queryBuilder.andWhere("knowledgeBase.organizationId IS NULL");
    }

    const document = await queryBuilder.getOne();

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return document;
  }

  async update(
    organizationId: string | null,
    userId: string,
    id: string,
    updateDto: UpdateDocumentDto,
  ): Promise<KnowledgeDocument> {
    const document = await this.findOne(organizationId, id);

    Object.assign(document, updateDto);
    document.version += 1;

    const updated = await this.documentRepository.save(document);

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.UPDATE,
      resourceType: "document",
      resourceId: id,
      description: `Updated document: ${document.filename}`,
      metadata: { changes: updateDto },
    });

    return updated;
  }

  async delete(
    organizationId: string | null,
    userId: string,
    id: string,
  ): Promise<void> {
    const document = await this.findOne(organizationId, id);

    // Delete physical file if it exists
    if (document.type !== DocumentType.URL && document.filePath) {
      try {
        await fs.unlink(document.filePath);
      } catch (error) {
        // File might already be deleted, log but don't fail
        console.warn(`Could not delete file: ${document.filePath}`, error);
      }
    }

    await this.documentRepository.remove(document);

    // Update knowledge base stats
    if (document.knowledgeBaseId) {
      await this.knowledgeBaseService.updateStats(document.knowledgeBaseId);
    }

    await this.auditService.log({
      organizationId,
      userId,
      action: AuditAction.DELETE,
      resourceType: "document",
      resourceId: id,
      description: `Deleted document: ${document.filename}`,
      metadata: { filename: document.filename },
    });
  }

  async search(
    organizationId: string | null,
    searchDto: DocumentSearchDto,
  ): Promise<
    Array<{
      document: KnowledgeDocument;
      chunk: DocumentChunk;
      score: number;
    }>
  > {
    // Full-text search using PostgreSQL
    let queryBuilder = this.chunkRepository
      .createQueryBuilder("chunk")
      .leftJoinAndSelect("chunk.document", "document")
      .leftJoinAndSelect("document.knowledgeBase", "knowledgeBase")
      .where("knowledgeBase.organizationId = :organizationId", {
        organizationId,
      })
      .andWhere("document.status = :status", {
        status: DocumentStatus.PROCESSED,
      });

    if (searchDto.knowledgeBaseId) {
      queryBuilder = queryBuilder.andWhere("document.knowledgeBaseId = :kbId", {
        kbId: searchDto.knowledgeBaseId,
      });
    }

    // Use PostgreSQL's full-text search
    queryBuilder = queryBuilder
      .andWhere(
        "to_tsvector('english', chunk.content) @@ plainto_tsquery('english', :query)",
        {
          query: searchDto.query,
        },
      )
      .addSelect(
        "ts_rank(to_tsvector('english', chunk.content), plainto_tsquery('english', :query))",
        "score",
      )
      .orderBy("score", "DESC")
      .limit(searchDto.limit);

    const results = await queryBuilder.getRawAndEntities();

    return results.entities
      .map((chunk, index) => ({
        document: chunk.document,
        chunk,
        score: parseFloat(results.raw[index].score),
      }))
      .filter((result) => result.score >= (searchDto.threshold || 0.1));
  }

  async getStats(organizationId: string | null): Promise<DocumentStatsDto> {
    const stats = await this.documentRepository
      .createQueryBuilder("doc")
      .leftJoin("doc.knowledgeBase", "kb")
      .select([
        "COUNT(*) as total",
        "SUM(doc.fileSize) as totalSize",
        "SUM(doc.characterCount) as totalCharacters",
        "AVG(EXTRACT(epoch FROM (doc.updatedAt - doc.createdAt))) as avgProcessingTime",
      ])
      .where("kb.organizationId = :organizationId", { organizationId })
      .getRawOne();

    const statusStats = await this.documentRepository
      .createQueryBuilder("doc")
      .leftJoin("doc.knowledgeBase", "kb")
      .select("doc.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("kb.organizationId = :organizationId", { organizationId })
      .groupBy("doc.status")
      .getRawMany();

    const typeStats = await this.documentRepository
      .createQueryBuilder("doc")
      .leftJoin("doc.knowledgeBase", "kb")
      .select("doc.type", "type")
      .addSelect("COUNT(*)", "count")
      .where("kb.organizationId = :organizationId", { organizationId })
      .groupBy("doc.type")
      .getRawMany();

    const byStatus = Object.values(DocumentStatus).reduce(
      (acc, status) => {
        acc[status] = parseInt(
          statusStats.find((s) => s.status === status)?.count || "0",
        );
        return acc;
      },
      {} as Record<DocumentStatus, number>,
    );

    const byType = Object.values(DocumentType).reduce(
      (acc, type) => {
        acc[type] = parseInt(
          typeStats.find((t) => t.type === type)?.count || "0",
        );
        return acc;
      },
      {} as Record<DocumentType, number>,
    );

    return {
      total: parseInt(stats.total) || 0,
      byStatus,
      byType,
      totalSize: parseInt(stats.totalSize) || 0,
      totalCharacters: parseInt(stats.totalCharacters) || 0,
      avgProcessingTime: parseFloat(stats.avgProcessingTime) || 0,
    };
  }

  private validateFile(
    file: Express.Multer.File,
    expectedType: DocumentType,
  ): void {
    const maxSizes = {
      [DocumentType.PDF]: 50 * 1024 * 1024, // 50MB
      [DocumentType.DOCX]: 25 * 1024 * 1024, // 25MB
      [DocumentType.TXT]: 10 * 1024 * 1024, // 10MB
      [DocumentType.MD]: 10 * 1024 * 1024, // 10MB
      [DocumentType.IMAGE]: 20 * 1024 * 1024, // 20MB
      [DocumentType.VIDEO]: 200 * 1024 * 1024, // 200MB
      [DocumentType.AUDIO]: 100 * 1024 * 1024, // 100MB
    };

    const allowedMimeTypes = {
      [DocumentType.PDF]: ["application/pdf"],
      [DocumentType.DOCX]: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      [DocumentType.TXT]: ["text/plain"],
      [DocumentType.MD]: ["text/markdown", "text/plain"],
      [DocumentType.IMAGE]: [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ],
      [DocumentType.VIDEO]: [
        "video/mp4",
        "video/avi",
        "video/mov",
        "video/mkv",
      ],
      [DocumentType.AUDIO]: [
        "audio/mp3",
        "audio/wav",
        "audio/m4a",
        "audio/ogg",
      ],
    };

    if (file.size > maxSizes[expectedType]) {
      throw new BadRequestException(
        `File size exceeds limit for ${expectedType} files`,
      );
    }

    if (!allowedMimeTypes[expectedType].includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type for ${expectedType}`);
    }
  }

  private estimateCharacters(
    file: Express.Multer.File,
    type: DocumentType,
  ): number {
    // Rough estimates based on file size and type
    const estimationRatios = {
      [DocumentType.PDF]: 0.5, // ~2 bytes per character
      [DocumentType.DOCX]: 0.3, // Compressed
      [DocumentType.TXT]: 1.0, // 1:1 ratio
      [DocumentType.MD]: 1.0, // 1:1 ratio
      [DocumentType.IMAGE]: 0.01, // OCR typically extracts little text
      [DocumentType.VIDEO]: 0.001, // Transcripts are much smaller than video
      [DocumentType.AUDIO]: 0.01, // Transcripts are much smaller than audio
      [DocumentType.URL]: 0.1, // Web pages vary widely
    };

    return Math.ceil(file.size * estimationRatios[type]);
  }

  private async trackUsage(
    organizationId: string | null,
    type: UsageMetricType,
    value: number,
  ): Promise<void> {
    const metric = this.usageMetricRepository.create({
      organizationId,
      type,
      value,
      date: new Date().toISOString().split("T")[0],
      metadata: {},
    });

    await this.usageMetricRepository.save(metric);
  }

  async scrapeUrlContent(url: string, options?: any) {
    try {
      // Scrape the URL
      const scrapedContent = await this.webScrapingService.scrapeUrl(url, options);
      
      // Generate AI synthesis
      const aiSynthesis = await this.webScrapingService.generateAISynthesis(scrapedContent);
      
      return {
        success: true,
        data: {
          scrapedContent,
          aiSynthesis,
          url
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deepCrawlUrlContent(url: string, options?: {
    maxPages?: number;
    maxDepth?: number;
    sameDomainOnly?: boolean;
    excludePatterns?: string[];
    includeImages?: boolean;
    delay?: number;
  }) {
    try {
      // Perform deep crawl
      const crawlResult = await this.webScrapingService.deepCrawl(url, options);
      
      // Generate comprehensive synthesis
      const aiSynthesis = await this.webScrapingService.generateDeepCrawlSynthesis(crawlResult);
      
      // Aggregate all content from all pages
      const aggregatedContent = {
        text: crawlResult.pages.map(page => page.content.text).join('\n\n---\n\n'),
        images: crawlResult.pages.flatMap(page => page.content.images),
        videos: crawlResult.pages.flatMap(page => page.content.videos),
        links: crawlResult.pages.flatMap(page => page.content.links),
        metadata: {
          title: `Crawl complet de ${crawlResult.baseUrl}`,
          description: `Contenu agrégé de ${crawlResult.totalPagesCrawled} pages du site ${crawlResult.baseUrl}`,
          keywords: [...new Set(crawlResult.pages.flatMap(page => page.content.metadata.keywords))],
          wordCount: crawlResult.pages.reduce((sum, page) => sum + page.content.metadata.wordCount, 0),
          language: crawlResult.pages[0]?.content.metadata.language || 'fr',
          author: crawlResult.pages[0]?.content.metadata.author,
          publishDate: new Date().toISOString()
        }
      };

      return {
        success: true,
        data: {
          scrapedContent: aggregatedContent,
          aiSynthesis,
          url,
          crawlDetails: {
            totalPagesCrawled: crawlResult.totalPagesCrawled,
            totalPagesFound: crawlResult.totalPagesFound,
            errors: crawlResult.errors,
            pages: crawlResult.pages.map(page => ({
              url: page.url,
              title: page.content.metadata.title,
              wordCount: page.content.metadata.wordCount,
              crawledAt: page.crawledAt
            }))
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
