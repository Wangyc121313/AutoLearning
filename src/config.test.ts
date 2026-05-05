import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const configDir = path.join(os.tmpdir(), 'autolearning-test-' + Date.now());
const configPath = path.join(configDir, 'config.toml');

beforeEach(() => {
  fs.mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('loads a valid config file', () => {
    fs.writeFileSync(configPath, `
[provider]
default = "claude"

[providers.claude]
api_key = "sk-test"
model = "claude-sonnet-4-6"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
    const config = loadConfig(configPath);
    expect(config.provider.default).toBe('claude');
    expect(config.providers.claude.apiKey).toBe('sk-test');
  });

  it('expands ${ENV_VAR} references in config values', () => {
    process.env.TEST_KEY = 'env-value';
    fs.writeFileSync(configPath, `
[provider]
default = "openai"

[providers.openai]
api_key = "\${TEST_KEY}"
model = "gpt-4o"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
    const config = loadConfig(configPath);
    expect(config.providers.openai?.apiKey).toBe('env-value');
    delete process.env.TEST_KEY;
  });
});
