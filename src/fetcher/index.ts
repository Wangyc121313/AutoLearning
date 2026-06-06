import type { FetchResult } from '../types';

export interface Fetcher {
  supports(url: string): boolean;
  fetch(url: string): Promise<FetchResult>;
}

export { TextFetcher } from './text-fetcher';
export { VideoFetcher } from './video-fetcher';

import type { Transcriber } from '../transcriber/index';

import { TextFetcher } from './text-fetcher';
import { VideoFetcher } from './video-fetcher';
import type { VideoFetcherOptions } from './video-fetcher';

export function getFetcher(
  url: string,
  type: 'text' | 'video' | 'auto',
  videoOptions?: VideoFetcherOptions,
  transcriberInstance?: Transcriber,
): Fetcher {
  const fullOptions: VideoFetcherOptions = {
    ...(videoOptions ?? { transcriber: 'whisper' }),
    transcriberInstance,
  };
  if (type === 'video') return new VideoFetcher(fullOptions);
  if (type === 'text') return new TextFetcher({ cookiesFromBrowser: videoOptions?.cookiesFromBrowser });

  // auto-detect: try VideoFetcher first for video URLs, fall back to TextFetcher
  const vf = new VideoFetcher(fullOptions);
  if (vf.supports(url)) return vf;
  return new TextFetcher({ cookiesFromBrowser: videoOptions?.cookiesFromBrowser });
}
