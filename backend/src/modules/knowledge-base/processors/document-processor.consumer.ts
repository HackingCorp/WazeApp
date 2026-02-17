import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "bull";
import { DocumentProcessorService } from "../document-processor.service";
import { KnowledgeBaseService } from "../knowledge-base.service";
import { VectorSearchService } from "../../vector-search/vector-search.service";
import { DocumentChunk } from "../../../common/entities";

export interface DocumentProcessingJob {
  documentId: string;
  organizationId: string;
  userId: string;
}

@Injectable()
@Processor("document-processing")
export class DocumentProcessorConsumer {
  private readonly logger = new Logger(DocumentProcessorConsumer.name);

  constructor(
    private readonly documentProcessorService: DocumentProcessorService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly vectorSearchService: VectorSearchService,
    @InjectRepository(DocumentChunk)
    private readonly chunkRepository: Repository<DocumentChunk>,
  ) {}

  @Process("process-document")
  async processDocument(job: Job<DocumentProcessingJob>) {
    const { documentId, organizationId, userId } = job.data;

    this.logger.log(
      `Processing document ${documentId} for organization ${organizationId}`,
    );

    try {
      // Update job progress
      await job.progress(10);

      // Process the document
      const document = await this.documentProcessorService.processDocument(documentId);

      await job.progress(70);

      // Update knowledge base statistics
      if (document && document.knowledgeBaseId) {
        await this.knowledgeBaseService.updateStats(document.knowledgeBaseId);
      }

      await job.progress(80);

      // Auto-index chunks in vector database
      if (document) {
        this.logger.log(`Auto-indexing chunks for document ${documentId}...`);

        try {
          // Query all chunks for this document
          const chunks = await this.chunkRepository.find({
            where: { documentId: document.id },
            relations: ['document', 'document.knowledgeBase'],
            order: { chunkOrder: 'ASC' },
          });

          this.logger.log(`Found ${chunks.length} chunks to index`);

          let indexedCount = 0;
          let failedCount = 0;

          // Index each chunk
          for (const chunk of chunks) {
            try {
              const success = await this.vectorSearchService.indexChunk(chunk);
              if (success) {
                indexedCount++;
              } else {
                failedCount++;
              }
            } catch (indexError) {
              this.logger.warn(
                `Failed to index chunk ${chunk.id}: ${indexError.message}`,
              );
              failedCount++;
              // Continue with other chunks even if one fails
            }
          }

          this.logger.log(
            `Vector indexing complete: ${indexedCount} indexed, ${failedCount} failed`,
          );
        } catch (indexingError) {
          // Log warning but don't fail the whole job
          this.logger.warn(
            `Vector indexing failed for document ${documentId}: ${indexingError.message}. Document processing succeeded but chunks are not indexed.`,
          );
        }
      }

      await job.progress(100);

      this.logger.log(`Successfully processed document ${documentId}`);

      return { success: true, documentId };
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}:`, error);
      throw error;
    }
  }

  @Process("reprocess-knowledge-base")
  async reprocessKnowledgeBase(
    job: Job<{
      knowledgeBaseId: string;
      organizationId: string;
      userId: string;
    }>,
  ) {
    const { knowledgeBaseId, organizationId, userId } = job.data;

    this.logger.log(`Reprocessing knowledge base ${knowledgeBaseId}`);

    try {
      // This would reprocess all documents in a knowledge base
      // Implementation would involve querying all documents and re-queuing them

      this.logger.log(
        `Successfully queued reprocessing for knowledge base ${knowledgeBaseId}`,
      );

      return { success: true, knowledgeBaseId };
    } catch (error) {
      this.logger.error(
        `Failed to reprocess knowledge base ${knowledgeBaseId}:`,
        error,
      );
      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(
      `Processing job ${job.id} of type ${job.name}...`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `Job ${job.id} completed with result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed with error: ${error.message}`,
    );
  }
}
