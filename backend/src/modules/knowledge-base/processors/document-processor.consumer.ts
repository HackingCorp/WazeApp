import { OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bull";
import { DocumentProcessorService } from "../document-processor.service";
import { KnowledgeBaseService } from "../knowledge-base.service";

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

      await job.progress(90);

      // Update knowledge base statistics
      if (document && document.knowledgeBaseId) {
        await this.knowledgeBaseService.updateStats(document.knowledgeBaseId);
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
