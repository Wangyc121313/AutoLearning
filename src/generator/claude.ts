import Anthropic from '@anthropic-ai/sdk';
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
- Write in the same language as the source content
- When writing in Chinese, use Simplified Chinese (简体中文)`;

export class ClaudeGenerator implements Generator {
  private client: Anthropic;

  constructor(private config: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(content: StructuredContent): Promise<string> {
    const result = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Title: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        },
      ],
    });

    const text = result.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('Unexpected response format from Claude API');
    }

    return text.text;
  }
}
