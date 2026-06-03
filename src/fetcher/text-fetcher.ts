import type { Fetcher } from './index';
import type { FetchResult } from '../types';

const JINA_BASE = 'https://r.jina.ai/';

export class TextFetcher implements Fetcher {
  supports(_url: string): boolean {
    return true; // TextFetcher is the fallback for all HTTP URLs
  }

  async fetch(url: string): Promise<FetchResult> {

    // Strategy 1: r.jina.ai proxy (handles anti-bot, returns clean Markdown)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(`${JINA_BASE}${url}`, {
          signal: controller.signal,
          headers: {
            'Accept': 'text/markdown,text/plain,*/*',
            'User-Agent': 'AutoLearning/0.1',
          },
        });

        if (response.ok) {
          const text = await response.text();
          const title = this.extractTitleFromMarkdown(text) ?? url;

          if (text.trim().length > 100) {
            return { title, rawText: text };
          }
          // Fall through to strategy 2 if content is too short
        }
        // Fall through to strategy 2 on non-ok
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // r.jina.ai failed — fall through to strategy 2
    }

    // Strategy 2: direct fetch with browser-like headers
    console.error('r.jina.ai failed, trying direct fetch...');
    return this.directFetch(url);
  }

  private async directFetch(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const { JSDOM } = await import('jsdom');
      const { Readability } = await import('@mozilla/readability');

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${url} (HTTP ${response.status})`);
      }

      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      return {
        title: article?.title ?? dom.window.document.title ?? 'Untitled',
        rawText: article?.textContent ?? dom.window.document.body?.textContent ?? '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractTitleFromMarkdown(markdown: string): string | null {
    const match = markdown.match(/^Title:\s*(.+)$/m);
    if (match) return match[1].trim();

    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1].trim();

    return null;
  }
}
