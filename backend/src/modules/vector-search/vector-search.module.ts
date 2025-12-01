import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  DocumentChunk,
  KnowledgeBase,
  Organization,
  UsageMetric,
} from "../../common/entities";
import { VectorSearchService } from "./vector-search.service";
import { VectorSearchController } from "./vector-search.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentChunk,
      KnowledgeBase,
      Organization,
      UsageMetric,
    ]),
  ],
  controllers: [VectorSearchController],
  providers: [VectorSearchService],
  exports: [VectorSearchService],
})
export class VectorSearchModule {}
