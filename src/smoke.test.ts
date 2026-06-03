import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './config';
import { parseContent } from './parser/index';
import { writeNote } from './output/index';
import { getFetcher } from './fetcher/index';
import { getGenerator } from './generator/index';

const testDir = path.join(os.tmpdir(), 'autolearning-smoke-' + Date.now());
const notesDir = path.join(testDir, 'notes');
const configDir = path.join(testDir, 'config');
const configPath = path.join(configDir, 'config.toml');

beforeEach(() => {
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    `
[provider]
default = "claude"

[providers.claude]
api_key = "sk-test"
model = "claude-sonnet-4-6"

[output]
directory = "${notesDir}"
filename_template = "{title}-{date}.md"
`,
  );
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('Autolearning smoke test', () => {
  it('full pipeline: config -> fetch -> parse -> generate -> output', async () => {
    const config = loadConfig(configPath);
    expect(config.provider.default).toBe('claude');

    // Fetch
    const mockMarkdown = `# Smoke Test Article\n\nHello. This is content for the smoke test. It has enough text to pass any minimum length checks that exist in the pipeline.\n\n## Section\n\nMore content here to ensure the raw text is long enough.`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockMarkdown),
    });

    const fetcher = getFetcher('https://example.com/article', 'text');
    const raw = await fetcher.fetch('https://example.com/article');
    expect(raw.title).toBe('Smoke Test Article');

    // Parse
    const content = parseContent(raw, 'https://example.com/article', 'text');
    expect(content.metadata.type).toBe('text');
    expect(content.metadata.wordCount).toBeGreaterThan(0);

    // Generate (mocked -- no real API call)
    const generator = getGenerator('claude', config.providers);
    (generator as any).generate = vi.fn().mockResolvedValue('# Smoke Test\n\n## Summary\n\nGenerated notes.');

    const markdown = await generator.generate(content);
    expect(markdown).toContain('# Smoke Test');

    // Output
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true });
    }
    const result = writeNote(markdown, content.title, notesDir, config.output.filenameTemplate);
    expect(fs.existsSync(result.filePath)).toBe(true);

    const writtenContent = fs.readFileSync(result.filePath, 'utf-8');
    expect(writtenContent).toContain('# Smoke Test');
  });

  it('config: env var expansion', () => {
    process.env.SMOKE_TEST_KEY = 'smoke-value';
    fs.writeFileSync(
      configPath,
      `
[provider]
default = "openai"

[providers.openai]
api_key = "\${SMOKE_TEST_KEY}"
model = "gpt-4o"

[output]
directory = "./notes"
filename_template = "{title}.md"
`,
    );

    const config = loadConfig(configPath);
    expect(config.providers.openai?.apiKey).toBe('smoke-value');
    delete process.env.SMOKE_TEST_KEY;
  });

  it('CLI --help exits successfully', () => {
    const result = spawnSync('npx', ['tsx', 'src/cli.ts', '--help'], {
      encoding: 'utf-8',
      timeout: 30_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('autolearn');
  }, 30_000);

  it('Fetcher routing: auto and explicit types', () => {
    const videoFetcher = getFetcher('https://youtube.com/watch?v=test', 'auto');
    expect(videoFetcher.constructor.name).toBe('VideoFetcher');

    const textFetcher = getFetcher('https://example.com/blog', 'auto');
    expect(textFetcher.constructor.name).toBe('TextFetcher');

    const forcedText = getFetcher('https://youtube.com/watch?v=test', 'text');
    expect(forcedText.constructor.name).toBe('TextFetcher');
  });

  it('Generator routing: all providers instantiate correctly', () => {
    const claude = getGenerator('claude', { claude: { apiKey: 'k', model: 'm' } });
    expect(claude.constructor.name).toBe('ClaudeGenerator');

    const openai = getGenerator('openai', { openai: { apiKey: 'k', model: 'm' } });
    expect(openai.constructor.name).toBe('OpenAIGenerator');

    const ollama = getGenerator('ollama', { ollama: { baseUrl: 'http://x', model: 'm' } });
    expect(ollama.constructor.name).toBe('OllamaGenerator');
  });
});
