# Transcript Optimization, LLM Sanitization, VTT Dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve output quality via transcript cleaning (LLM pass), AI pleasantry stripping (regex), and VTT deduplication.

**Architecture:** Three independent modules. Optimizer sits between Fetcher and Parser for video content; Sanitizer runs after Generator on all content; VTT dedup replaces the current line-by-line parseVTT with block-aware parsing.

**Tech Stack:** Same as project — TypeScript, OpenAI SDK, Anthropic SDK

---

### Task 1: LLM Output Sanitizer (`src/output/sanitize.ts`)

**Files:**
- Create: `src/output/sanitize.ts`
- Create: `src/output/sanitize.test.ts`
- Modify: `src/pipeline.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/output/sanitize.test.ts
import { describe, it, expect } from 'vitest';
import { sanitize } from './sanitize';

describe('sanitize', () => {
  it('strips Chinese polite closings', () => {
    const input = `## Summary\n\nSome content here.\n\n希望对你有所帮助！`;
    const result = sanitize(input);
    expect(result).not.toContain('希望对你有所帮助');
    expect(result).toContain('Some content here');
    expect(result).toMatch(/Some content here\.?\s*$/);
  });

  it('strips English polite closings', () => {
    const input = `## Summary\n\nSome content.\n\nLet me know if you need anything else!`;
    const result = sanitize(input);
    expect(result).not.toContain('Let me know');
    expect(result).toContain('Some content');
  });

  it('strips "Here is" preambles', () => {
    const input = `Here is a summary of the transcript:\n\n# Title\n\nContent.`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).toContain('# Title');
  });

  it('does not modify content without artifacts', () => {
    const input = `# Title\n\n## Section\n\nNormal content with key points.`;
    expect(sanitize(input)).toBe(input);
  });

  it('removes multiple patterns in one pass', () => {
    const input = `Here is the summary:\n\n## Notes\n\nGreat stuff.\n\nLet me know if you need changes!`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).not.toContain('Let me know');
    expect(result).toContain('## Notes');
    expect(result).toContain('Great stuff');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/output/sanitize.test.ts
```
Expected: FAIL — `sanitize` not found.

- [ ] **Step 3: Implement sanitize function**

```typescript
// src/output/sanitize.ts

/** Strips common LLM artifacts: polite closings, preambles, meta-commentary. */
export function sanitize(text: string): string {
  let result = text.trim();

  // --- Strip trailing polite closings (Chinese) ---
  result = result.replace(
    /\n{1,2}(?:希望对你[^\n]{0,80}|如有需要[^\n]{0,80}|如需[^\n]{0,80}|欢迎反馈[^\n]{0,80}|请告诉[^\n]{0,80}|以上[^\n]{0,40}内容[^\n]{0,40})$/g,
    '',
  );

  // --- Strip trailing polite closings (English) ---
  result = result.replace(
    /\n{1,2}(?:let me know[^\n]{0,200}|feel free to[^\n]{0,200}|happy to[^\n]{0,200}|please let me know[^\n]{0,200}|don't hesitate[^\n]{0,200}|hope this helps[^\n]{0,200}|thanks for reading[^\n]{0,200})$/gi,
    '',
  );

  // --- Strip leading preambles ---
  result = result.replace(
    /^(?:Here is (?:a )?(?:summary|note|transcript)[^\n]{0,200}\n{1,2}|以下是[^\n]{0,200}\n{1,2})/i,
    '',
  );

  // --- Remove trailing lines that are pure meta ---
  const lines = result.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const lower = last.toLowerCase();
    if (
      lower === '---' ||
      /^(let me know|feel free|happy to|hope this|thanks for|please let|don't hesitate)/i.test(lower) ||
      /^(希望|如有|如需|欢迎|请告诉|以上)/.test(lower)
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n').trim();
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/output/sanitize.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into pipeline**

Edit `src/pipeline.ts`:

Add import:
```typescript
import { sanitize } from './output/sanitize';
```

After the generator call (line ~44), before output:
```typescript
const rawMarkdown = await generator.generate(content);
const markdown = sanitize(rawMarkdown);
```

Then change `writeNote` call to use `markdown` instead of `rawMarkdown`.

- [ ] **Step 6: Run all tests**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test
```
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add src/output/sanitize.ts src/output/sanitize.test.ts src/pipeline.ts
git commit -m "feat: add LLM output sanitizer to strip AI pleasantries"
```

---

### Task 2: VTT Parsing with Dedup (`video-fetcher.ts`)

**Files:**
- Modify: `src/fetcher/video-fetcher.ts` (replace `parseVTT`)
- Modify: `src/fetcher/video-fetcher.test.ts` (add dedup test)

- [ ] **Step 1: Write failing test for VTT dedup**

Add to `src/fetcher/video-fetcher.test.ts`:

```typescript
it('deduplicates YouTube scrolling-append VTT entries', () => {
  // Simulate YouTube auto-subtitle scrolling-append pattern:
  // Each cue adds one more word to the same sentence
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
向量数据库是一种

00:00:03.000 --> 00:00:05.000
向量数据库是一种特殊的数据库

00:00:05.000 --> 00:00:07.000
向量数据库是一种特殊的数据库，用于存储

00:00:07.000 --> 00:00:10.000
Hello world

00:00:10.000 --> 00:00:12.000
完全不同的句子
`;

  global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('dummy') });
  const fetcher = new VideoFetcher({ transcriber: 'whisper' });

  // Access private method for testing
  const result = (fetcher as any).parseVTT(vtt);
  
  // Should keep only the final complete version of each scrolling sequence
  expect(result).toContain('向量数据库是一种特殊的数据库，用于存储');
  // Intermediate partial versions should be removed
  expect(result).not.toMatch(/向量数据库是一种$/);
  // Non-scrolling entries should be kept
  expect(result).toContain('Hello world');
  expect(result).toContain('完全不同的句子');
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/fetcher/video-fetcher.test.ts
```
Expected: FAIL — current parseVTT doesn't handle scrolling-append.

- [ ] **Step 3: Replace parseVTT**

Replace the current `parseVTT` method in `src/fetcher/video-fetcher.ts`:

```typescript
private parseVTT(vtt: string): string {
  // Split into cue blocks (separated by blank lines)
  const blocks = vtt
    .replace(/^WEBVTT[^\n]*\n/, '')
    .split(/\n{2,}/);

  const entries: { start: string; text: string }[] = [];
  const seenTexts = new Set<string>();

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx < 0) continue;

    const timingLine = lines[timingIdx];
    const match = timingLine.match(
      /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/,
    );
    if (!match) continue;

    const textLines = lines.slice(timingIdx + 1);
    const rawText = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawText || rawText.length < 2 || seenTexts.has(rawText)) continue;
    seenTexts.add(rawText);

    entries.push({ start: match[1], text: rawText });
  }

  if (entries.length === 0) return '';

  // --- YouTube scrolling-append dedup ---
  // If entry[i].text is a prefix of any later entry's text (within next 4),
  // discard entry[i] as an intermediate scrolling state.
  const deduped: typeof entries = [];
  for (let i = 0; i < entries.length; i++) {
    const current = entries[i];
    let isIntermediate = false;
    for (let j = i + 1; j < Math.min(i + 5, entries.length); j++) {
      const next = entries[j];
      if (next.text.startsWith(current.text) && next.text.length > current.text.length) {
        isIntermediate = true;
        break;
      }
    }
    if (!isIntermediate) {
      deduped.push(current);
    }
  }

  return deduped.map((e) => e.text).join(' ');
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/fetcher/video-fetcher.test.ts
```
Expected: PASS (all tests including new dedup test).

- [ ] **Step 5: Run all tests**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fetcher/video-fetcher.ts src/fetcher/video-fetcher.test.ts
git commit -m "feat: add VTT block parsing with YouTube scrolling-append dedup"
```

---

### Task 3: Transcript Optimizer (`src/optimizer/`)

**Files:**
- Create: `src/optimizer/index.ts`
- Create: `src/optimizer/optimizer.test.ts`
- Modify: `src/pipeline.ts` (wire optimizer for video content)

- [ ] **Step 1: Write failing test**

```typescript
// src/optimizer/optimizer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optimizeTranscript } from './index';

describe('optimizeTranscript', () => {
  it('calls LLM API and returns cleaned text', async () => {
    // Mock OpenAI client
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Cleaned transcript text.' } }],
    });

    vi.mock('openai', () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      })),
    }));

    const result = await optimizeTranscript(
      '**[00:01 - 00:03]**\n\nThis is raw transcript with timestamps.\n\n**[00:03 - 00:05]**\n\nAnd more content.',
      { apiKey: 'test-key', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Verify prompt asks for transcript optimization
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('transcript');
    expect(result).toBe('Cleaned transcript text.');
  });

  it('skips optimization for short text', async () => {
    const result = await optimizeTranscript(
      'Short text.',
      { apiKey: 'test-key', model: 'test' },
    );
    // Short text returned as-is without API call
    expect(result).toBe('Short text.');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/optimizer/optimizer.test.ts
```
Expected: FAIL — `optimizeTranscript` not found.

- [ ] **Step 3: Implement optimizer**

```typescript
// src/optimizer/index.ts
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
  // Skip optimization for very short text
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/optimizer/optimizer.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into pipeline for video content**

Edit `src/pipeline.ts`:

Add import:
```typescript
import { optimizeTranscript } from './optimizer/index';
```

After fetch and parse, before generate, when type is 'video':

```typescript
// 1.5 Optimize transcript for video content
let rawText = raw.rawText;
if (resolvedType === 'video' && rawText.length >= 200) {
  const provider = options?.providerOverride ?? config.provider.default;
  const providerConfig = config.providers[provider];
  if (providerConfig?.apiKey || providerConfig?.baseUrl) {
    console.error('Optimizing transcript...');
    try {
      rawText = await optimizeTranscript(rawText, providerConfig);
    } catch (err) {
      console.error('Transcript optimization failed, using raw text:', (err as Error).message);
    }
  }
}
```

Then pass `rawText` to `parseContent` instead of `raw.rawText`. Also update the `FetchResult` usage — actually, it's simpler to modify `raw.rawText` before passing to parseContent.

Actually, the cleanest approach: optimize after fetch, before parse:

```typescript
const raw = await fetcher.fetch(url);

// Optimize transcript for video content
if (resolvedType === 'video') {
  const provider = options?.providerOverride ?? config.provider.default;
  const providerConfig = config.providers[provider];
  if (providerConfig?.apiKey || providerConfig?.baseUrl) {
    console.error('Optimizing transcript...');
    try {
      raw.rawText = await optimizeTranscript(raw.rawText, providerConfig);
    } catch (err) {
      console.error('Transcript optimization failed, using raw text:', (err as Error).message);
    }
  }
}

// 2. Parse
const content = parseContent(raw, url, resolvedType);
```

Wait, but `resolvedType` is computed after fetch. Let me restructure. The type should be determined before the optimization step.

Actually, looking at the pipeline again:
```typescript
const raw = await fetcher.fetch(url);

// 2. Parse
const resolvedType: 'text' | 'video' =
  type === 'auto'
    ? fetcher.constructor.name === 'VideoFetcher' ? 'video' : 'text'
    : type;
const content = parseContent(raw, url, resolvedType);
```

So the optimization should happen between fetch and parse, using the resolved type. Let me place it there.

- [ ] **Step 6: Update pipeline test mock**

Add to `src/pipeline.test.ts` after existing mocks:

```typescript
vi.mock('./optimizer/index', () => ({
  optimizeTranscript: vi.fn().mockImplementation((text: string) => Promise.resolve(text)),
}));
```

- [ ] **Step 7: Run all tests**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test
```
Expected: ALL PASS.

- [ ] **Step 8: Build and smoke test**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm build
```

- [ ] **Step 9: Commit**

```bash
git add src/optimizer/ src/pipeline.ts src/pipeline.test.ts
git commit -m "feat: add transcript optimizer for video content quality"
```
