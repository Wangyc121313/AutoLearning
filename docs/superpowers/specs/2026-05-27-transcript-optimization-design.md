# Transcript Optimization, LLM Output Sanitization, VTT Dedup

## 1. Transcript Optimizer (`src/optimizer/`)

New module. One extra LLM pass for video content before note generation, cleaning raw
transcript/subtitle text.

**Interface:**
```typescript
interface Optimizer {
  optimize(text: string): Promise<string>;
}
```

**Implementation (`OptimizerImpl`):**
- Reuses current provider (same LLM as note generation)
- Removes timestamps, fixes typos, recombines sentences split by timestamps
- Smart chunking for long text: split at paragraph/sentence boundaries, overlap
  context between chunks, deduplicate adjacent chunk overlap
- Configurable via existing provider config (no new config keys)

**Pipeline position:**
```
Fetcher → Optimizer (if video) → Parser → Generator → sanitize() → Output
```

## 2. LLM Output Sanitizer (`src/output/sanitize.ts`)

Pure function, no API calls. Strips common LLM pleasantries and meta-commentary.

Regex patterns for:
- Chinese: "希望对你", "如有需要", "如需调整", "欢迎反馈", "请告诉我", "以上内容"
- English: "let me know", "feel free to", "hope this helps", "don't hesitate"

Called in pipeline right after generator returns, before writeNote.

```typescript
function sanitize(text: string): string
```

## 3. VTT Dedup (`parseVTT` in video-fetcher.ts)

Improve existing `parseVTT` to handle YouTube scrolling-append pattern.

Algorithm:
- Parse VTT blocks with timestamps (not just lines)
- After parsing, iterate: if entry[i].text is a prefix of entry[i+1].text,
  discard entry[i] (intermediate state)
- Also filter entries < 2 chars (noise)
