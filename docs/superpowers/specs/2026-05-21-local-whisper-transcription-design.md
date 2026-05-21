# Local Whisper Transcription for Video Slow Path

## Motivation

VideoFetcher currently throws when no embedded subtitles are found. For Bilibili
videos (rarely have CC subtitles) and other platforms without sub support, we
need a fallback: download audio and transcribe locally with Whisper.

Reference: AI-Video-Transcriber's subtitle-first, Whisper-fallback two-path design.

## Design

### 1. LocalWhisperTranscriber (`src/transcriber/local-whisper.ts`)

Implements the existing `Transcriber` interface. Instead of calling OpenAI cloud
API, it shells out to a small Python script that wraps Faster-Whisper.

- Accepts audio file path, returns plain text transcript
- Model size configurable (default `base`)
- Python script at `scripts/transcribe.py`

### 2. Python helper (`scripts/transcribe.py`)

Minimal script: loads Faster-Whisper model, transcribes audio file, writes
result to stdout. Called via `execFileSync` from Node.js.

### 3. VideoFetcher two-path (`src/fetcher/video-fetcher.ts`)

```
fetch(url):
  1. Try extractSubtitles(url) — fast path (seconds)
  2. If no subs: downloadAudio(url) via yt-dlp
  3. Call transcriber.transcribe(audioPath)
  4. Return FetchResult
```

- New optional `transcriber?: Transcriber` field in VideoFetcherOptions
- When absent, behavior unchanged (throws on no subs)
- `downloadAudio` reuses existing yt-dlp opts, skips video stream

### 4. Pipeline wires it (`src/pipeline.ts`)

- Creates `LocalWhisperTranscriber` instance
- Passes it through `getFetcher` → `VideoFetcherOptions.transcriber`
- Rest of pipeline unchanged — fetcher always returns text

### 5. Config (`src/config.ts`)

Optional `[local_whisper]` section in config.toml:

```toml
[local_whisper]
model_size = "base"
```

Single field: `model_size` — one of tiny/base/small/medium/large (default base).

## What doesn't change

- Transcriber interface
- Fetcher interface  
- Pipeline orchestration (fetch → parse → generate → output)
- Generator, Parser, Output modules
- CLI (user sees same `autolearn <url>` interface)

## Dependencies

- `faster-whisper` Python package (pip install)
- FFmpeg (already required by yt-dlp audio extraction)
