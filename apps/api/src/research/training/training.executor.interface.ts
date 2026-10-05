import { TrainingConfiguration, TrainingRunAttempt, ModelTrainingStatus } from '@prisma/client';

export interface TrainingExecutionResult {
  status: ModelTrainingStatus;
  metrics?: Record<string, any>;
  resourceConsumption?: Record<string, any>;
  failureReason?: string;
  artifactRef?: string;
}

export interface TrainingExecutor {
  /**
   * Identifies the executor (e.g. 'SIMULATED', 'LOCAL', 'HUGGINGFACE')
   */
  getIdentifier(): string;

  /**
   * Start or resume a training run attempt.
   */
  execute(
    configuration: TrainingConfiguration,
    attempt: TrainingRunAttempt,
    datasetPaths: string[]
  ): Promise<TrainingExecutionResult>;

  /**
   * Cancel an ongoing training run.
   */
  cancel(attemptId: string): Promise<boolean>;

  /**
   * Retrieve the current status of the training run.
   */
  getStatus(attemptId: string): Promise<ModelTrainingStatus>;
}
