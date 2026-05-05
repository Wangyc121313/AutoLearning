import type { FetchResult, StructuredContent } from '../types';

export function parseContent(
  fetched: FetchResult,
  sourceUrl: string,
  type: 'text' | 'video',
): StructuredContent {
  let content = fetched.rawText
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const words = content.split(/\s+/).filter(Boolean);

  return {
    title: fetched.title,
    content,
    sourceUrl,
    metadata: {
      type,
      wordCount: words.length,
      fetchedAt: new Date(),
    },
  };
}
