import { ModelRequest, ModelResponse, ModelCapabilities } from './types';
import { LocalProvider } from './providers/LocalProvider';
import { ClaudeProvider, ClaudeTier } from './providers/ClaudeProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { Config } from './config';
import { ModelTier, getTierConfig } from './model-tier';

import { ModelProvider } from './types';

export class ModelGateway {
  private localProvider: LocalProvider;
  private claudeProviders: Map<ClaudeTier, ClaudeProvider> = new Map();
  private geminiProvider: GeminiProvider;
  private browserProvider?: ModelProvider;

  private static globalBrowserProvider?: ModelProvider;

  static registerGlobalBrowserProvider(provider: ModelProvider) {
    this.globalBrowserProvider = provider;
  }

  constructor() {
    Config.validate();
    this.localProvider = new LocalProvider();
    this.geminiProvider = new GeminiProvider();
    this.browserProvider = ModelGateway.globalBrowserProvider;
  }

  registerBrowserProvider(provider: ModelProvider) {
    this.browserProvider = provider;
  }

  get capabilities(): ModelCapabilities {
    return this.localProvider.capabilities;
  }

  async checkHealth(): Promise<{ status: 'ok' | 'error', message: string }> {
    return this.localProvider.checkHealth();
  }

  private getClaudeProvider(tier: ClaudeTier): ClaudeProvider {
    let provider = this.claudeProviders.get(tier);
    if (!provider) {
      provider = new ClaudeProvider(tier);
      this.claudeProviders.set(tier, provider);
    }
    return provider;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();

    // Tier routing: explicit tier wins, then fall back to local
    if (request.tier === 'browser' && this.browserProvider) {
      try {
        const response = await this.browserProvider.generate(request);
        this.logSuccess('browser', response.model, startTime, response.usage);
        return response;
      } catch (error: any) {
        console.error(JSON.stringify({
          event: 'inference_failure',
          provider: 'browser',
          tier: request.tier,
          latencyMs: Date.now() - startTime,
          errorMessage: error.message,
        }));
        console.log(`[ModelGateway] Browser failed, falling back to local: ${error.message}`);
      }
    } else if (request.tier === 'gemini') {
      if (this.geminiProvider.isConfigured) {
        try {
          const response = await this.geminiProvider.generate(request);
          this.logSuccess('gemini', response.model, startTime, response.usage);
          return response;
        } catch (error: any) {
          console.error(JSON.stringify({ event: 'inference_failure', provider: 'gemini', latencyMs: Date.now() - startTime, errorMessage: error.message }));
          console.log(`[ModelGateway] Gemini failed, falling back to local: ${error.message}`);
        }
      } else {
        console.log(`[ModelGateway] Gemini not configured (no GEMINI_API_KEY), using local`);
      }
    } else if (request.tier && request.tier !== 'local') {
      const claude = this.getClaudeProvider(request.tier as ClaudeTier);
      if (claude.isConfigured) {
        try {
          const response = await claude.generate(request);
          this.logSuccess('claude', response.model, startTime, response.usage);
          return response;
        } catch (error: any) {
          console.error(JSON.stringify({
            event: 'inference_failure',
            provider: 'claude',
            tier: request.tier,
            latencyMs: Date.now() - startTime,
            errorMessage: error.message,
          }));
          console.log(`[ModelGateway] Claude ${request.tier} failed, falling back to local: ${error.message}`);
        }
      } else {
        console.log(`[ModelGateway] Claude not configured (no ANTHROPIC_API_KEY), using local`);
      }
    }
    // Local Ollama routing — pick model by complexity or role
    let targetModel = Config.OLLAMA_DEFAULT_MODEL;
    if (request.complexity === 'COMPLEX') {
      targetModel = Config.OLLAMA_COMPLEX_MODEL;
    } else if (request.complexity === 'CODE' as any) {
      targetModel = Config.OLLAMA_CODE_MODEL;
    } else if (request.complexity === 'VISION' as any || request.complexity === 'STRATEGIC' as any) {
      targetModel = Config.OLLAMA_STRATEGIC_MODEL;
    } else if (request.complexity === 'FAST' as any) {
      targetModel = Config.OLLAMA_FAST_MODEL;
    }

    try {
      const response = await this.localProvider.generate({
        ...request,
        targetModel
      } as any);
      this.logSuccess('LOCAL', response.model, startTime, response.usage);
      return response;
    } catch (error: any) {
      console.error(JSON.stringify({
        event: 'inference_failure',
        provider: 'LOCAL',
        model: targetModel,
        latencyMs: Date.now() - startTime,
        errorCategory: this.categorizeError(error),
        errorMessage: error.message
      }));
      throw error;
    }
  }

