import { LocalProvider } from '../providers/LocalProvider';
import { Config } from '../config';

// Mock fetch globally
const globalFetch = jest.fn();
(global as any).fetch = globalFetch;

describe('LocalProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OLLAMA_TIMEOUT_MS = '1000';
    process.env.OLLAMA_MAX_CONCURRENT_REQUESTS = '2';
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
  });

  it('should generate text successfully', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        response: 'Hello world',
        done_reason: 'stop',
        prompt_eval_count: 10,
        eval_count: 5
      })
    });

    const provider = new LocalProvider();
    const result = await provider.generate({
      prompt: 'say hello',
      targetModel: 'qwen2.5:7b'
    } as any);

    expect(result.text).toBe('Hello world');
    expect(result.model).toBe('qwen2.5:7b');
    expect(result.usage.totalTokens).toBe(15);
  });

  it('should parse structured output when requested', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        response: '{"key": "value"}',
        done_reason: 'stop'
      })
    });

    const provider = new LocalProvider();
    const result = await provider.generate({
      prompt: 'json',
      requireStructuredOutput: true
    } as any);

    expect(result.structuredOutput).toEqual({ key: 'value' });
  });

  it('should throw error on invalid structured output', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        response: 'not json',
        done_reason: 'stop'
      })
    });

    const provider = new LocalProvider();
    await expect(provider.generate({
      prompt: 'json',
      requireStructuredOutput: true
    } as any)).rejects.toThrow(/Malformed structured output JSON/);
  });

  it('should retry on transient error (fetch failed)', async () => {
    globalFetch
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          response: 'Success after retry',
          done_reason: 'stop'
        })
      });

    const provider = new LocalProvider();
    const result = await provider.generate({ prompt: 'retry test' });
    
    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Success after retry');
  });

  it('should not retry on 404 (model not found)', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const provider = new LocalProvider();
    
    await expect(provider.generate({ prompt: '404 test' })).rejects.toThrow(/Ollama API error: 404 Not Found/);
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });

  it('should limit concurrency', async () => {
    // mock fetch to just delay
    globalFetch.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        text: async () => JSON.stringify({ response: 'ok' })
      }), 100);
    }));

    const provider = new LocalProvider();
    
    const start = Date.now();
    await Promise.all([
      provider.generate({ prompt: '1' }),
      provider.generate({ prompt: '2' }),
      provider.generate({ prompt: '3' }),
    ]);
    const duration = Date.now() - start;
    
    // With max concurrency 2, 3 requests should take at least 200ms
    expect(duration).toBeGreaterThanOrEqual(190);
  });
});
