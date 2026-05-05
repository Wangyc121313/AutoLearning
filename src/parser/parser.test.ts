import { describe, it, expect } from 'vitest';
import { parseContent } from './index';
import type { FetchResult } from '../types';

describe('parseContent', () => {
  it('cleans HTML tags from raw text', () => {
    const input: FetchResult = {
      title: 'Test',
      rawText: '<p>Hello <strong>world</strong></p>',
    };
    const result = parseContent(input, 'https://example.com', 'text');
    expect(result.content).not.toContain('<p>');
    expect(result.content).toContain('Hello');
  });

  it('preserves title from fetch result', () => {
    const input: FetchResult = {
      title: 'My Article',
      rawText: 'Some content here',
    };
    const result = parseContent(input, 'https://example.com', 'text');
    expect(result.title).toBe('My Article');
  });

  it('trims excessive whitespace', () => {
    const input: FetchResult = {
      title: 'Test',
      rawText: '  line1\n\n\n\nline2  ',
    };
    const result = parseContent(input, 'https://example.com', 'text');
    expect(result.content).toBe('line1\n\nline2');
  });

  it('sets metadata correctly', () => {
    const input: FetchResult = {
      title: 'Test',
      rawText: 'one two three four five',
    };
    const result = parseContent(input, 'https://example.com', 'video');
    expect(result.metadata.type).toBe('video');
    expect(result.metadata.wordCount).toBe(5);
    expect(result.sourceUrl).toBe('https://example.com');
  });
});
