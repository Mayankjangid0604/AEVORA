import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagementModule } from '../management/management.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LabController } from './lab.controller';
import { LabProjectService } from './lab-project.service';
import { ResQuestionService } from './res-question.service';
import { ResHypothesisService } from './res-hypothesis.service';
import { LabExperimentService } from './lab-experiment.service';
import { LabExperimentRunService } from './lab-experiment-run.service';
import { LabResultService } from './lab-result.service';
import { LabEvaluationService } from './lab-evaluation.service';
import { LabFindingService } from './lab-finding.service';
import { LabEvidenceService } from './lab-evidence.service';
import { LabReproductionService } from './lab-reproduction.service';
import { LabRecommendationService } from './lab-recommendation.service';

@Module({
  imports: [PrismaModule, ManagementModule, AuthorizationModule],
  controllers: [LabController],
  providers: [
    LabProjectService,
    ResQuestionService,
    ResHypothesisService,
    LabExperimentService,
    LabExperimentRunService,
    LabResultService,
    LabEvaluationService,
    LabFindingService,
    LabEvidenceService,
    LabReproductionService,
    LabRecommendationService,
  ],
  exports: [
    LabProjectService,
    ResQuestionService,
    ResHypothesisService,
    LabExperimentService,
    LabExperimentRunService,
    LabResultService,
    LabEvaluationService,
    LabFindingService,
    LabEvidenceService,
    LabReproductionService,
    LabRecommendationService,
  ],
})
export class LabModule {}
