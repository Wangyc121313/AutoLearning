# Local Whisper Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Faster-Whisper transcription as a fallback when videos have no embedded subtitles, enabling Bilibili and other platforms without CC support.

**Architecture:** Python Faster-Whisper subprocess called from TypeScript via execFileSync (consistent with yt-dlp pattern). VideoFetcher gets a two-path design: subtitles first (fast), local Whisper fallback (slow). Transcriber instance is passed through pipeline → getFetcher → VideoFetcher.

**Tech Stack:** TypeScript/Node.js, Python 3 + faster-whisper, yt-dlp, FFmpeg

---

### Task 1: Python helper script for Faster-Whisper

**Files:**
- Create: `scripts/transcribe.py`

- [ ] **Step 1: Write the Python transcription script**

```python
#!/usr/bin/env python3
"""Transcribe an audio file using Faster-Whisper.

Usage: python3 transcribe.py <audio_path> [model_size]

Outputs plain text transcription to stdout.
"""

import sys
import os


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe.py <audio_path> [model_size]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    if not os.path.exists(audio_path):
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper not installed. Run: pip install faster-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading Whisper model ({model_size})...", file=sys.stderr)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"Transcribing {audio_path}...", file=sys.stderr)
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        best_of=5,
        temperature=[0.0, 0.2, 0.4],
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 900, "speech_pad_ms": 300},
        no_speech_threshold=0.7,
        compression_ratio_threshold=2.3,
        log_prob_threshold=-1.0,
        condition_on_previous_text=False,
    )

    detected_lang = info.language
    prob = info.language_probability
    print(f"Detected language: {detected_lang} (prob={prob:.2f})", file=sys.stderr)

    # Output plain text with language header
    print(f"**Detected Language:** {detected_lang}")
    print(f"**Language Probability:** {prob:.2f}")
    print()
    for segment in segments:
        start = _fmt(segment.start)
        end = _fmt(segment.end)
        text = segment.text.strip()
        if text:
            print(f"**[{start} - {end}]**")
            print()
            print(text)
            print()


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x /home/wangyc/桌面/AutoLearning/scripts/transcribe.py
```

- [ ] **Step 3: Commit**

```bash
git add scripts/transcribe.py
git commit -m "feat: add Python Faster-Whisper transcription helper script"
```

---

### Task 2: Add localWhisper to Config

**Files:**
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`

- [ ] **Step 1: Write failing test for config**

```typescript
// Add to src/config.test.ts after existing tests

it('loads optional [local_whisper] section', () => {
  fs.writeFileSync(configPath, `
[provider]
default = "deepseek"

[providers.deepseek]
api_key = "sk-test"
model = "deepseek-chat"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"

[local_whisper]
model_size = "small"
`);
  const config = loadConfig(configPath);
  expect(config.localWhisper?.modelSize).toBe('small');
});

