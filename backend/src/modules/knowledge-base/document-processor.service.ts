import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { KnowledgeDocument, DocumentChunk } from "../../common/entities";
import { DocumentType, DocumentStatus } from "../../common/enums";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Import processing libraries
import * as pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import * as sharp from "sharp";
import * as ffmpeg from "fluent-ffmpeg";
import axios from "axios";
import * as cheerio from "cheerio";
import { createWorker } from "tesseract.js";

export interface ProcessingResult {
  content: string;
  metadata: any;
  chunks: Array<{
    content: string;
    chunkOrder: number;
    startPosition: number;
    endPosition: number;
    metadata?: any;
  }>;
}

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly documentRepository: Repository<KnowledgeDocument>,

    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,
  ) {}

  async processDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new BadRequestException("Document not found");
    }

    try {
      document.status = DocumentStatus.PROCESSING;
      await this.documentRepository.save(document);

      const startTime = Date.now();
      let result: ProcessingResult;

      switch (document.type) {
        case DocumentType.PDF:
          result = await this.processPDF(document);
          break;
        case DocumentType.DOCX:
          result = await this.processDOCX(document);
          break;
        case DocumentType.TXT:
        case DocumentType.MD:
          result = await this.processText(document);
          break;
        case DocumentType.IMAGE:
          result = await this.processImage(document);
          break;
        case DocumentType.VIDEO:
          result = await this.processVideo(document);
          break;
        case DocumentType.AUDIO:
          result = await this.processAudio(document);
          break;
        case DocumentType.URL:
          result = await this.processURL(document);
          break;
        default:
          throw new BadRequestException(
            `Unsupported document type: ${document.type}`,
          );
      }

      const processingTime = (Date.now() - startTime) / 1000;

      // Update document with results
      document.content = result.content;
      document.characterCount = result.content.length;
      document.fileSize = Buffer.byteLength(result.content, 'utf8'); // Update fileSize based on content
      document.status = DocumentStatus.PROCESSED;
      document.contentHash = this.generateContentHash(result.content);
      document.metadata = {
        ...document.metadata,
        ...result.metadata,
        processingTime,
        extractionMethod: "automated",
        wordCount: result.content.split(/\s+/).length,
      };

      await this.documentRepository.save(document);

      // Save chunks
      const chunks = result.chunks.map((chunkData, index) =>
        this.chunkRepository.create({
          ...chunkData,
          documentId: document.id,
          characterCount: chunkData.content.length,
          tokenCount: this.estimateTokenCount(chunkData.content),
        }),
      );

      await this.chunkRepository.save(chunks);

      this.logger.log(
        `Successfully processed document ${documentId} in ${processingTime}s`,
      );

      return document;
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}:`, error);

      document.status = DocumentStatus.FAILED;
      document.processingError = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date(),
        retryCount: (document.processingError?.retryCount || 0) + 1,
      };

      await this.documentRepository.save(document);
      throw error;
    }
  }

  private async processPDF(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    const buffer = await fs.readFile(document.filePath);
    const data = await pdfParse(buffer);

    const metadata = {
      pageCount: data.numpages,
      pdfInfo: data.info,
      confidence: 0.9,
    };

    const chunks = this.chunkText(data.text, {
      strategy: "recursive",
      chunkSize: 1000,
      overlap: 100,
    });

    return {
      content: data.text,
      metadata,
      chunks,
    };
  }

  private async processDOCX(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    const buffer = await fs.readFile(document.filePath);
    const result = await mammoth.extractRawText({ buffer });

    const metadata = {
      confidence: 0.95,
    };

    const chunks = this.chunkText(result.value, {
      strategy: "recursive",
      chunkSize: 1000,
      overlap: 100,
    });

    return {
      content: result.value,
      metadata,
      chunks,
    };
  }

  private async processText(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    const content = await fs.readFile(document.filePath, "utf-8");

    const metadata = {
      confidence: 1.0,
      encoding: "utf-8",
    };

    const chunks = this.chunkText(content, {
      strategy: "recursive",
      chunkSize: 1000,
      overlap: 100,
    });

    return {
      content,
      metadata,
      chunks,
    };
  }

  private async processImage(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    // Generate thumbnail
    const thumbnailPath = document.filePath.replace(/\.[^.]+$/, "_thumb.jpg");
    await sharp(document.filePath)
      .resize(300, 300, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    // OCR extraction
    const worker = await createWorker("eng");
    const {
      data: { text, confidence },
    } = await worker.recognize(document.filePath);
    await worker.terminate();

    const metadata = {
      thumbnailUrl: thumbnailPath,
      ocrText: text,
      confidence: confidence / 100,
      dimensions: await this.getImageDimensions(document.filePath),
    };

    const chunks = text.trim()
      ? this.chunkText(text, {
          strategy: "fixed",
          chunkSize: 500,
          overlap: 50,
        })
      : [];

    return {
      content: text.trim() || `[Image: ${document.filename}]`,
      metadata,
      chunks,
    };
  }

  private async processVideo(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    const thumbnailPath = document.filePath.replace(/\.[^.]+$/, "_thumb.jpg");

    // Generate thumbnail
    await new Promise((resolve, reject) => {
      ffmpeg(document.filePath)
        .screenshots({
          timestamps: ["50%"],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: "300x300",
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // Extract audio for transcription (placeholder - would need actual speech-to-text service)
    const audioPath = document.filePath.replace(/\.[^.]+$/, ".wav");
    await new Promise((resolve, reject) => {
      ffmpeg(document.filePath)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .output(audioPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // Placeholder transcript (would integrate with Google Speech API or similar)
    const transcript = "[Video transcript would be generated here]";

    const metadata = {
      thumbnailUrl: thumbnailPath,
      transcript,
      duration: await this.getVideoDuration(document.filePath),
      confidence: 0.8,
    };

    const chunks = transcript
      ? this.chunkText(transcript, {
          strategy: "recursive",
          chunkSize: 1000,
          overlap: 100,
        })
      : [];

    return {
      content: transcript || `[Video: ${document.filename}]`,
      metadata,
      chunks,
    };
  }

  private async processAudio(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    // Generate waveform visualization (placeholder)
    const waveformPath = document.filePath.replace(/\.[^.]+$/, "_waveform.png");

    // Placeholder transcript (would integrate with Google Speech API or similar)
    const transcript = "[Audio transcript would be generated here]";

    const metadata = {
      waveformUrl: waveformPath,
      transcript,
      duration: await this.getAudioDuration(document.filePath),
      confidence: 0.8,
    };

    const chunks = transcript
      ? this.chunkText(transcript, {
          strategy: "recursive",
          chunkSize: 1000,
          overlap: 100,
        })
      : [];

    return {
      content: transcript || `[Audio: ${document.filename}]`,
      metadata,
      chunks,
    };
  }

  private async processURL(
    document: KnowledgeDocument,
  ): Promise<ProcessingResult> {
    try {
      // Fetch the URL content using axios instead of puppeteer
      const response = await axios.get(document.filePath, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
        },
        timeout: 30000,
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $("script, style, nav, footer, aside, .advertisement").remove();

      const title = $("title").text() || $("h1").first().text();
      const content = $("body").text().replace(/\s+/g, " ").trim();

      const metadata = {
        url: document.filePath,
        title,
        scrapedAt: new Date(),
        confidence: 0.9,
      };

      const chunks = this.chunkText(content, {
        strategy: "recursive",
        chunkSize: 1000,
        overlap: 100,
      });

      return {
        content,
        metadata,
        chunks,
      };
    } catch (error) {
      this.logger.error(`Failed to process URL ${document.filePath}:`, error);
      throw error;
    }
  }

  private chunkText(
    text: string,
    options: {
      strategy: "fixed" | "semantic" | "recursive";
      chunkSize: number;
      overlap: number;
    },
  ): Array<{
    content: string;
    chunkOrder: number;
    startPosition: number;
    endPosition: number;
    metadata?: any;
  }> {
    const chunks = [];

    if (options.strategy === "fixed") {
      for (
        let i = 0;
        i < text.length;
        i += options.chunkSize - options.overlap
      ) {
        const start = i;
        const end = Math.min(i + options.chunkSize, text.length);
        const content = text.substring(start, end);

        chunks.push({
          content,
          chunkOrder: chunks.length,
          startPosition: start,
          endPosition: end,
        });
      }
    } else if (options.strategy === "recursive") {
      // Implement recursive text splitting by sentences/paragraphs
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      let currentChunk = "";
      let currentStart = 0;

      for (const sentence of sentences) {
        if (
          currentChunk.length + sentence.length > options.chunkSize &&
          currentChunk.length > 0
        ) {
          chunks.push({
            content: currentChunk.trim(),
            chunkOrder: chunks.length,
            startPosition: currentStart,
            endPosition: currentStart + currentChunk.length,
          });

          currentStart += currentChunk.length - options.overlap;
          currentChunk =
            currentChunk.substring(currentChunk.length - options.overlap) +
            sentence;
        } else {
          currentChunk += sentence + ". ";
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          chunkOrder: chunks.length,
          startPosition: currentStart,
          endPosition: currentStart + currentChunk.length,
        });
      }
    }

    return chunks;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private async getImageDimensions(
    filePath: string,
  ): Promise<{ width: number; height: number }> {
    const metadata = await sharp(filePath).metadata();
    return { width: metadata.width || 0, height: metadata.height || 0 };
  }

  private async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    return this.getVideoDuration(filePath); // Same method works for audio
  }
}
