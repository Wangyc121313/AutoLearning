import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mockGenerate = vi.fn();

// Mock the generator module to avoid real AI calls
vi.mock('./generator/index', () => ({
  getGenerator: vi.fn(() => ({ generate: mockGenerate })),
  ClaudeGenerator: class {},
  OpenAIGenerator: class {},
  OllamaGenerator: class {},
}));

import { runPipeline } from './pipeline';
import { getGenerator } from './generator/index';
import type { Config } from './config';

const testDir = path.join(os.tmpdir(), 'autolearning-pipeline-test-' + Date.now());
const notesDir = path.join(testDir, 'notes');

const mockConfig: Config = {
  provider: { default: 'claude' },
  providers: {
    claude: { apiKey: 'sk-test', model: 'claude-sonnet-4-6' },
  },
  output: { directory: notesDir, filenameTemplate: '{title}-{date}.md' },
};

beforeEach(() => {
  mockGenerate.mockResolvedValue('# Test Note\n\n## Summary\n\nGenerated test content.');
  fs.mkdirSync(notesDir, { recursive: true });
});

afterEach(() => {
  vi.clearAllMocks();
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('runPipeline', () => {
  it('orchestrates fetch -> parse -> generate -> output end-to-end (text type)', async () => {
    const mockHtml =
      `<html><head><title>Pipeline Test</title></head><body><article><h1>Hello</h1><p>This is test content for the pipeline.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const result = await runPipeline(
      'https://example.com/test',
      'text',
      mockConfig,
      { providerOverride: 'claude' },
    );

    expect(result.markdown).toBe('# Test Note\n\n## Summary\n\nGenerated test content.');
    expect(result.filePath).toContain(notesDir);
    expect(fs.existsSync(result.filePath)).toBe(true);

    // Verify the file content was written
    const written = fs.readFileSync(result.filePath, 'utf-8');
    expect(written).toBe('# Test Note\n\n## Summary\n\nGenerated test content.');
  });

  it('resolves auto type based on fetcher used', async () => {
    const mockHtml =
      `<html><head><title>Auto Type Test</title></head><body><article><p>Content for auto type detection.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const result = await runPipeline(
      'https://example.com/auto-test',
      'auto',
      mockConfig,
      { providerOverride: 'claude' },
    );

    expect(result.filePath).toContain(notesDir);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('passes the correct provider to getGenerator', async () => {
    const mockHtml =
      `<html><head><title>Provider Test</title></head><body><article><p>Provider override test.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    await runPipeline(
      'https://example.com/provider-test',
      'text',
      mockConfig,
      { providerOverride: 'openai' },
    );

    // Verify getGenerator was called with the override provider
    expect(getGenerator).toHaveBeenCalledWith('openai', expect.any(Object));
  });

  it('creates output directory if it does not exist', async () => {
    const newDir = path.join(testDir, 'new-notes');
    const configWithNewDir: Config = {
      ...mockConfig,
      output: { directory: newDir, filenameTemplate: '{title}.md' },
    };

    const mockHtml =
      `<html><head><title>Dir Test</title></head><body><article><p>Test mkdir.</p></article></body></html>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    // Directory should not exist before the pipeline
    expect(fs.existsSync(newDir)).toBe(false);

    await runPipeline(
      'https://example.com/dir-test',
      'text',
      configWithNewDir,
      { providerOverride: 'claude' },
    );

    expect(fs.existsSync(newDir)).toBe(true);

    // Cleanup
    fs.rmSync(newDir, { recursive: true, force: true });
  });
});
