import { Injectable, Logger } from '@nestjs/common';
import { ModelInferenceRuntime } from './model-inference.runtime';
import { execSync } from 'child_process';
import * as path from 'path';

@Injectable()
export class TaskRiskInferenceRuntime implements ModelInferenceRuntime {
  private readonly logger = new Logger(TaskRiskInferenceRuntime.name);

  getCapabilityId(): string {
    return 'TASK_RISK_CLASSIFICATION';
  }

  async executeInference(artifactRef: string, payload: any): Promise<any> {
    const inferenceScript = path.join(process.cwd(), 'apps', 'api', 'scripts', 'ml', 'inference_task_risk.py');
    const payloadStr = JSON.stringify(payload).replace(/"/g, '\\"');
    
    try {
      const out = execSync(`python ${inferenceScript} "${artifactRef}" "${payloadStr}"`).toString();
      const parsed = JSON.parse(out);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return parsed.predictions;
    } catch (e: any) {
      this.logger.error(`Task Risk Inference failed: ${e.message}`);
      throw new Error(`Inference execution failed: ${e.message}`);
    }
  }
}
