import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { MulterModule } from "@nestjs/platform-express";
import {
  KnowledgeBase,
  KnowledgeDocument,
  DocumentChunk,
  Organization,
  UsageMetric,
  AiAgent,
} from "../../common/entities";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { DocumentService } from "./document.service";
import { DocumentProcessorService } from "./document-processor.service";
import { WebScrapingService } from "./web-scraping.service";
import { KnowledgeBaseController } from "./knowledge-base.controller";
import { DocumentController } from "./document.controller";
import { DocumentProcessorConsumer } from "./processors/document-processor.consumer";
import { AuditModule } from "../audit/audit.module";
import * as multer from "multer";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBase,
      KnowledgeDocument,
      DocumentChunk,
      Organization,
      UsageMetric,
      AiAgent,
    ]),
    AuditModule,
    BullModule.registerQueue({
      name: "document-processing",
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    }),
    MulterModule.register({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 200 * 1024 * 1024, // 200MB max file size
        files: 1,
      },
    }),
  ],
  controllers: [KnowledgeBaseController, DocumentController],
  providers: [
    KnowledgeBaseService,
    DocumentService,
    DocumentProcessorService,
    WebScrapingService,
    DocumentProcessorConsumer,
  ],
  exports: [KnowledgeBaseService, DocumentService],
})
export class KnowledgeBaseModule {}
