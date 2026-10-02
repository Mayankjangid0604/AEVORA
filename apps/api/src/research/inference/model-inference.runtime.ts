export interface ModelInferenceRuntime {
  getCapabilityId(): string;
  executeInference(artifactRef: string, payload: any): Promise<any>;
}
