import { describe, it, expect } from 'vitest';
import { sanitize } from './sanitize';

describe('sanitize', () => {
  it('strips Chinese polite closings', () => {
    const input = `## Summary\n\nSome content here.\n\n希望对你有所帮助！`;
    const result = sanitize(input);
    expect(result).not.toContain('希望对你有所帮助');
    expect(result).toContain('Some content here');
  });

  it('strips English polite closings', () => {
    const input = `## Summary\n\nSome content.\n\nLet me know if you need anything else!`;
    const result = sanitize(input);
    expect(result).not.toContain('Let me know');
    expect(result).toContain('Some content');
  });

  it('strips "Here is" preambles', () => {
    const input = `Here is a summary of the transcript:\n\n# Title\n\nContent.`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).toContain('# Title');
  });

  it('does not modify content without artifacts', () => {
    const input = `# Title\n\n## Section\n\nNormal content with key points.`;
    expect(sanitize(input)).toBe(input);
  });

  it('removes multiple patterns in one pass', () => {
    const input = `Here is the summary:\n\n## Notes\n\nGreat stuff.\n\nLet me know if you need changes!`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).not.toContain('Let me know');
    expect(result).toContain('## Notes');
    expect(result).toContain('Great stuff');
  });
});
