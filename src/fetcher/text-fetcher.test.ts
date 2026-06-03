import { describe, it, expect, vi, afterEach } from 'vitest';

const mockMarkdown = vi.hoisted(() => [
  'Title: Test Article',
  '',
  '## Introduction',
  '',
  'Content with enough characters to pass the minimum length check for the content cleaner',
  'to work properly in the pipeline and not get skipped by any validation logic.',
  'Adding more text here to ensure we have more than 100 characters in this mock.',
  '',
  'World content here.',
].join('\n'));

const mockExecFileSync = vi.hoisted(() => vi.fn().mockReturnValue(mockMarkdown));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

describe('TextFetcher', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('supports http and https URLs', async () => {
    const { TextFetcher } = await import('./text-fetcher');
    const fetcher = new TextFetcher();
    expect(fetcher.supports('https://example.com/article')).toBe(true);
    expect(fetcher.supports('http://blog.example.com')).toBe(true);
    expect(fetcher.supports('https://youtube.com/watch?v=123')).toBe(true);
  });

  it('fetches via r.jina.ai using curl and returns markdown', async () => {
    const { TextFetcher } = await import('./text-fetcher');

    const fetcher = new TextFetcher();
    const result = await fetcher.fetch('https://example.com/article');

    expect(result.title).toBe('Test Article');
    expect(result.rawText).toBe(mockMarkdown);
  });

  it('falls back to direct fetch when curl fails', async () => {
    // Make curl fail
    mockExecFileSync.mockImplementation(() => {
      throw new Error('curl failed');
    });

    const mockHtml = `<html><head><title>Direct Article</title></head><body><article><h1>Hello</h1><p>World content here with enough text for the minimum checks to pass validation correctly.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const { TextFetcher } = await import('./text-fetcher');
    const fetcher = new TextFetcher();
    const result = await fetcher.fetch('https://example.com/article');

    expect(result.title).toBe('Direct Article');
    expect(result.rawText).toContain('Hello');
    expect(result.rawText).toContain('World content here');

    global.fetch = undefined as any;
  });

  it('throws when both strategies fail', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('curl failed');
    });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const { TextFetcher } = await import('./text-fetcher');
    const fetcher = new TextFetcher();
    await expect(fetcher.fetch('https://example.com/404')).rejects.toThrow('Failed to fetch URL');

    global.fetch = undefined as any;
  });
});
