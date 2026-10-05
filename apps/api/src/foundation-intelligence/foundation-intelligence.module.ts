import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FiAuditService } from './fi-audit.service';
import { FiDatasetService } from './fi-dataset.service';
import { FiTrainingJobService } from './fi-training-job.service';
import { FiCheckpointService } from './fi-checkpoint.service';
import { FiModelVersionService } from './fi-model-version.service';
import { FiEvaluationService } from './fi-evaluation.service';
import { FiAnalyticsService } from './fi-analytics.service';
import { FoundationIntelligenceController } from './foundation-intelligence.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FoundationIntelligenceController],
  providers: [
    FiAuditService,
    FiDatasetService,
    FiTrainingJobService,
    FiCheckpointService,
    FiModelVersionService,
    FiEvaluationService,
    FiAnalyticsService,
  ],
  exports: [FiAuditService],
})
export class FoundationIntelligenceModule {}
