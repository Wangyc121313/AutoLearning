import type { FetchResult } from '../types';

export interface Fetcher {
  /** Whether this fetcher can handle the given URL */
  supports(url: string): boolean;
  /** Fetch content from URL and return raw text + title */
  fetch(url: string): Promise<FetchResult>;
}

export { TextFetcher } from './text-fetcher';
