export interface ModelCapabilities {
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  maxTokens: number;
}

export interface ModelRequest {
  prompt: string;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
  requireStructuredOutput?: boolean;
  complexity?: 'BASIC' | 'COMPLEX' | 'CODE' | 'VISION' | 'FAST' | 'STRATEGIC';
  tier?: 'local' | 'gemini' | 'sonnet' | 'opus' | 'fable' | 'browser';
  employeeId?: string; // Added for browser profile mapping
  projectId?: string;
  taskId?: string;
}

export interface ModelResponse {
  text: string;
  structuredOutput?: any;
  provider: string;
  model: string;
  finishReason?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelProvider {
  name: string;
  capabilities: ModelCapabilities;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
