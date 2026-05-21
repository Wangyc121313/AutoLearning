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

  private extractTitle(url: string): string {
    try {
      const result = execFileSync('yt-dlp', ['--get-title', url], {
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
