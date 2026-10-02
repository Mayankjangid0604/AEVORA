export interface TrainingRuntime {
  getIdentifier(): string;
  isAvailable(): boolean;
  detectCapabilities(): Promise<any>;
  execute(jobId: string, configuration: any, datasetPaths: string[], baseModelPath?: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
}
