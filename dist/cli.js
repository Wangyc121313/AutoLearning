#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
import { parse } from "smol-toml";
function expandEnv(raw) {
  return raw.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}
function resolveExpanded(raw, camelKey, snakeKey) {
  const v = raw[camelKey] ?? raw[snakeKey];
  return expandEnv(String(v ?? ""));
}
function normalizeProvider(raw) {
  const model = resolveExpanded(raw, "model", "model");
  if (!model) throw new Error('Provider must have a "model" field');
  return {
    apiKey: resolveExpanded(raw, "apiKey", "api_key") || void 0,
    model,
    baseUrl: resolveExpanded(raw, "baseUrl", "base_url") || void 0
  };
}
function loadConfig(configPath) {
  const resolvedPath = configPath ?? path.join(os.homedir(), ".autolearning", "config.toml");
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = parse(raw);
  const providerSection = parsed.provider ?? {};
  const rawOutput = parsed.output ?? {};
  const outputDir = rawOutput.directory ?? "./notes";
  const outputTemplate = rawOutput.filenameTemplate ?? rawOutput.filename_template ?? "{title}-{date}.md";
  const cfg = {
    provider: { default: String(providerSection.default ?? "claude") },
    providers: {},
    output: {
      directory: expandEnv(String(outputDir)),
      filenameTemplate: expandEnv(String(outputTemplate))
    }
  };
  const providers = parsed.providers ?? {};
  for (const [name, providerRaw] of Object.entries(providers)) {
    cfg.providers[name] = normalizeProvider(providerRaw);
  }
  if (parsed.whisper) {
    const w = parsed.whisper;
    const wModel = resolveExpanded(w, "model", "model");
    if (!wModel) throw new Error('Whisper config must have a "model" field');
    cfg.whisper = {
      apiKey: resolveExpanded(w, "apiKey", "api_key") || void 0,
      model: wModel
    };
  }
  if (parsed.alibaba) {
    const a = parsed.alibaba;
    cfg.alibaba = {
      accessKeyId: resolveExpanded(a, "accessKeyId", "access_key_id") || void 0,
      accessKeySecret: resolveExpanded(a, "accessKeySecret", "access_key_secret") || void 0,
      appKey: resolveExpanded(a, "appKey", "app_key") || void 0
    };
  }
  if (parsed.local_whisper) {
    const lw = parsed.local_whisper;
    cfg.localWhisper = {
      modelSize: lw.model_size ?? lw.modelSize ?? "base",
      pythonPath: resolveExpanded(lw, "pythonPath", "python_path") || void 0
    };
  } else {
    cfg.localWhisper = { modelSize: "base" };
  }
  return cfg;
}

// src/pipeline.ts
import fs5 from "fs";

