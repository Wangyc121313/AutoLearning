import type { Generator } from './index';
import type { StructuredContent } from '../types';

const SYSTEM_PROMPT = `You are a study note generator. Given the content of an article or video transcript, produce well-structured Markdown study notes.

Rules:
- Start with a # title matching the source
- Use ## and ### for logical sections
- Extract and define key concepts in bold
- Preserve important facts, numbers, and definitions
- Remove filler, ads, and redundant text
- Use bullet lists for enumeration
- End with a ## Key Takeaways section
- Do NOT fabricate any content not present in the source
- Write in the same language as the source content`;

export class OllamaGenerator implements Generator {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
  }

  async generate(content: StructuredContent): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: `${SYSTEM_PROMPT}\n\nTitle: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }
}
