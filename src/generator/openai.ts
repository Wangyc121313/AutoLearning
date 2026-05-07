import OpenAI from 'openai';
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

export class OpenAIGenerator implements Generator {
  private client: OpenAI;

  constructor(private config: { apiKey: string; model: string; baseUrl?: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async generate(content: StructuredContent): Promise<string> {
    const result = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Title: ${content.title}\n\nSource: ${content.sourceUrl}\n\nContent:\n${content.content}`,
        },
      ],
    });

    const text = result.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Empty response from OpenAI API');
    }

    return text;
  }
}
