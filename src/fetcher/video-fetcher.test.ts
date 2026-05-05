import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoFetcher } from './video-fetcher';

describe('VideoFetcher', () => {
  let fetcher: VideoFetcher;

  beforeEach(() => {
    fetcher = new VideoFetcher({ transcriber: 'whisper' });
  });

  it('supports youtube and bilibili URLs', () => {
    expect(fetcher.supports('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(fetcher.supports('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(fetcher.supports('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
  });

  it('does not support regular article URLs', () => {
    expect(fetcher.supports('https://example.com/blog')).toBe(false);
  });

  it('extracts subtitles from VTT content', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world\n\n00:00:04.000 --> 00:00:06.000\nThis is a test`;
    // Access private method via bracket notation for testing
    const result = (fetcher as any).parseVTT(vtt);
    expect(result).toBe('Hello world This is a test');
  });
});