// src/fetcher/text-fetcher.ts
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
var TextFetcher = class {
  supports(_url) {
    return true;
  }
  async fetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${url} (HTTP ${response.status})`);
      }
      const html = await response.text();
      try {
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        return {
          title: article?.title ?? dom.window.document.title ?? "Untitled",
          rawText: article?.textContent ?? dom.window.document.body?.textContent ?? ""
        };
      } catch (parseError) {
        throw new Error(`Failed to parse content from ${url}: ${parseError.message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
};

// src/fetcher/video-fetcher.ts
import { execFileSync } from "child_process";
import fs2 from "fs";
import os2 from "os";
import path2 from "path";
var VIDEO_URL_PATTERNS = [
  /youtube\.com\/watch\?v=/,
  /youtu\.be\//,
  /bilibili\.com\/video\//
];
var VideoFetcher = class {
  constructor(options) {
    this.options = options;
  }
  options;
  supports(url) {
    return VIDEO_URL_PATTERNS.some((p) => p.test(url));
  }
  async fetch(url) {
    const videoTitle = this.extractTitle(url);
    try {
      const subtitles = this.extractSubtitles(url);
      return {
        title: videoTitle,
        rawText: subtitles
      };
    } catch {
    }
    if (!this.options.transcriberInstance) {
      throw new Error(
        "No embedded subtitles found and no transcriber configured for audio fallback."
      );
    }
    console.error("No subtitles found, downloading audio for transcription...");
    const audioPath = this.downloadAudio(url);
    console.error("Transcribing audio...");
    const transcript = await this.options.transcriberInstance.transcribe(audioPath);
    try {
      if (fs2.existsSync(audioPath)) fs2.unlinkSync(audioPath);
    } catch {
    }
    return {
      title: videoTitle,
      rawText: transcript
    };
  }
  downloadAudio(url) {
    const tmpDir = this.options.tmpDir ?? os2.tmpdir();
    const uniqueId = Date.now().toString(36);
    const outputTemplate = path2.join(tmpDir, `audio_${uniqueId}.%(ext)s`);
    const args = [
      "--js-runtimes",
      "node",
      "--format",
      "bestaudio/best",
      "--output",
      outputTemplate,
      "--postprocessor-args",
      "ffmpeg:-ac 1 -ar 16000",
      "--extract-audio",
      "--audio-format",
      "m4a",
      "--audio-quality",
      "192K",
      "--no-playlist"
    ];
    if (this.options.cookiesFromBrowser) {
      args.push("--cookies-from-browser", this.options.cookiesFromBrowser);
    }
    args.push(url);
    execFileSync("yt-dlp", args, {
      encoding: "utf-8",
      timeout: 12e4,
      stdio: "pipe"
    });
    const expectedFile = path2.join(tmpDir, `audio_${uniqueId}.m4a`);
    if (fs2.existsSync(expectedFile)) return expectedFile;
    for (const ext of ["webm", "mp3", "opus", "mp4"]) {
      const alt = path2.join(tmpDir, `audio_${uniqueId}.${ext}`);
      if (fs2.existsSync(alt)) return alt;
    }
    throw new Error("Audio download failed: no output file found");
  }
  extractSubtitles(url) {
    const videoId = Date.now().toString(36);
    const tmpDir = this.options.tmpDir ?? os2.tmpdir();
    const candidates = [
      path2.join(tmpDir, `${videoId}.zh-Hans.vtt`),
      path2.join(tmpDir, `${videoId}.zh-CN.vtt`),
      path2.join(tmpDir, `${videoId}.zh.vtt`),
      path2.join(tmpDir, `${videoId}.zh-TW.vtt`),
      path2.join(tmpDir, `${videoId}.en.vtt`)
    ];
    try {
      try {
        const args = [
          "--js-runtimes",
          "node",
          "--skip-download",
          "--write-subs",
          "--write-auto-subs",
          "--sub-lang",
          "en,zh-Hans,zh,zh-CN,zh-TW",
          "--convert-subs",
          "vtt",
          "--output",
          path2.join(tmpDir, `${videoId}.%(ext)s`)
        ];
        if (this.options.cookiesFromBrowser) {
          args.push("--cookies-from-browser", this.options.cookiesFromBrowser);
        }
        args.push(url);
        execFileSync("yt-dlp", args, {
          encoding: "utf-8",
          timeout: 6e4,
          stdio: "pipe"
        });
      } catch {
      }
      let subFile = null;
      for (const c of candidates) {
        if (fs2.existsSync(c)) {
          subFile = c;
          break;
        }
      }
      if (!subFile) throw new Error("No subtitle file found");
      const content = fs2.readFileSync(subFile, "utf-8");
      return this.parseVTT(content);
    } finally {
      for (const c of candidates) {
        try {
          if (fs2.existsSync(c)) fs2.unlinkSync(c);
        } catch {
        }
      }
    }
  }
  parseVTT(vtt) {
    return vtt.split("\n").filter(
      (line) => !line.startsWith("WEBVTT") && !line.match(/^\d{2}:/) && !line.match(/^\d+$/) && line.trim() !== ""
    ).map((line) => line.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join(" ");
  }
  extractTitle(url) {
    try {
      const result = execFileSync("yt-dlp", ["--js-runtimes", "node", "--get-title", url], {
        encoding: "utf-8",
        timeout: 1e4,
        stdio: "pipe"
      });
      return result.trim();
    } catch (err) {
      console.warn("Failed to extract video title:", err);
      return "Untitled Video";
    }
  }
};

// src/fetcher/index.ts
var textFetcher = new TextFetcher();
function getFetcher(url, type, videoOptions, transcriberInstance) {
  const fullOptions = {
    ...videoOptions ?? { transcriber: "whisper" },
    transcriberInstance
  };
  if (type === "video") return new VideoFetcher(fullOptions);
  if (type === "text") return textFetcher;
  const vf = new VideoFetcher(fullOptions);
  if (vf.supports(url)) return vf;
  return textFetcher;
}

// src/generator/claude.ts
import Anthropic from "@anthropic-ai/sdk";
var SYSTEM_PROMPT = `You are an expert study note writer. Given the content of an article or video transcript, produce engaging, well-structured Markdown study notes that help the reader truly understand and remember the material.

## Writing Principles

**Engage, don't just list.** Vary your structure based on what the content demands:
- For conceptual topics: explain the "why" in prose paragraphs before listing the "what"
- For comparisons: use tables
- For processes or timelines: use numbered steps
- For interviews/talks: highlight key quotes with > blockquotes

**Make it memorable:**
- Start with a **> TL;DR** \u2014 one bold sentence that captures the core insight
- Use **bold** sparingly: only for the 3-5 most important concepts, not every term
- Use --- and *** for visual separation between major topics (not between every section)
- Use > blockquotes for standout definitions, surprising facts, or memorable quotes
- Include concrete examples and analogies \u2014 these stick better than abstract definitions

**Structure principles:**
- Title: # followed by the topic
- Opening: TL;DR blockquote + 1-2 sentences of context
- Body: organize by logic flow, not by the order content appeared. Merge related points across the source
- Section count: typically 3-6 ## sections. Don't over-fragment
- End with source link on its own line

**Key Takeaways (the most important section):**
- Write 3-5 genuine insights, not a re-list of earlier points
- Each takeaway should answer: "What does this mean? Why should I care?"
- Format: numbered list with bold insight followed by one explanatory sentence
- The best takeaways feel surprising or change how the reader thinks

**Hard rules:**
- Do NOT fabricate any content not present in the source
- Remove filler, ads, sponsor messages, and redundant text
- Write in the same language as the source content
- When writing in Chinese, use Simplified Chinese (\u7B80\u4F53\u4E2D\u6587)
- Preserve important facts, numbers, and definitions accurately
- End with the original source URL on its own line: **Source:** URL`;
var ClaudeGenerator = class {
  constructor(config) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }
  config;
  client;
  async generate(content) {
    const result = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Title: ${content.title}

Source: ${content.sourceUrl}

Content:
${content.content}`
        }
      ]
    });
    const text = result.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("Unexpected response format from Claude API");
    }
    return text.text;
  }
};

// src/generator/openai.ts
import OpenAI from "openai";
var SYSTEM_PROMPT2 = `You are an expert study note writer. Given the content of an article or video transcript, produce engaging, well-structured Markdown study notes that help the reader truly understand and remember the material.

## Writing Principles

**Engage, don't just list.** Vary your structure based on what the content demands:
- For conceptual topics: explain the "why" in prose paragraphs before listing the "what"
- For comparisons: use tables
- For processes or timelines: use numbered steps
- For interviews/talks: highlight key quotes with > blockquotes

**Make it memorable:**
- Start with a **> TL;DR** \u2014 one bold sentence that captures the core insight
- Use **bold** sparingly: only for the 3-5 most important concepts, not every term
- Led $$ and $$$ for visual separation between major topics (not between every section)
- Use > blockquotes for standout definitions, surprising facts, or memorable quotes
- Include concrete examples and analogies \u2014 these stick better than abstract definitions

**Structure principles:**
- Title: # followed by the topic
- Opening: TL;DR blockquote + 1-2 sentences of context
- Body: organize by logic flow, not by the order content appeared. Merge related points across the source
- Section count: typically 3-6 ## sections. Don't over-fragment
- End with source link on its own line

**Key Takeaways (the most important section):**
- Write 3-5 genuine insights, not a re-list of earlier points
- Each takeaway should answer: "What does this mean? Why should I care?"
- Format: numbered list with bold insight followed by one explanatory sentence
- The best takeaways feel surprising or change how the reader thinks

**Hard rules:**
- Do NOT fabricate any content not present in the source
- Remove filler, ads, sponsor messages, and redundant text
- Write in the same language as the source content
- When writing in Chinese, use Simplified Chinese (\u7B80\u4F53\u4E2D\u6587)
- Preserve important facts, numbers, and definitions accurately
- End with the original source URL on its own line: **Source:** URL`;
var OpenAIGenerator = class {
  constructor(config) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...config.baseUrl ? { baseURL: config.baseUrl } : {}
    });
  }
  config;
  client;
  async generate(content) {
    const result = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT2 },
        {
          role: "user",
          content: `Title: ${content.title}

Source: ${content.sourceUrl}

Content:
${content.content}`
        }
      ]
    });
    const text = result.choices[0]?.message?.content;
    if (!text) {
      throw new Error("Empty response from OpenAI API");
    }
    return text;
  }
};

// src/generator/ollama.ts
var SYSTEM_PROMPT3 = `You are an expert study note writer. Given the content of an article or video transcript, produce engaging, well-structured Markdown study notes that help the reader truly understand and remember the material.

## Writing Principles

**Engage, don't just list.** Vary your structure based on what the content demands:
- For conceptual topics: explain the "why" in prose paragraphs before listing the "what"
- For comparisons: use tables
- For processes or timelines: use numbered steps
- For interviews/talks: highlight key quotes with > blockquotes

**Make it memorable:**
- Start with a **> TL;DR** \u2014 one bold sentence that captures the core insight
- Use **bold** sparingly: only for the 3-5 most important concepts, not every term
- Use --- and *** for visual separation between major topics (not between every section)
- Use > blockquotes for standout definitions, surprising facts, or memorable quotes
- Include concrete examples and analogies \u2014 these stick better than abstract definitions

**Structure principles:**
- Title: # followed by the topic
- Opening: TL;DR blockquote + 1-2 sentences of context
- Body: organize by logic flow, not by the order content appeared. Merge related points across the source
- Section count: typically 3-6 ## sections. Don't over-fragment
- End with source link on its own line

**Key Takeaways (the most important section):**
- Write 3-5 genuine insights, not a re-list of earlier points
- Each takeaway should answer: "What does this mean? Why should I care?"
- Format: numbered list with bold insight followed by one explanatory sentence
- The best takeaways feel surprising or change how the reader thinks

**Hard rules:**
- Do NOT fabricate any content not present in the source
- Remove filler, ads, sponsor messages, and redundant text
- Write in the same language as the source content
- When writing in Chinese, use Simplified Chinese (\u7B80\u4F53\u4E2D\u6587)
- Preserve important facts, numbers, and definitions accurately
- End with the original source URL on its own line: **Source:** URL`;
var OllamaGenerator = class {
  baseUrl;
  model;
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
  }
  async generate(content) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: `${SYSTEM_PROMPT3}

Title: ${content.title}

Source: ${content.sourceUrl}

Content:
${content.content}`,
        stream: false
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.response;
  }
};

// src/generator/index.ts
function getGenerator(provider, configs) {
  const cfg = configs[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}. Check your config or --provider flag.`);
  switch (provider) {
    case "claude":
      return new ClaudeGenerator({ apiKey: cfg.apiKey ?? "", model: cfg.model });
    case "openai":
    case "deepseek":
      return new OpenAIGenerator({ apiKey: cfg.apiKey ?? "", model: cfg.model, baseUrl: cfg.baseUrl });
    case "ollama":
      return new OllamaGenerator({ baseUrl: cfg.baseUrl ?? "http://localhost:11434", model: cfg.model });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// src/parser/index.ts
function parseContent(fetched, sourceUrl, type) {
  let content = fetched.rawText.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
  const words = content.split(/\s+/).filter(Boolean);
  return {
    title: fetched.title,
    content,
    sourceUrl,
    metadata: {
      type,
      wordCount: words.length,
      fetchedAt: /* @__PURE__ */ new Date()
    }
  };
}

// src/output/index.ts
import fs3 from "fs";
import path3 from "path";
var DATE_RE = /\{date\}/g;
var TITLE_RE = /\{title\}/g;
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 200);
}
function writeNote(markdown, title, directory, filenameTemplate) {
  if (!fs3.existsSync(directory)) {
    throw new Error(`Output directory does not exist: ${directory}`);
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(title) || "untitled";
  let filename = filenameTemplate.replace(TITLE_RE, safeTitle).replace(DATE_RE, date);
  if (!filename.endsWith(".md")) {
    filename += ".md";
  }
  const filePath = path3.join(directory, filename);
  fs3.writeFileSync(filePath, markdown, "utf-8");
  return { markdown, filePath };
}

// src/transcriber/local-whisper.ts
import { execFileSync as execFileSync2 } from "child_process";
import fs4 from "fs";
import path4 from "path";
import { fileURLToPath } from "url";
var __dirname = path4.dirname(fileURLToPath(import.meta.url));
var SCRIPT_PATH = [
  path4.resolve(__dirname, "scripts", "transcribe.py"),
  path4.resolve(__dirname, "..", "scripts", "transcribe.py"),
  path4.resolve(__dirname, "..", "..", "scripts", "transcribe.py")
].find((p) => fs4.existsSync(p)) ?? path4.resolve(__dirname, "..", "scripts", "transcribe.py");
var LocalWhisperTranscriber = class {
  constructor(config) {
    this.config = config;
    this.pythonPath = config.pythonPath ?? "python3";
  }
  config;
  pythonPath;
  async transcribe(audioPath) {
    return execFileSync2(this.pythonPath, [SCRIPT_PATH, audioPath, this.config.modelSize], {
      encoding: "utf-8",
      timeout: 6e5
      // 10 minutes max
    });
  }
};

// src/pipeline.ts
async function runPipeline(url, type, config, options) {
  const transcriberInstance = new LocalWhisperTranscriber({
    modelSize: config.localWhisper?.modelSize ?? "base",
    pythonPath: config.localWhisper?.pythonPath
  });
  const fetcher = getFetcher(
    url,
    type,
    { transcriber: "whisper", cookiesFromBrowser: options?.cookiesFromBrowser },
    transcriberInstance
  );
  console.error(`Fetching ${url} with ${fetcher.constructor.name}...`);
  const raw = await fetcher.fetch(url);
  const resolvedType = type === "auto" ? fetcher.constructor.name === "VideoFetcher" ? "video" : "text" : type;
  const content = parseContent(raw, url, resolvedType);
  const provider = options?.providerOverride ?? config.provider.default;
  console.error(`Generating notes with ${provider}...`);
  const generator = getGenerator(provider, config.providers);
  const markdown = await generator.generate(content);
  const outDir = config.output.directory;
  if (!fs5.existsSync(outDir)) {
    fs5.mkdirSync(outDir, { recursive: true });
  }
  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);
  console.error(`Note written to ${result.filePath}`);
  return result;
}

// src/cli.ts
var program = new Command();
program.name("autolearn").description("Generate structured Markdown study notes from URLs").argument("<url>", "URL of the resource to learn from").option("-p, --provider <name>", "AI provider: claude, openai, or ollama").option("-o, --output <dir>", "Output directory for notes").option("-t, --type <type>", "Resource type: text, video, or auto", "auto").option("-c, --config <path>", "Path to config file").option("-v, --verbose", "Enable verbose logging").option("--cookies-from-browser <browser>", "Pass browser cookies to yt-dlp (e.g. firefox, chrome)").action(async (url, options) => {
  try {
    const config = loadConfig(options.config);
    if (options.output) {
      config.output.directory = options.output;
    }
    const result = await runPipeline(
      url,
      options.type,
      config,
      {
        providerOverride: options.provider,
        cookiesFromBrowser: options.cookiesFromBrowser
      }
    );
    console.log(`
Done! Note saved to: ${result.filePath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (options.verbose && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
});
program.parse();
