import { ModelProvider, ModelRequest, ModelResponse, ModelCapabilities } from '../types';

export type ClaudeTier = 'sonnet' | 'opus' | 'fable' | 'fable-latest';

const TIER_MODELS: Record<ClaudeTier, string> = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-1',
  'fable-latest': 'claude-fable-5-1',
};

export class ClaudeProvider implements ModelProvider {
  name = 'claude';

  capabilities: ModelCapabilities = {
    supportsVision: true,
    supportsFunctionCalling: true,
    maxTokens: 16384,
  };

  private readonly apiKey: string;
  private readonly tier: ClaudeTier;

  constructor(tier: ClaudeTier = 'sonnet') {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.tier = tier;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const model = TIER_MODELS[this.tier];
    const messages: any[] = [{ role: 'user', content: request.prompt }];

    const body: any = {
      model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };
    if (request.systemMessage) body.system = request.systemMessage;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.content?.map((b: any) => b.text).join('') ?? '';

    let structuredOutput: any;
    if (request.requireStructuredOutput) {
      try {
        structuredOutput = JSON.parse(text);
      } catch {
        throw new Error('Claude returned non-JSON when structured output was required');
      }
    }

    return {
      text,
      structuredOutput,
      provider: 'claude',
      model,
      finishReason: data.stop_reason ?? 'end_turn',
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  }
}
