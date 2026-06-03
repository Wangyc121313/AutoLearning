import { execFileSync } from 'node:child_process';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';

const JINA_BASE = 'https://r.jina.ai/';

export class TextFetcher implements Fetcher {
  supports(_url: string): boolean {
    return true;
  }

  async fetch(url: string): Promise<FetchResult> {
    // Strategy 1: r.jina.ai via curl (handles anti-bot, returns clean Markdown)
    // Using curl subprocess because Node.js fetch() has DNS issues in some networks
    try {
      const result = await this.fetchViaJina(url);
      if (result) return result;
    } catch {
      // Fall through to strategy 2
    }

    // Strategy 2: direct fetch with Readability
    console.error('r.jina.ai failed, trying direct fetch...');
    return this.directFetch(url);
  }

  private async fetchViaJina(url: string): Promise<FetchResult | null> {
    const encoded = encodeURIComponent(url);
    const jinaUrl = `${JINA_BASE}${encoded}`;

    return new Promise((resolve, reject) => {
      try {
        const stdout = execFileSync('curl', [
          '--silent', '--max-time', '15',
          '-H', 'Accept: text/markdown,text/plain,*/*',
          '-H', 'User-Agent: AutoLearning/0.1',
          jinaUrl,
        ], { encoding: 'utf-8', timeout: 20_000, stdio: 'pipe' });

        if (!stdout || stdout.trim().length < 100) {
          resolve(null);
          return;
        }

        const title = this.extractTitleFromMarkdown(stdout) ?? url;
        resolve({ title, rawText: stdout.trim() });
      } catch (err) {
        reject(err);
      }
    });
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
