import OpenAI from 'openai';
import type { ProviderConfig } from '../config';

const OPTIMIZE_PROMPT = `You are a content cleaner. Given raw text from a video transcript, subtitle file, or web page, clean it up into well-formatted prose for study notes.

Rules:
- For video/transcript: remove all timestamps (e.g., [00:01 - 00:03]), metadata headers, fix ASR typos, recombine split sentences
- For web content: remove navigation text, sidebars, ads, footers, comment sections, and other non-article noise
- Remove any Markdown heading like "Title: ..." that duplicates the extracted title
- Fix obvious typos and grammar issues
- Remove filler words and repetitions, but keep the original meaning
- Group into natural paragraphs (3-8 sentences each) separated by blank lines
- Preserve important facts, numbers, quotes, and definitions exactly as written
- Output ONLY the cleaned text. No preamble, no meta-commentary
- Write in the same language as the input`;

const MIN_CHARS_FOR_OPTIMIZATION = 200;

export async function optimizeTranscript(
  rawText: string,
  config: ProviderConfig,
): Promise<string> {
  if (rawText.length < MIN_CHARS_FOR_OPTIMIZATION) {
    return rawText;
  }

  const client = new OpenAI({
    apiKey: config.apiKey ?? '',
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });

  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: 'system', content: OPTIMIZE_PROMPT },
      { role: 'user', content: `Clean up the following content:\n\n${rawText}` },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Empty response from optimizer LLM');

  return text.trim();
}
