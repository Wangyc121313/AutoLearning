import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'smol-toml';

export interface ProviderConfig {
  apiKey?: string;
  api_key?: string;
  model: string;
  baseUrl?: string;
  base_url?: string;
}

export interface Config {
  provider: { default: string };
  providers: Record<string, ProviderConfig>;
  output: { directory: string; filenameTemplate: string; filename_template?: string };
  whisper?: { apiKey?: string; api_key?: string; model: string };
  alibaba?: {
    accessKeyId?: string; access_key_id?: string;
    accessKeySecret?: string; access_key_secret?: string;
    appKey?: string; app_key?: string;
  };
}

function expandEnv(raw: string): string {
  return raw.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
}

function normalizeProvider(raw: Record<string, unknown>): ProviderConfig {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    normalized[camel] = expandEnv(String(v));
  }
  return normalized as unknown as ProviderConfig;
}

export function loadConfig(configPath?: string): Config {
  const resolvedPath = configPath ?? path.join(os.homedir(), '.autolearning', 'config.toml');
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = parse(raw) as Record<string, unknown>;

  const cfg: Config = {
    provider: (parsed.provider as { default: string }) ?? { default: 'claude' },
    providers: {},
    output: (parsed.output as Config['output']) ?? { directory: './notes', filenameTemplate: '{title}-{date}.md' },
  };

  // Normalize output
  if (cfg.output.filename_template) {
    cfg.output.filenameTemplate = cfg.output.filename_template;
    delete cfg.output.filename_template;
  }

  // Normalize providers
  const providers = (parsed.providers ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, raw] of Object.entries(providers)) {
    cfg.providers[name] = normalizeProvider(raw);
  }

  // Optional sections
  if (parsed.whisper) {
    cfg.whisper = normalizeProvider(parsed.whisper as Record<string, unknown>);
  }
  if (parsed.alibaba) {
    cfg.alibaba = normalizeProvider(parsed.alibaba as Record<string, unknown>);
  }

  return cfg;
}
