import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';

export class TextFetcher implements Fetcher {
  supports(_url: string): boolean {
    return true; // TextFetcher is the fallback for all HTTP URLs
  }

  async fetch(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
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

      try {
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        return {
          title: article?.title ?? dom.window.document.title ?? 'Untitled',
          rawText: article?.textContent ?? dom.window.document.body?.textContent ?? '',
        };
      } catch (parseError) {
        throw new Error(`Failed to parse content from ${url}: ${(parseError as Error).message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
