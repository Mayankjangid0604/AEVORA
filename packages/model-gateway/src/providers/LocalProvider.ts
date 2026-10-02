import { ModelProvider, ModelRequest, ModelResponse, ModelCapabilities } from '../types';
import { Config } from '../config';

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.permits++;
    }
  }
}

export class LocalProvider implements ModelProvider {
  name = 'local';
  private semaphore: Semaphore;

  capabilities: ModelCapabilities = {
    supportsVision: false,
    supportsFunctionCalling: false,
    maxTokens: 8192,
  };

  constructor() {
    this.semaphore = new Semaphore(Config.OLLAMA_MAX_CONCURRENT_REQUESTS);
  }

  async checkHealth(): Promise<{ status: 'ok' | 'error', message: string, models?: Record<string, string> }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${Config.OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { status: 'error', message: `Ollama reachable but returned status ${response.status}` };
      }

      const data = await response.json();
      const installed = data.models?.map((m: any) => m.name) || [];

      const roles = Config.MODEL_ROLES;
      const missing = Config.REQUIRED_OLLAMA_MODELS.filter((m) => !installed.includes(m));

      if (missing.length > 0) {
        return {
          status: 'error',
          message: `Ollama missing required models: ${missing.join(', ')}. Installed: ${installed.join(', ')}. Run: ${missing.map(m => `ollama pull ${m}`).join('; ')}`,
          models: roles,
        };
      }

      return { status: 'ok', message: `Ollama healthy — ${installed.length} models, all ${Config.REQUIRED_OLLAMA_MODELS.length} required present`, models: roles };
    } catch (error: any) {
      return { status: 'error', message: `Ollama health check failed: ${error.message}` };
    }
  }

  async generate(request: ModelRequest & { targetModel?: string }): Promise<ModelResponse> {
    const model = request.targetModel || Config.OLLAMA_DEFAULT_MODEL;
    
    let fullPrompt = request.prompt;
    if (request.systemMessage) {
      fullPrompt = `System: ${request.systemMessage}\n\nUser: ${request.prompt}`;
    }

    const payload: any = {
      model,
      prompt: fullPrompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
      }
    };

    if (request.requireStructuredOutput) {
      payload.format = 'json';
    }

    // Attempt generation with bounded retries for transient errors
    let lastError: any;
    const maxRetries = 2; // bounded retries
    
    await this.semaphore.acquire();
    
    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await this.attemptGeneration(payload, model, request.requireStructuredOutput);
        } catch (error: any) {
          lastError = error;
          // Only retry on specific transient errors like timeouts or connection refused
          const isTransient = error.name === 'AbortError' || 
                              (error.message && error.message.includes('ECONNREFUSED')) ||
                              (error.message && error.message.includes('fetch failed'));
                              
          if (!isTransient || attempt === maxRetries) {
            break;
          }
          // Exponential backoff
          await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 500));
        }
      }
      throw lastError;
    } finally {
      this.semaphore.release();
    }
  }
  
  private async attemptGeneration(payload: any, model: string, requireStructuredOutput?: boolean): Promise<ModelResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Config.OLLAMA_TIMEOUT_MS);
    
    try {
      const response = await fetch(`${Config.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        // e.g., Model not found
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const textData = await response.text();
      if (!textData) {
        throw new Error('Ollama API error: Empty response');
      }
      
      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        throw new Error('Ollama API error: Invalid JSON response');
      }

      let structuredOutput = undefined;
      if (requireStructuredOutput) {
        try {
          structuredOutput = JSON.parse(data.response);
        } catch (e) {
          throw new Error('Ollama API error: Malformed structured output JSON from model');
        }
      }

      return {
        text: data.response,
        structuredOutput,
        provider: 'local',
        model,
        finishReason: data.done_reason || 'stop',
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
