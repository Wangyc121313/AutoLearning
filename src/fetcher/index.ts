import type { FetchResult } from '../types';

export interface Fetcher {
  supports(url: string): boolean;
  fetch(url: string): Promise<FetchResult>;
}

export { TextFetcher } from './text-fetcher';
export { VideoFetcher } from './video-fetcher';

import { TextFetcher } from './text-fetcher';
import { VideoFetcher } from './video-fetcher';

const fetchers: Fetcher[] = [
  new VideoFetcher({ transcriber: 'whisper' }),
  new TextFetcher(),
];

export function getFetcher(url: string, type: 'text' | 'video' | 'auto'): Fetcher {
  if (type === 'text') return new TextFetcher();
  if (type === 'video') return new VideoFetcher({ transcriber: 'whisper' });

  for (const f of fetchers) {
    if (f.supports(url)) return f;
  }
  return new TextFetcher();
}
