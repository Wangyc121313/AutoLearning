import type { FetchResult } from '../types';

export interface Fetcher {
  supports(url: string): boolean;
  fetch(url: string): Promise<FetchResult>;
}

export { TextFetcher } from './text-fetcher';
export { VideoFetcher } from './video-fetcher';

import { TextFetcher } from './text-fetcher';
import { VideoFetcher } from './video-fetcher';
import type { VideoFetcherOptions } from './video-fetcher';

const textFetcher = new TextFetcher();

export function getFetcher(
  url: string,
  type: 'text' | 'video' | 'auto',
  videoOptions?: VideoFetcherOptions,
): Fetcher {
  if (type === 'video') return new VideoFetcher(videoOptions ?? { transcriber: 'whisper' });
  if (type === 'text') return textFetcher;

  // auto-detect: try VideoFetcher first for video URLs, fall back to TextFetcher
  const vf = new VideoFetcher(videoOptions ?? { transcriber: 'whisper' });
  if (vf.supports(url)) return vf;
  return textFetcher;
}
