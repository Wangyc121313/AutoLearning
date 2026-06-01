import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Fetcher } from './index';
import type { FetchResult } from '../types';
import type { Transcriber } from '../transcriber/index';

const VIDEO_URL_PATTERNS = [
  /youtube\.com\/watch\?v=/,
  /youtu\.be\//,
  /bilibili\.com\/video\//,
];

export interface VideoFetcherOptions {
  transcriber: string;
  tmpDir?: string;
  cookiesFromBrowser?: string; // e.g. "firefox", "chrome"
  transcriberInstance?: Transcriber; // for audio fallback when no subtitles
}

export class VideoFetcher implements Fetcher {
  constructor(private options: VideoFetcherOptions) {}

  supports(url: string): boolean {
    return VIDEO_URL_PATTERNS.some((p) => p.test(url));
  }

  async fetch(url: string): Promise<FetchResult> {
    const videoTitle = this.extractTitle(url);

    // Fast path: try embedded subtitles first
    try {
      const subtitles = this.extractSubtitles(url);
      return {
        title: videoTitle,
        rawText: subtitles,
      };
    } catch {
      // No subtitles — fall through to slow path
    }

    // Slow path: download audio + transcribe
    if (!this.options.transcriberInstance) {
      throw new Error(
        'No embedded subtitles found and no transcriber configured for audio fallback.'
      );
    }

    console.error('No subtitles found, downloading audio for transcription...');
    const audioPath = this.downloadAudio(url);

    console.error('Transcribing audio...');
    const transcript = await this.options.transcriberInstance.transcribe(audioPath);

    // Clean up audio file
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch {
      // Ignore cleanup errors
    }

    return {
      title: videoTitle,
      rawText: transcript,
    };
  }

  private downloadAudio(url: string): string {
    const tmpDir = this.options.tmpDir ?? os.tmpdir();
    const uniqueId = Date.now().toString(36);
    const outputTemplate = path.join(tmpDir, `audio_${uniqueId}.%(ext)s`);

    const args = [
      '--js-runtimes', 'node',
      '--format', 'bestaudio/best',
      '--output', outputTemplate,
      '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000',
      '--extract-audio',
      '--audio-format', 'm4a',
      '--audio-quality', '192K',
      '--no-playlist',
    ];

    if (this.options.cookiesFromBrowser) {
      args.push('--cookies-from-browser', this.options.cookiesFromBrowser);
    }
    args.push(url);

    execFileSync('yt-dlp', args, {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: 'pipe',
    });

    // Find downloaded file
    const expectedFile = path.join(tmpDir, `audio_${uniqueId}.m4a`);
    if (fs.existsSync(expectedFile)) return expectedFile;

    for (const ext of ['webm', 'mp3', 'opus', 'mp4']) {
      const alt = path.join(tmpDir, `audio_${uniqueId}.${ext}`);
      if (fs.existsSync(alt)) return alt;
    }

    throw new Error('Audio download failed: no output file found');
  }

  private extractSubtitles(url: string): string {
    const videoId = Date.now().toString(36);
    const tmpDir = this.options.tmpDir ?? os.tmpdir();

    const candidates = [
      path.join(tmpDir, `${videoId}.zh-Hans.vtt`),
      path.join(tmpDir, `${videoId}.zh-CN.vtt`),
      path.join(tmpDir, `${videoId}.zh.vtt`),
      path.join(tmpDir, `${videoId}.zh-TW.vtt`),
      path.join(tmpDir, `${videoId}.en.vtt`),
    ];

    try {
      // yt-dlp may exit non-zero if some subtitle languages fail (e.g. 429),
      // but other language tracks may still have succeeded — check files regardless.
      try {
        const args: string[] = [
          '--js-runtimes', 'node',
          '--skip-download',
          '--write-subs', '--write-auto-subs',
          '--sub-lang', 'en,zh-Hans,zh,zh-CN,zh-TW',
          '--convert-subs', 'vtt',
          '--output', path.join(tmpDir, `${videoId}.%(ext)s`),
        ];
        if (this.options.cookiesFromBrowser) {
          args.push('--cookies-from-browser', this.options.cookiesFromBrowser);
        }
        args.push(url);

        execFileSync('yt-dlp', args, {
          encoding: 'utf-8', timeout: 60_000, stdio: 'pipe',
        });
      } catch {
        // Ignore non-zero exit; check for subtitle files below
      }

      let subFile: string | null = null;
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          subFile = c;
          break;
        }
      }

      if (!subFile) throw new Error('No subtitle file found');

      const content = fs.readFileSync(subFile, 'utf-8');
      return this.parseVTT(content);
    } finally {
      for (const c of candidates) {
        try {
          if (fs.existsSync(c)) fs.unlinkSync(c);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  private parseVTT(vtt: string): string {
    // Split into cue blocks (separated by blank lines)
    const blocks = vtt
      .replace(/^WEBVTT[^\n]*\n/, '')
      .split(/\n{2,}/);

    const entries: { text: string }[] = [];
    const seenTexts = new Set<string>();

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const timingIdx = lines.findIndex((l) => l.includes('-->'));
      if (timingIdx < 0) continue;

      const timingLine = lines[timingIdx];
      const match = timingLine.match(
        /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/,
      );
      if (!match) continue;

      const textLines = lines.slice(timingIdx + 1);
      const rawText = textLines
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!rawText || rawText.length < 2 || seenTexts.has(rawText)) continue;
      seenTexts.add(rawText);

      entries.push({ text: rawText });
    }

    if (entries.length === 0) return '';

    // YouTube scrolling-append dedup:
    // If entry[i].text is a prefix of a later entry's text (within next 4), discard entry[i]
    const deduped: typeof entries = [];
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      let isIntermediate = false;
      for (let j = i + 1; j < Math.min(i + 5, entries.length); j++) {
        const next = entries[j];
        if (next.text.startsWith(current.text) && next.text.length > current.text.length) {
          isIntermediate = true;
          break;
        }
      }
      if (!isIntermediate) {
        deduped.push(current);
      }
    }

    return deduped.map((e) => e.text).join(' ');
  }

  private extractTitle(url: string): string {
    try {
      const result = execFileSync('yt-dlp', ['--js-runtimes', 'node', '--get-title', url], {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: 'pipe',
      });
      return result.trim();
    } catch (err) {
      console.warn('Failed to extract video title:', err);
      return 'Untitled Video';
    }
  }
}
