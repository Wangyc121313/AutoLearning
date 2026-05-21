import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'smol-toml';

export interface ProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

export interface Config {
  provider: { default: string };
  providers: Record<string, ProviderConfig>;
  output: { directory: string; filenameTemplate: string };
  whisper?: { apiKey?: string; model: string };
  alibaba?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    appKey?: string;
  };
  localWhisper?: { modelSize: string };
}

function expandEnv(raw: string): string {
  return raw.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
}

/** Resolve a value from the raw record, trying camelCase first then snake_case, then expand env vars. */
function resolveExpanded(raw: Record<string, unknown>, camelKey: string, snakeKey: string): string {
  const v = raw[camelKey] ?? raw[snakeKey];
  return expandEnv(String(v ?? ''));
}

function normalizeProvider(raw: Record<string, unknown>): ProviderConfig {
  const model = resolveExpanded(raw, 'model', 'model');
  if (!model) throw new Error('Provider must have a "model" field');

  return {
    apiKey: resolveExpanded(raw, 'apiKey', 'api_key') || undefined,
    model,
    baseUrl: resolveExpanded(raw, 'baseUrl', 'base_url') || undefined,
  };
}

export function loadConfig(configPath?: string): Config {
  const resolvedPath = configPath ?? path.join(os.homedir(), '.autolearning', 'config.toml');
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = parse(raw) as Record<string, unknown>;

  // Provider section
  const providerSection = (parsed.provider ?? {}) as Record<string, unknown>;

  // Output section — expand env vars in directory and filenameTemplate
  const rawOutput = (parsed.output ?? {}) as Record<string, unknown>;
  const outputDir = rawOutput.directory ?? './notes';
  const outputTemplate = rawOutput.filenameTemplate ?? rawOutput.filename_template ?? '{title}-{date}.md';

  const cfg: Config = {
    provider: { default: String(providerSection.default ?? 'claude') },
    providers: {},
    output: {
      directory: expandEnv(String(outputDir)),
      filenameTemplate: expandEnv(String(outputTemplate)),
    },
  };

  // Normalize providers
  const providers = (parsed.providers ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, providerRaw] of Object.entries(providers)) {
    cfg.providers[name] = normalizeProvider(providerRaw);
  }

  // Optional sections
  if (parsed.whisper) {
    const w = parsed.whisper as Record<string, unknown>;
    const wModel = resolveExpanded(w, 'model', 'model');
    if (!wModel) throw new Error('Whisper config must have a "model" field');
    cfg.whisper = {
      apiKey: resolveExpanded(w, 'apiKey', 'api_key') || undefined,
      model: wModel,
    };
  }
  if (parsed.alibaba) {
    const a = parsed.alibaba as Record<string, unknown>;
    cfg.alibaba = {
      accessKeyId: resolveExpanded(a, 'accessKeyId', 'access_key_id') || undefined,
      accessKeySecret: resolveExpanded(a, 'accessKeySecret', 'access_key_secret') || undefined,
      appKey: resolveExpanded(a, 'appKey', 'app_key') || undefined,
    };
  }

  // Parse local_whisper section
  if (parsed.local_whisper) {
    const lw = parsed.local_whisper as Record<string, unknown>;
    cfg.localWhisper = {
      modelSize: (lw.model_size as string) ?? (lw.modelSize as string) ?? 'base',
    };
  } else {
    cfg.localWhisper = { modelSize: 'base' };
  }

  return cfg;
}
