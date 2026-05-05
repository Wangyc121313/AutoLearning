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

  it('fetches HTML from URL and returns raw text', async () => {
    const mockHtml = `<html><head><title>Test Article</title></head><body><article><h1>Hello</h1><p>World content here.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const fetcher = new TextFetcher();
    const result = await fetcher.fetch('https://example.com/article');

    expect(result.title).toBe('Test Article');
    expect(result.rawText).toContain('Hello');
    expect(result.rawText).toContain('World content here');
  });

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const fetcher = new TextFetcher();
    await expect(fetcher.fetch('https://example.com/404')).rejects.toThrow('Failed to fetch URL');
  });
});
