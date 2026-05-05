# AutoLearning Design Spec

## Overview

AutoLearning is a CLI tool that generates structured Markdown study notes from online resources (documents, blogs, videos). User provides a URL, the tool fetches content, sends it to an LLM, and outputs a well-organized Markdown note.

## Requirements

| Dimension | Decision |
|-----------|----------|
| Interface | CLI only |
| AI Backend | Multi-provider: Claude, OpenAI, Ollama (extensible via strategy pattern) |
| Resource Types | Text (docs/blogs) + Video (YouTube, Bilibili platform subtitles) |
| Output Format | Markdown files |
| Work Mode | Single URL per invocation (batch deferred) |
| Video Transcription | Prefer embedded subtitles (yt-dlp), fallback to Whisper or Alibaba Cloud speech recognition |
| Config | `~/.autolearning/config.toml` file, overridable by env vars |
| Output Location | Configurable, default `./notes/` |
| Language | TypeScript (Node.js) |

## Architecture

Strategy + Pipeline pattern. Five modules in a linear pipeline; Fetcher, Generator, and Transcriber use strategy pattern for multi-provider/multi-type support.

```
CLI → Fetcher (strategy) → Parser → Generator (strategy) → Output
                                     ↘ Transcriber (strategy, on-demand)
```

### Module Boundaries

| Module | Responsibility | Input | Output |
|--------|---------------|-------|--------|
| CLI | Args parsing, config loading, orchestration | User command | Dispatches to pipeline |
| Fetcher | URL → raw text content | URL + resource type | Raw text string |
| Parser | Clean and normalize raw text | Raw text + metadata | StructuredContent |
| Generator | Call LLM to produce notes | StructuredContent + prompt | Markdown string |
| Transcriber | Audio → text (video without subtitles) | Audio file | Text transcript |
| Output | Write file to disk | Markdown + output config | File path |

### Video Processing Flow

```
Video URL → Detect subtitles
              ├─ Embedded subtitles exist → yt-dlp extracts → text → LLM → Markdown
              └─ No subtitles → Download audio → Transcriber (strategy)
                                                   ├─ WhisperProvider
                                                   └─ AlibabaProvider
              └─ → text → LLM → Markdown
```

## Project Structure

```
AutoLearning/
├── src/
│   ├── cli.ts
│   ├── config.ts
│   ├── pipeline.ts
│   ├── fetcher/
│   │   ├── index.ts           # Fetcher interface + routing
│   │   ├── text-fetcher.ts
│   │   └── video-fetcher.ts
│   ├── parser/
│   │   └── index.ts           # HTML cleaning, text normalization
│   ├── generator/
│   │   ├── index.ts           # Generator interface + routing
│   │   ├── claude.ts
│   │   ├── openai.ts
│   │   └── ollama.ts
│   ├── transcriber/
│   │   ├── index.ts           # Transcriber interface + routing
│   │   ├── whisper.ts
│   │   └── alibaba.ts
│   └── output/
│       └── index.ts           # Markdown file writer
├── package.json
└── tsconfig.json
```

## Tech Stack

| Purpose | Choice |
|---------|--------|
| Runtime | Node.js + TypeScript |
| CLI framework | `commander` |
| Config parsing | `smol-toml` |
| HTML → clean text | `@mozilla/readability` + `turndown` |
| Video subtitles | `yt-dlp` (child_process) |
| AI SDKs | `@anthropic-ai/sdk`, `openai`, Ollama REST |
| Build/Run | `tsx` (dev), `tsup` (build) |
| Package manager | pnpm |

## CLI Interface

```
autolearn <url> [options]
```

| Option | Description |
|--------|-------------|
| `-p, --provider` | AI provider: `claude` / `openai` / `ollama` (overrides config) |
| `-o, --output` | Output directory (overrides config) |
| `-t, --type` | Resource type hint: `text` / `video` / `auto` (default: auto) |
| `-c, --config` | Config file path |
| `-v, --verbose` | Verbose logging |

## Configuration

Default path: `~/.autolearning/config.toml`

```toml
[provider]
default = "claude"

[providers.claude]
api_key = "${ANTHROPIC_API_KEY}"
model = "claude-sonnet-4-6-20250501"

[providers.openai]
api_key = "${OPENAI_API_KEY}"
model = "gpt-4o"

[providers.ollama]
base_url = "http://localhost:11434"
model = "llama3"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"

[whisper]
api_key = "${OPENAI_API_KEY}"
model = "whisper-1"

[alibaba]
access_key_id = "${ALIBABA_ACCESS_KEY_ID}"
access_key_secret = "${ALIBABA_ACCESS_KEY_SECRET}"
app_key = "${ALIBABA_APP_KEY}"
```

Environment variables override config file values. `${VAR}` syntax in config expands env vars.

## Error Handling

- Fetcher failure: clear message with HTTP status code
- Subtitle + transcription both unavailable: tell user "cannot obtain video text content"
- AI API failure: retry once, then exit with error
- Output path not writable: validate directory exists and is writable before processing

## LLM Prompt Design

- System prompt defines note style: structured Markdown, preserve key concepts, remove redundancy
- Long content exceeding context window: chunk and process in segments, then merge
- Do not fabricate content — base notes solely on source material

## Testing Strategy

- Fetcher: mock HTTP responses, verify HTML → text extraction
- Generator: mock SDK responses, verify prompt assembly and response parsing
- Transcriber: mock API responses, verify strategy routing
- Pipeline integration: full pipeline with mock data at every stage
- Do not test: yt-dlp (external process) or live API calls
