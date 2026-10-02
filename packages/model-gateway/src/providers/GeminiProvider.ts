import { ModelProvider, ModelRequest, ModelResponse, ModelCapabilities } from '../types';
import { Config } from '../config';

export class GeminiProvider implements ModelProvider {
  name = 'gemini';

  capabilities: ModelCapabilities = {
    supportsVision: true,
    supportsFunctionCalling: true,
    maxTokens: 65536,
  };

  get isConfigured(): boolean {
    return !!Config.GEMINI_API_KEY;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const apiKey = Config.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const model = Config.GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents: any[] = [];
    if (request.systemMessage) {
      contents.push({ role: 'user', parts: [{ text: `System: ${request.systemMessage}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: request.prompt }] });

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 8192,
        temperature: request.temperature ?? 0.7,
      },
    };
    if (request.requireStructuredOutput) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    console.log("[GeminiProvider] fetching URL:", url);
    console.log("[GeminiProvider] body:", JSON.stringify(body).slice(0, 500));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[GeminiProvider] fetch failed!", res.status, err);
      throw new Error(`Gemini API ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';

    let structuredOutput: any;
    if (request.requireStructuredOutput) {
      try { 
        let cleanText = text.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.substring(7);
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith('```')) {
          cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        cleanText = cleanText.trim();
        structuredOutput = JSON.parse(cleanText); 
      } catch (e: any) {
        console.error('Failed to parse JSON:', e.message);
        console.error('Text start:', text.substring(0, 500));
        console.error('Text end:', text.substring(text.length - 500));
        throw new Error('Gemini returned non-JSON when structured output was required');
      }
    }

    const usage = data.usageMetadata ?? {};
    return {
      text,
      structuredOutput,
      provider: 'gemini',
      model,
      finishReason: data.candidates?.[0]?.finishReason ?? 'STOP',
      usage: {
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      },
    };
  }
}
