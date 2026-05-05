import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaGenerator } from './ollama';
import type { StructuredContent } from '../types';

describe('OllamaGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends content to Ollama API and returns markdown', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: '# Ollama Notes\n\nTest content.' }),
    });

    const generator = new OllamaGenerator({ baseUrl: 'http://localhost:11434', model: 'llama3' });
    const content: StructuredContent = {
      title: 'Test',
      content: 'Body.',
      sourceUrl: 'https://example.com',
      metadata: { type: 'text', wordCount: 1, fetchedAt: new Date() },
    };

    const result = await generator.generate(content);
    expect(result).toContain('# Ollama Notes');
  });
});
