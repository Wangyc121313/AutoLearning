import OpenAI from 'openai';
import type { ProviderConfig } from '../config';

const OPTIMIZE_PROMPT = `You are a transcript cleaner. Given raw video transcript or subtitle text, clean it up into well-formatted prose.

Rules:
- Remove all timestamps (e.g., [00:01 - 00:03])
- Remove metadata headers (Detected Language, Language Probability, etc.)
- Fix obvious typos, homophone errors, and ASR mistakes
- Recombine sentences that were split by timestamp boundaries into complete, grammatical sentences
- Remove filler words and repetitions, but keep the original meaning
- Group into natural paragraphs (3-8 sentences each) separated by blank lines
- Output ONLY the cleaned text. No preamble, no "Here is the cleaned transcript", no meta-commentary
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
      { role: 'user', content: `Clean up the following transcript:\n\n${rawText}` },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Empty response from optimizer LLM');

  return text.trim();
}
