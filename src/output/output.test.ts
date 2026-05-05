import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeNote } from './index';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const outDir = path.join(os.tmpdir(), 'autolearning-test-output-' + Date.now());

beforeEach(() => {
  fs.mkdirSync(outDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('writeNote', () => {
  it('writes markdown to a file in the output directory', () => {
    const result = writeNote(
      '# Test Note\n\nHello world.',
      'My Article',
      outDir,
      '{title}-{date}.md',
    );

    expect(result.filePath).toContain(outDir);
    expect(result.filePath).toContain('My-Article-');
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('sanitizes filename from title', () => {
    const result = writeNote(
      '# Test',
      'Title: With / Special \\ Chars?',
      outDir,
      '{title}.md',
    );

    const basename = path.basename(result.filePath);
    expect(basename).not.toContain('/');
    expect(basename).not.toContain('?');
    expect(basename).not.toContain(':');
  });

  it('throws if directory does not exist', () => {
    expect(() =>
      writeNote('# Test', 'Title', '/nonexistent/path', '{title}.md'),
    ).toThrow('Output directory does not exist');
  });
});
