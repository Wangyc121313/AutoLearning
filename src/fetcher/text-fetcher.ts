import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';

export class TextFetcher implements Fetcher {
  supports(_url: string): boolean {
    return true; // TextFetcher is the fallback for all HTTP URLs
  }

  async fetch(url: string): Promise<FetchResult> {
    const response = await fetch(url);
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
  }
}
