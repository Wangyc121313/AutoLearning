import { describe, it, expect, vi } from 'vitest';
import { OpenAIGenerator } from './openai';
import type { StructuredContent } from '../types';

describe('OpenAIGenerator', () => {
  it('sends content to OpenAI API and returns markdown', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '# Notes\n\n## Summary\n\nTest notes.' } }],
    });

    const generator = new OpenAIGenerator({ apiKey: 'test-key', model: 'gpt-4o' });
    (generator as any).client = { chat: { completions: { create: mockCreate } } };

    const content: StructuredContent = {
      title: 'Test',
      content: 'Body text.',
      sourceUrl: 'https://example.com',
      metadata: { type: 'text', wordCount: 2, fetchedAt: new Date() },
    };

    const result = await generator.generate(content);
    expect(result).toContain('# Notes');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
