import { describe, it, expect, vi } from 'vitest';
import { ClaudeGenerator } from './claude';
import type { StructuredContent } from '../types';

describe('ClaudeGenerator', () => {
  it('sends content to Claude API and returns markdown', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '# Study Notes\n\n## Summary\n\nThis is a test.' }],
    });

    const generator = new ClaudeGenerator({ apiKey: 'test-key', model: 'claude-sonnet-4-6' });
    (generator as any).client = { messages: { create: mockCreate } };

    const content: StructuredContent = {
      title: 'Test Article',
      content: 'This is the article body.',
      sourceUrl: 'https://example.com',
      metadata: { type: 'text', wordCount: 5, fetchedAt: new Date() },
    };

    const result = await generator.generate(content);
    expect(result).toContain('# Study Notes');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
