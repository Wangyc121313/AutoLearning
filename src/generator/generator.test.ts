import { describe, it, expect } from 'vitest';
import { getGenerator } from './index';

describe('getGenerator', () => {
  it('creates Claude generator when provider is claude', () => {
    const gen = getGenerator('claude', {
      claude: { apiKey: 'sk-test', model: 'claude-sonnet-4-6' },
    });
    expect(gen.constructor.name).toBe('ClaudeGenerator');
  });

  it('creates OpenAI generator when provider is openai', () => {
    const gen = getGenerator('openai', {
      openai: { apiKey: 'sk-test', model: 'gpt-4o' },
    });
    expect(gen.constructor.name).toBe('OpenAIGenerator');
  });

  it('creates Ollama generator when provider is ollama', () => {
    const gen = getGenerator('ollama', {
      ollama: { baseUrl: 'http://localhost:11434', model: 'llama3' },
    });
    expect(gen.constructor.name).toBe('OllamaGenerator');
  });

  it('throws for unknown provider', () => {
    expect(() => getGenerator('unknown', {})).toThrow('Unknown provider');
  });
});
