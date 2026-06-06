import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';

const JINA_BASE = 'https://r.jina.ai/';

export class TextFetcher implements Fetcher {
  private cookieFile: string | null = null;

  constructor(private options?: { cookiesFromBrowser?: string }) {}

  supports(_url: string): boolean {
    return true;
  }

  async fetch(url: string): Promise<FetchResult> {
    // Strategy 1: r.jina.ai proxy (handles anti-bot, returns clean Markdown)
    try {
      const result = await this.fetchViaJina(url);
      if (result) return result;
    } catch {
      // Fall through
    }

    // Strategy 2: curl with browser cookies (for sites that need login)
    if (this.options?.cookiesFromBrowser) {
      try {
        const result = await this.fetchWithCookies(url);
        if (result) return result;
      } catch {
        // Fall through
      }
    }

    // Strategy 3: direct Node.js fetch with Readability
    console.error('r.jina.ai and cookie fetch failed, trying direct fetch...');
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

  private async fetchWithCookies(url: string): Promise<FetchResult | null> {
    const cookieFile = await this.ensureCookies();
    if (!cookieFile) return null;

    console.error('Fetching with browser cookies...');

    return new Promise((resolve, reject) => {
      try {
        const stdout = execFileSync('curl', [
          '--silent', '--max-time', '15',
          '-b', cookieFile,
          '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
          '-L',
          url,
        ], { encoding: 'utf-8', timeout: 20_000, stdio: 'pipe' });

        if (!stdout || stdout.trim().length < 200) {
          resolve(null);
          return;
        }

        // Simple title extraction from HTML
        const titleMatch = stdout.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim() ?? url;

        resolve({ title, rawText: stdout.trim() });
      } catch (err) {
        reject(err);
      }
    });
  }

  private async ensureCookies(): Promise<string | null> {
    if (this.cookieFile) return this.cookieFile;

    const browser = this.options?.cookiesFromBrowser;
    if (!browser) return null;

    const cookiePath = path.join(os.tmpdir(), `autolearn_cookies_${Date.now().toString(36)}.txt`);

    try {
      execFileSync('yt-dlp', [
        '--cookies-from-browser', browser,
        '--cookies', cookiePath,
        '--skip-download',
        '--no-playlist',
        'https://www.bilibili.com',
      ], { encoding: 'utf-8', timeout: 15_000, stdio: 'pipe' });
    } catch {
      // Cookie export may fail if yt-dlp can't read the browser profile
      try { fs.unlinkSync(cookiePath); } catch { /* ignore */ }
      return null;
    }

    if (!fs.existsSync(cookiePath) || fs.statSync(cookiePath).size === 0) {
      return null;
    }

    this.cookieFile = cookiePath;
    return cookiePath;
  }

  /** Clean up temp cookie file */
  destroy() {
    if (this.cookieFile) {
      try { fs.unlinkSync(this.cookieFile); } catch { /* ignore */ }
    }
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
