import type { StructuredContent } from '../types';
import type { ProviderConfig } from '../config';

export interface Generator {
  generate(content: StructuredContent): Promise<string>;
}

export { ClaudeGenerator } from './claude';
export { OpenAIGenerator } from './openai';
export { OllamaGenerator } from './ollama';

import { ClaudeGenerator } from './claude';
import { OpenAIGenerator } from './openai';
import { OllamaGenerator } from './ollama';

export function getGenerator(
  provider: string,
  configs: Record<string, ProviderConfig>,
): Generator {
  const cfg = configs[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}. Check your config or --provider flag.`);

  switch (provider) {
    case 'claude':
      return new ClaudeGenerator({ apiKey: cfg.apiKey ?? '', model: cfg.model });
    case 'openai':
    case 'deepseek':
      return new OpenAIGenerator({ apiKey: cfg.apiKey ?? '', model: cfg.model, baseUrl: cfg.baseUrl });
    case 'ollama':
      return new OllamaGenerator({ baseUrl: cfg.baseUrl ?? 'http://localhost:11434', model: cfg.model });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