it('defaults model_size to base when not specified', () => {
  fs.writeFileSync(configPath, `
[provider]
default = "deepseek"

[providers.deepseek]
api_key = "sk-test"
model = "deepseek-chat"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
  const config = loadConfig(configPath);
  expect(config.localWhisper?.modelSize).toBe('base');
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/config.test.ts
```
Expected: FAIL — `localWhisper` property not defined.

- [ ] **Step 3: Implement Config changes**

Add to `Config` interface in `src/config.ts:12-22`:

```typescript
export interface Config {
  provider: { default: string };
  providers: Record<string, ProviderConfig>;
  output: { directory: string; filenameTemplate: string };
  whisper?: { apiKey?: string; model: string };
  localWhisper?: { modelSize: string };  // NEW
  alibaba?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    appKey?: string;
  };
}
```

Add parsing at end of `loadConfig()` in `src/config.ts`, after the alibaba section:

```typescript
// Parse local_whisper section
if (parsed.local_whisper) {
  const lw = parsed.local_whisper as Record<string, unknown>;
  cfg.localWhisper = {
    modelSize: (lw.model_size as string) ?? lw.modelSize as string ?? 'base',
  };
} else {
  cfg.localWhisper = { modelSize: 'base' };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/config.test.ts
```
Expected: PASS (all tests including 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add [local_whisper] config section with model_size"
```

---

### Task 3: Create LocalWhisperTranscriber

**Files:**
- Create: `src/transcriber/local-whisper.ts`
- Create: `src/transcriber/local-whisper.test.ts`
- Modify: `src/transcriber/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/transcriber/local-whisper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalWhisperTranscriber } from './local-whisper';

describe('LocalWhisperTranscriber', () => {
  let transcriber: LocalWhisperTranscriber;

  beforeEach(() => {
    transcriber = new LocalWhisperTranscriber({ modelSize: 'base' });
  });

  it('calls Python script and returns output', async () => {
    const mockOutput = '**Detected Language:** en\n**Language Probability:** 0.98\n\n**[00:01 - 00:03]**\n\nHello world\n';

    const mockExecFileSync = vi.fn().mockReturnValue(mockOutput);
    vi.stubGlobal('execFileSync', mockExecFileSync);

    // The import is inside the method, so we need dynamic import mocking
    // Instead, we inject via a setter or override in test
    (transcriber as any).execFileSync = mockExecFileSync;

    const result = await transcriber.transcribe('/tmp/test-audio.m4a');

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'python3',
      [expect.stringContaining('transcribe.py'), '/tmp/test-audio.m4a', 'base'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 600_000 }),
    );
    expect(result).toBe(mockOutput);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/transcriber/local-whisper.test.ts
```
Expected: FAIL — `LocalWhisperTranscriber` not defined.

- [ ] **Step 3: Implement LocalWhisperTranscriber**

```typescript
// src/transcriber/local-whisper.ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { Transcriber } from './index';

const SCRIPTS_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', '..', 'scripts',
);

export class LocalWhisperTranscriber implements Transcriber {
  private scriptPath: string;

  constructor(private config: { modelSize: string }) {
    this.scriptPath = path.join(SCRIPTS_DIR, 'transcribe.py');
  }

  async transcribe(audioPath: string): Promise<string> {
    // execFileSync is synchronous; wrap in Promise for interface compatibility
    return execFileSync('python3', [
      this.scriptPath,
      audioPath,
      this.config.modelSize,
    ], {
      encoding: 'utf-8',
      timeout: 600_000, // 10 minutes max for long videos
    });
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/transcriber/local-whisper.test.ts
```
Expected: PASS.

- [ ] **Step 5: Export from index**

Edit `src/transcriber/index.ts:7`:

```typescript
export { WhisperTranscriber } from './whisper';
export { AlibabaTranscriber } from './alibaba';
export { LocalWhisperTranscriber } from './local-whisper';
```

- [ ] **Step 6: Commit**

```bash
git add src/transcriber/
git commit -m "feat: add LocalWhisperTranscriber using Faster-Whisper via Python subprocess"
```

---

### Task 4: Add downloadAudio to VideoFetcher + two-path fetch

**Files:**
- Modify: `src/fetcher/video-fetcher.ts`

- [ ] **Step 1: Add downloadAudio method and modify fetch**

Add `import type { Transcriber } from '../transcriber/index';` at top of `src/fetcher/video-fetcher.ts`.

Add `transcriber?: Transcriber` to `VideoFetcherOptions` interface:

```typescript
export interface VideoFetcherOptions {
  transcriber: string;           // transcriber identifier (e.g. 'whisper')
  tmpDir?: string;
  cookiesFromBrowser?: string;
  transcriberInstance?: Transcriber;  // NEW — actual instance for fallback
}
```

Replace the `fetch` method body with two-path logic:

```typescript
async fetch(url: string): Promise<FetchResult> {
  const videoTitle = this.extractTitle(url);

  // Fast path: try embedded subtitles first
  try {
    const subtitles = this.extractSubtitles(url);
    return {
      title: videoTitle,
      rawText: subtitles,
    };
  } catch {
    // No subtitles — continue to slow path
  }

  // Slow path: download audio + transcribe
  if (!this.options.transcriberInstance) {
    throw new Error(
      'No embedded subtitles found and no transcriber configured for audio fallback.'
    );
  }

  console.error('No subtitles found, downloading audio for transcription...');
  const audioPath = this.downloadAudio(url);

  console.error('Transcribing audio...');
  const transcript = await this.options.transcriberInstance.transcribe(audioPath);

  // Clean up audio file after transcription
  try {
    const fs = await import('node:fs');
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  } catch {
    // Ignore cleanup errors
  }

  return {
    title: videoTitle,
    rawText: transcript,
  };
}
```

- [ ] **Step 2: Implement downloadAudio method**

Add to `VideoFetcher` class:

```typescript
private downloadAudio(url: string): string {
  const tmpDir = this.options.tmpDir ?? os.tmpdir();
  const uniqueId = Date.now().toString(36);
  const outputPath = path.join(tmpDir, `audio_${uniqueId}.%(ext)s`);

  const args = [
    '--format', 'bestaudio/best',
    '--output', outputPath,
    '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000',
    '--extract-audio',
    '--audio-format', 'm4a',
    '--audio-quality', '192K',
    '--no-playlist',
  ];

  if (this.options.cookiesFromBrowser) {
    args.push('--cookies-from-browser', this.options.cookiesFromBrowser);
  }
  args.push(url);

  execFileSync('yt-dlp', args, {
    encoding: 'utf-8',
    timeout: 120_000,
    stdio: 'pipe',
  });

  // Find the downloaded audio file
  const expectedFile = path.join(tmpDir, `audio_${uniqueId}.m4a`);
  if (fs.existsSync(expectedFile)) return expectedFile;

  // Check for other extensions
  for (const ext of ['webm', 'mp3', 'opus', 'mp4']) {
    const alt = path.join(tmpDir, `audio_${uniqueId}.${ext}`);
    if (fs.existsSync(alt)) return alt;
  }

  throw new Error('Audio download failed: no output file found');
}
```

- [ ] **Step 3: Verify existing video-fetcher tests still pass**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/fetcher/video-fetcher.test.ts
```
Expected: PASS (existing behavior unchanged when no transcriberInstance).

- [ ] **Step 4: Commit**

```bash
git add src/fetcher/video-fetcher.ts
git commit -m "feat: add two-path fetch to VideoFetcher (subtitles → Whisper fallback)"
```

---

### Task 5: Update fetcher routing and pipeline

**Files:**
- Modify: `src/fetcher/index.ts`
- Modify: `src/pipeline.ts`
- Modify: `src/pipeline.test.ts`

- [ ] **Step 1: Update getFetcher to accept transcriber instance**

Edit `src/fetcher/index.ts` — add import:

```typescript
import type { Transcriber } from '../transcriber/index';
```

Modify `getFetcher` signature to accept an optional `transcriberInstance`:

```typescript
export function getFetcher(
  url: string,
  type: 'text' | 'video' | 'auto',
  videoOptions?: VideoFetcherOptions,
  transcriberInstance?: Transcriber,
): Fetcher {
  const fullOptions = {
    ...(videoOptions ?? { transcriber: 'whisper' }),
    transcriberInstance,
  };
  if (type === 'video') return new VideoFetcher(fullOptions);
  if (type === 'text') return textFetcher;

  const vf = new VideoFetcher(fullOptions);
  if (vf.supports(url)) return vf;
  return textFetcher;
}
```

- [ ] **Step 2: Update pipeline.ts**

Edit `src/pipeline.ts` — add imports:

```typescript
import { LocalWhisperTranscriber } from './transcriber/local-whisper';
```

In `runPipeline()`, before the `getFetcher` call, create the transcriber:

```typescript
// Create local whisper transcriber for video fallback
const transcriberInstance = new LocalWhisperTranscriber({
  modelSize: config.localWhisper?.modelSize ?? 'base',
});

const fetcher = getFetcher(url, type, {
  transcriber: 'whisper',
  cookiesFromBrowser: options?.cookiesFromBrowser,
}, transcriberInstance);
```

- [ ] **Step 3: Update pipeline.test.ts**

The existing pipeline tests mock the generator module, which means `LocalWhisperTranscriber` won't be instantiated during mock-based tests — but the import will still happen. The import itself is fine since it doesn't execute anything in module scope.

But to be safe, add a mock for the local-whisper module alongside existing mocks:

```typescript
// Add to existing mock declarations at top of src/pipeline.test.ts
vi.mock('./transcriber/local-whisper', () => ({
  LocalWhisperTranscriber: class {
    transcribe = vi.fn().mockResolvedValue('Mock transcription');
  },
}));
```

Update `getFetcher` mock call expectations to match new 4-arg signature:

The tests currently check `getGenerator` calls but not `getFetcher` calls. The `getFetcher` mock doesn't exist in the test — it's the real `getFetcher` being used (since only generator is mocked). Actually looking at the test, only the generator module is mocked. The fetcher module is used for real. So as long as the fetcher tests pass, the pipeline tests should be fine.

But wait — the pipeline tests mock `global.fetch` for the TextFetcher. The VideoFetcher isn't tested in pipeline tests since they use 'text' type. So the `LocalWhisperTranscriber` import will happen but its constructor won't be called.

Let me add a simple mock to prevent any import issues:

```typescript
// Add after the generator mock block:
vi.mock('./transcriber/local-whisper', () => ({
  LocalWhisperTranscriber: class {
    async transcribe(_path: string) { return 'mock'; }
  },
}));
```

- [ ] **Step 4: Run pipeline tests**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test src/pipeline.test.ts
```
Expected: PASS.

- [ ] **Step 5: Run all tests**

```bash
cd /home/wangyc/桌面/AutoLearning && pnpm test
```
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fetcher/index.ts src/pipeline.ts src/pipeline.test.ts
git commit -m "feat: wire LocalWhisperTranscriber through pipeline to VideoFetcher"
```

---

### Task 6: Verify with a real video

- [ ] **Step 1: Install faster-whisper**

```bash
pip install faster-whisper
```

- [ ] **Step 2: Find a Bilibili video without CC subs and test**

```bash
cd /home/wangyc/桌面/AutoLearning && node dist/cli.js "https://www.bilibili.com/video/BV1Be9DB6E6W/" --type video --cookies-from-browser firefox
```
Expected: Downloads audio, transcribes via local Whisper, generates notes.

- [ ] **Step 3: Verify a YouTube video with subs still uses fast path**

```bash
cd /home/wangyc/桌面/AutoLearning && node dist/cli.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --type video
```
Expected: Uses subtitle fast path (no Whisper download needed).
