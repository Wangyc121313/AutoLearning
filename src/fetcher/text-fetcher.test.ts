import { describe, it, expect, vi, afterEach } from 'vitest';
import { TextFetcher } from './text-fetcher';

describe('TextFetcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports http and https URLs', () => {
    const fetcher = new TextFetcher();
    expect(fetcher.supports('https://example.com/article')).toBe(true);
    expect(fetcher.supports('http://blog.example.com')).toBe(true);
    expect(fetcher.supports('https://youtube.com/watch?v=123')).toBe(true);
  });

  it('fetches via r.jina.ai and returns markdown content', async () => {
    const mockMarkdown = [
      'Title: Test Article',
      '',
      '## Introduction',
      '',
      'Something something with enough characters to pass the minimum length check',
      'for the content cleaner to work properly in the pipeline and not get skipped.',
      'Adding more text here to ensure we have more than 100 characters in this mock.',
      '',
      'World content here with additional sentences to fill up space.',
    ].join('\n');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    });

    const fetcher = new TextFetcher();
    const result = await fetcher.fetch('https://example.com/article');

    expect(result.title).toBe('Test Article');
    expect(result.rawText).toBe(mockMarkdown);

    // Verify r.jina.ai URL was used
    const fetchUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(fetchUrl).toBe('https://r.jina.ai/https://example.com/article');
  });

  it('falls back to direct fetch when r.jina.ai fails', async () => {
    const mockHtml = `<html><head><title>Direct Article</title></head><body><article><h1>Hello</h1><p>World content here with enough text to be meaningful for the test.</p></article></body></html>`;

    global.fetch = vi.fn()
      // First call: r.jina.ai fails
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('') })
      // Second call: direct fetch succeeds
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(mockHtml) });

    const fetcher = new TextFetcher();
    const result = await fetcher.fetch('https://example.com/article');

    expect(result.title).toBe('Direct Article');
    expect(result.rawText).toContain('Hello');
    expect(result.rawText).toContain('World content here');

    // Verify both strategies were tried
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('https://r.jina.ai/https://example.com/article');
    expect(calls[1][0]).toBe('https://example.com/article');
  });

  it('throws when both strategies fail', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const fetcher = new TextFetcher();
    await expect(fetcher.fetch('https://example.com/404')).rejects.toThrow('Failed to fetch URL');
  });
});
