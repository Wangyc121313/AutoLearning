import type { FetchResult } from '../types';

export interface Fetcher {
  supports(url: string): boolean;
  fetch(url: string): Promise<FetchResult>;
}

export { TextFetcher } from './text-fetcher';
export { VideoFetcher } from './video-fetcher';

import { TextFetcher } from './text-fetcher';
import { VideoFetcher } from './video-fetcher';

const videoFetcher = new VideoFetcher({ transcriber: 'whisper' });
const textFetcher = new TextFetcher();

const fetchers: Fetcher[] = [videoFetcher, textFetcher];

export function getFetcher(url: string, type: 'text' | 'video' | 'auto'): Fetcher {
  if (type === 'text') return textFetcher;
  if (type === 'video') return videoFetcher;

  for (const f of fetchers) {
    if (f.supports(url)) return f;
  }
  return textFetcher;
}
