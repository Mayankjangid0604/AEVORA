import { describe, expect, it } from '@jest/globals';
import { readOllamaStream } from '../gateway';

const streamOf = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      parts.forEach((p) => c.enqueue(new TextEncoder().encode(p)));
      c.close();
    },
  });

describe('readOllamaStream', () => {
  it('joins response chunks, including lines split across network chunks', async () => {
    const s = streamOf('{"response":"{\\"a\\":"}\n{"respon', 'se":"1}"}\n', '{"response":"","done":true}');
    expect(await readOllamaStream(s)).toBe('{"a":1}');
  });
  it('surfaces Ollama stream errors', async () => {
    await expect(readOllamaStream(streamOf('{"error":"model not found"}\n'))).rejects.toThrow('model not found');
  });
});
