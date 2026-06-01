import { describe, it, expect, vi } from 'vitest';

const mockCreate = vi.hoisted(() => vi.fn().mockResolvedValue({
  choices: [{ message: { content: 'Cleaned transcript text.' } }],
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe('optimizeTranscript', () => {
  it('calls LLM API and returns cleaned text', async () => {
    const { optimizeTranscript } = await import('./index');

    const result = await optimizeTranscript(
      '**[00:01 - 00:03]**\n\nThis is raw transcript with timestamps.\n\n**[00:03 - 00:05]**\n\nAnd more content here for longer text to meet the minimum length requirement for optimization which needs to be at least 200 characters long so we add more content here to reach that threshold.',
      { apiKey: 'test-key', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('transcript');
    expect(result).toBe('Cleaned transcript text.');
  });

  it('skips optimization for short text (under 200 chars)', async () => {
    const { optimizeTranscript } = await import('./index');

    const shortText = 'Short text.';
    const result = await optimizeTranscript(shortText, { apiKey: 'test-key', model: 'test' });
    expect(result).toBe(shortText);
  });
});
