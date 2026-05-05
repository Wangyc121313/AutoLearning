import { execSync } from 'node:child_process';
import fs from 'node:fs';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';

const VIDEO_URL_PATTERNS = [
  /youtube\.com\/watch\?v=/,
  /youtu\.be\//,
  /bilibili\.com\/video\//,
];

export class VideoFetcher implements Fetcher {
  constructor(private options: { transcriber: string; tmpDir?: string }) {}

  supports(url: string): boolean {
    return VIDEO_URL_PATTERNS.some((p) => p.test(url));
  }

  async fetch(url: string): Promise<FetchResult> {
    let subtitles: string | null = null;
    try {
      subtitles = this.extractSubtitles(url);
    } catch {
      // No subtitles available, will need transcription later
    }

    if (subtitles) {
      return {
        title: this.extractTitle(url),
        rawText: subtitles,
      };
    }

    throw new Error(
      'No embedded subtitles found. Audio transcription is not yet integrated.'
    );
  }

  extractSubtitles(url: string): string {
    const videoId = Date.now().toString(36);
    execSync(
      `yt-dlp --skip-download --write-auto-subs --sub-lang en,zh-Hans,zh --convert-subs vtt --output "${videoId}.%(ext)s" "${url}"`,
      { encoding: 'utf-8', timeout: 60_000, stdio: 'pipe' }
    );

    // Look for generated subtitle files
    const candidates = [`${videoId}.en.vtt`, `${videoId}.zh-Hans.vtt`, `${videoId}.zh.vtt`];
    let subFile: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        subFile = c;
        break;
      }
    }

    if (!subFile) throw new Error('No subtitle file found');

    const content = fs.readFileSync(subFile, 'utf-8');
    fs.unlinkSync(subFile);
    return this.parseVTT(content);
  }

  private parseVTT(vtt: string): string {
    return vtt
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('WEBVTT') &&
          !line.match(/^\d{2}:/) &&
          !line.match(/^\d+$/) &&
          line.trim() !== ''
      )
      .map((line) => line.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ');
  }

  extractTitle(url: string): string {
    try {
      const result = execSync(`yt-dlp --get-title "${url}"`, {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: 'pipe',
      });
      return result.trim();
    } catch {
      return 'Untitled Video';
    }
  }
}
