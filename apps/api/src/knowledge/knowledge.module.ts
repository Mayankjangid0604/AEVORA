import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { KnowledgeValidationService } from './knowledge-validation.service';
import { KnowledgeProvenanceService } from './knowledge-provenance.service';
import { KnowledgeController } from './knowledge.controller';
// import { ModelGatewayModule } from '../model-gateway/model-gateway.module'; // Depending on real structure

@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    KnowledgeRetrievalService,
    KnowledgeExtractionService,
    KnowledgeValidationService,
    KnowledgeProvenanceService,
  ],
  exports: [
    KnowledgeService,
    KnowledgeRetrievalService,
    KnowledgeExtractionService,
    KnowledgeValidationService,
    KnowledgeProvenanceService,
  ],
})
export class KnowledgeModule {}