  /** opts.json: the caller parses JSON — Ollama is then constrained to emit valid JSON (format: "json"). */
  async callWithTier(
    tier: ModelTier,
    prompt: string,
    systemPrompt?: string,
    opts: { json?: boolean } = {},
  ): Promise<string> {
    const config = getTierConfig(tier);
    console.log(`[Gateway] callWithTier(${tier}) - REAL_PROVIDER_CALL: ${process.env.REAL_PROVIDER_CALL}`);

    if (config.provider === 'gemini' || process.env.REAL_PROVIDER_CALL === 'true') {
      if (!this.geminiProvider.isConfigured) {
        console.warn(`GEMINI_API_KEY not set, falling back to local model for tier ${tier}`);
        // To avoid infinite loop, don't pass opts again if we already forced it
        if (process.env.REAL_PROVIDER_CALL === 'true') {
            throw new Error("GEMINI_API_KEY not set but REAL_PROVIDER_CALL=true");
        }
        return this.callWithTier(ModelTier.LOCAL_BASIC, prompt, systemPrompt, opts);
      }
      try {
        const response = await this.geminiProvider.generate({
          prompt,
          systemMessage: systemPrompt,
          requireStructuredOutput: !!opts.json,
          temperature: 0.3,
          maxTokens: config.maxTokens,
        });
        return response.text;
      } catch (error: any) {
        console.warn(`[Gateway] Gemini API error caught:`, error);
        console.warn(`Gemini API error: ${error.message}, falling back to local`);
        return this.callWithTier(ModelTier.LOCAL_BASIC, prompt, systemPrompt, opts);
      }
    }

    if (config.provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn(
          `ANTHROPIC_API_KEY not set, falling back to local model for tier ${tier}`,
        );
        return this.callWithTier(ModelTier.LOCAL_BASIC, prompt, systemPrompt, opts);
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          system: systemPrompt || 'You are a helpful AI assistant.',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        console.warn(`Anthropic API error ${response.status}, falling back to local`);
        return this.callWithTier(ModelTier.LOCAL_BASIC, prompt, systemPrompt, opts);
      }
      const data = await response.json() as any;
      return data.content?.[0]?.text || '';
    }

    // Ollama path. Streamed: with stream:false Ollama sends no headers until the whole reply is done,
    // and Node's fetch gives up after 300 s without headers — long CPU generations always failed.
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    try {
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
          stream: true,
          ...(opts.json ? { format: 'json' } : {}),
          options: { num_predict: config.maxTokens, temperature: 0.3 },
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Ollama error: ${response.status}`);
      }
      return readOllamaStream(response.body);
    } catch (e) {
      console.error("[Gateway] Ollama fetch failed:", e);
      throw e;
    }
  }

  private logSuccess(provider: string, model: string, startTime: number, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) {
    console.log(JSON.stringify({
      event: 'inference_success',
      provider,
      model,
      latencyMs: Date.now() - startTime,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    }));
  }

  private categorizeError(error: any): string {
    if (error.name === 'AbortError') return 'TIMEOUT';
    if (error.message && error.message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (error.message && error.message.includes('JSON')) return 'MALFORMED_RESPONSE';
    if (error.message && error.message.includes('Ollama API error: 404')) return 'MODEL_NOT_FOUND';
    return 'UNKNOWN_ERROR';
  }
}

/** Joins Ollama's NDJSON stream ({"response": "...", "done": bool} per line) into the full reply text. */
export async function readOllamaStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let buffered = '';
  let text = '';
  const take = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
    text += chunk.response ?? '';
  };
  for await (const part of body as any as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(part, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    lines.forEach(take);
  }
  take(buffered + decoder.decode());
  return text;
}
