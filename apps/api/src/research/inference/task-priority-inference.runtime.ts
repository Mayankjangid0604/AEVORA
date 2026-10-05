import { Injectable, Logger } from '@nestjs/common';
import { ModelInferenceRuntime } from './model-inference.runtime';
import { execSync } from 'child_process';
import * as path from 'path';

@Injectable()
export class TaskPriorityInferenceRuntime implements ModelInferenceRuntime {
  private readonly logger = new Logger(TaskPriorityInferenceRuntime.name);

  getCapabilityId(): string {
    return 'TASK_PRIORITY_CLASSIFICATION';
  }

  async executeInference(artifactRef: string, payload: any): Promise<any> {
    const inferenceScript = path.join(process.cwd(), 'apps', 'api', 'scripts', 'ml', 'inference_task_priority.py');
    const payloadStr = JSON.stringify(payload).replace(/"/g, '\\"');
    
    try {
      const out = execSync(`python ${inferenceScript} "${artifactRef}" "${payloadStr}"`).toString();
      const parsed = JSON.parse(out);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return parsed.predictions;
    } catch (e: any) {
      this.logger.error(`Task Priority Inference failed: ${e.message}`);
      throw new Error(`Inference execution failed: ${e.message}`);
    }
  }
}
