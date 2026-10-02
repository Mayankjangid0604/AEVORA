import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EconomyModule } from '../economy/economy.module';

import { ResearchProposalService } from './services/research-proposal.service';
import { ResearchProjectService } from './services/research-project.service';
import { DatasetService } from './services/dataset.service';
import { ModelRegistryService } from './services/model-registry.service';
import { ExperimentService } from './services/experiment.service';
import { EvaluationService } from './services/evaluation.service';
import { SafetyEvaluationService } from './services/safety-evaluation.service';
import { TrainingGateway } from './training/training.gateway';
import { SimulatedTrainingExecutor } from './training/simulated.training-executor';
import { LocalPythonTrainingExecutor } from './training/local-python.training-executor';
import { TrainingConfigService } from './services/training-config.service';
import { TrainingService } from './services/training.service';
import { ArtifactService } from './services/artifact.service';
import { InferenceService } from './services/inference.service';
import { LocalPythonInferenceRuntime } from './inference/local-python-inference.runtime';
import { ImprovementObservationService } from './services/improvement-observation.service';
import { ResearchPlanningService } from './services/research-planning.service';
import { EvaluationComparisonService } from './services/evaluation-comparison.service';
import { ModelOrchestratorService } from './services/model-orchestrator.service';
import { TaskPriorityInferenceRuntime } from './inference/task-priority-inference.runtime';
import { TaskRiskInferenceRuntime } from './inference/task-risk-inference.runtime';
import { ResearchController } from './controllers/research.controller';

import { ProductionModule } from '../production/production.module';

@Module({
  imports: [PrismaModule, EconomyModule, ProductionModule],
  providers: [
    ResearchProposalService,
    ResearchProjectService,
    DatasetService,
    ModelRegistryService,
    ExperimentService,
    EvaluationService,
    SafetyEvaluationService,
    SimulatedTrainingExecutor,
    LocalPythonTrainingExecutor,
    TrainingGateway,
    TrainingConfigService,
    TrainingService,
    ArtifactService,
    InferenceService,
    LocalPythonInferenceRuntime,
    TaskPriorityInferenceRuntime,
    TaskRiskInferenceRuntime,
    ModelOrchestratorService,
    ImprovementObservationService,
    ResearchPlanningService,
    EvaluationComparisonService,
  ],
  controllers: [ResearchController],
  exports: [
    ResearchProposalService,
    ResearchProjectService,
    DatasetService,
    ModelRegistryService,
    ExperimentService,
    EvaluationService,
    SafetyEvaluationService,
    TrainingGateway,
    TrainingConfigService,
    TrainingService,
    ArtifactService,
    InferenceService,
    ModelOrchestratorService,
    ImprovementObservationService,
    ResearchPlanningService,
    EvaluationComparisonService,
  ]
})
export class ResearchModule {}
