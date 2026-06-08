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

const GENERIC_TITLE_PATTERNS = [
  /^来看看/i,
  /^Chat\b/i,
  /^(New Chat|Untitled|No Title)$/i,
  /^https?:\/\//i,
  /^.{1,5}$/,
  /^Untitled/i,
  /^未命名/i,
  /^无标题/i,
];

function isGenericTitle(title: string): boolean {
  if (!title || title.length < 2) return true;
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(title));
}

export async function fixTitle(
  text: string,
  currentTitle: string,
  config: ProviderConfig,
): Promise<string> {
  if (!isGenericTitle(currentTitle)) return currentTitle;

  // Use first ~1000 chars of content for context
  const snippet = text.slice(0, 1000);

  const client = new OpenAI({
    apiKey: config.apiKey ?? '',
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 50,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are a title writer. Given content snippet, output ONLY a concise, descriptive title (max 15 words) in the same language as the content. No quotes, no Markdown, no explanation.',
        },
        {
          role: 'user',
          content: `Content:\n${snippet}\n\nGenerate a title:`,
        },
      ],
    });

    const generated = response.choices[0]?.message?.content?.trim();
    if (generated && generated.length > 2 && generated.length < 100) {
      return generated.replace(/^["'《]|["'》]$/g, '');
    }
  } catch {
    // If title generation fails, keep the original
  }

  return currentTitle;
}
