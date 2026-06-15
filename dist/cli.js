#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import fs7 from "fs";
import os4 from "os";
import path6 from "path";

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
import fs6 from "fs";

// src/fetcher/text-fetcher.ts
import { execFileSync } from "child_process";
import fs2 from "fs";
import os2 from "os";
import path2 from "path";
var JINA_BASE = "https://r.jina.ai/";
function isAuthWall(text) {
  const lower = text.toLowerCase();
  const markers = [
    "please log in",
    "please login",
    "\u8BF7\u60A8\u767B\u5F55",
    "\u8BF7\u767B\u5F55",
    "captcha",
    "\u5B89\u5168\u9A8C\u8BC1",
    "precondition failed",
    "access denied",
    "enable javascript",
    "please make sure you are authorized"
  ];
  return markers.some((m) => lower.includes(m));
}
var TextFetcher = class {
  constructor(options) {
    this.options = options;
  }
  options;
  cookieFile = null;
  supports(_url) {
    return true;
  }
  async fetch(url) {
    try {
      const result = await this.fetchViaJina(url);
      if (result) return result;
    } catch {
    }
    if (this.options?.cookiesFromBrowser) {
      try {
        const result = await this.fetchWithCookies(url);
        if (result) return result;
      } catch {
      }
    }
    console.error("r.jina.ai and cookie fetch failed, trying direct fetch...");
    return this.directFetch(url);
  }
  async fetchViaJina(url) {
    const encoded = encodeURIComponent(url);
    const jinaUrl = `${JINA_BASE}${encoded}`;
    return new Promise((resolve, reject) => {
      try {
        const stdout = execFileSync("curl", [
          "--silent",
          "--max-time",
          "15",
          "-H",
          "Accept: text/markdown,text/plain,*/*",
          "-H",
          "User-Agent: AutoLearning/0.1",
          jinaUrl
        ], { encoding: "utf-8", timeout: 2e4, stdio: "pipe" });
        if (!stdout || stdout.trim().length < 100) {
          resolve(null);
          return;
        }
        if (isAuthWall(stdout)) {
          resolve(null);
          return;
        }
        const title = this.extractTitleFromMarkdown(stdout) ?? url;
        resolve({ title, rawText: stdout.trim() });
      } catch (err) {
        reject(err);
      }
    });
  }
  async fetchWithCookies(url) {
    const cookieFile = await this.ensureCookies();
    if (!cookieFile) return null;
    console.error("Fetching with browser cookies...");
    let stdout;
    try {
      stdout = execFileSync("curl", [
        "--silent",
        "--max-time",
        "15",
        "-b",
        cookieFile,
        "-H",
        "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "-H",
        "Accept-Language: zh-CN,zh;q=0.9,en;q=0.8",
        "-L",
        url
      ], { encoding: "utf-8", timeout: 2e4, stdio: "pipe" });
    } catch {
      return null;
    }
    if (!stdout || stdout.trim().length < 500) return null;
    const html = stdout;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch?.[1]?.trim() ?? url;
    title = title.replace(/\s*[-–|]\s*知乎\s*$/, "");
    try {
      const { JSDOM } = await import("jsdom");
      const { Readability } = await import("@mozilla/readability");
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article?.textContent && article.textContent.trim().length > 50) {
        return { title, rawText: article.textContent.trim() };
      }
    } catch {
    }
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = bodyMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    if (bodyText.length > 100) {
      return { title, rawText: bodyText };
    }
    return null;
  }
  async ensureCookies() {
    if (this.cookieFile) return this.cookieFile;
    const browser = this.options?.cookiesFromBrowser;
    if (!browser) return null;
    const cookiePath = path2.join(os2.tmpdir(), `autolearn_cookies_${Date.now().toString(36)}.txt`);
    fs2.writeFileSync(cookiePath, "# Netscape HTTP Cookie File\n");
    try {
      execFileSync("yt-dlp", [
        "--cookies-from-browser",
        browser,
        "--cookies",
        cookiePath,
        "--skip-download",
        "--no-playlist",
        "https://www.bilibili.com"
      ], { encoding: "utf-8", timeout: 15e3, stdio: "pipe" });
    } catch {
    }
    if (!fs2.existsSync(cookiePath) || fs2.statSync(cookiePath).size < 500) {
      try {
        fs2.unlinkSync(cookiePath);
      } catch {
      }
      return null;
    }
    this.cookieFile = cookiePath;
    return cookiePath;
  }
  /** Clean up temp cookie file */
  destroy() {
    if (this.cookieFile) {
      try {
        fs2.unlinkSync(this.cookieFile);
      } catch {
      }
    }
  }
  async directFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const { JSDOM } = await import("jsdom");
      const { Readability } = await import("@mozilla/readability");
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
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      return {
        title: article?.title ?? dom.window.document.title ?? "Untitled",
        rawText: article?.textContent ?? dom.window.document.body?.textContent ?? ""
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  extractTitleFromMarkdown(markdown) {
    const match = markdown.match(/^Title:\s*(.+)$/m);
    if (match) return match[1].trim();
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) return h1Match[1].trim();
    return null;
  }
};

// src/fetcher/video-fetcher.ts
import { execFileSync as execFileSync2 } from "child_process";
import fs3 from "fs";
import os3 from "os";
import path3 from "path";
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
      if (fs3.existsSync(audioPath)) fs3.unlinkSync(audioPath);
    } catch {
    }
    return {
      title: videoTitle,
      rawText: transcript
    };
  }
  wrap412(err) {
    const msg = err?.stderr || err?.message || "";
    if (msg.includes("412") && !this.options.cookiesFromBrowser) {
      return new Error(
        "Bilibili requires login. Try: --cookies-from-browser firefox"
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
  downloadAudio(url) {
    const tmpDir = this.options.tmpDir ?? os3.tmpdir();
    const uniqueId = Date.now().toString(36);
    const outputTemplate = path3.join(tmpDir, `audio_${uniqueId}.%(ext)s`);
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
      "64K",
      "--no-playlist"
    ];
    if (this.options.cookiesFromBrowser) {
      args.push("--cookies-from-browser", this.options.cookiesFromBrowser);
    }
    args.push(url);
    try {
      execFileSync2("yt-dlp", args, {
        encoding: "utf-8",
        timeout: 12e4,
        stdio: "pipe"
      });
    } catch (err) {
      throw this.wrap412(err);
    }
    const expectedFile = path3.join(tmpDir, `audio_${uniqueId}.m4a`);
    if (fs3.existsSync(expectedFile)) return expectedFile;
    for (const ext of ["webm", "mp3", "opus", "mp4"]) {
      const alt = path3.join(tmpDir, `audio_${uniqueId}.${ext}`);
      if (fs3.existsSync(alt)) return alt;
    }
    throw new Error("Audio download failed: no output file found");
  }
  extractSubtitles(url) {
    const videoId = Date.now().toString(36);
    const tmpDir = this.options.tmpDir ?? os3.tmpdir();
    const candidates = [
      path3.join(tmpDir, `${videoId}.zh-Hans.vtt`),
      path3.join(tmpDir, `${videoId}.zh-CN.vtt`),
      path3.join(tmpDir, `${videoId}.zh.vtt`),
      path3.join(tmpDir, `${videoId}.zh-TW.vtt`),
      path3.join(tmpDir, `${videoId}.en.vtt`)
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
          path3.join(tmpDir, `${videoId}.%(ext)s`)
        ];
        if (this.options.cookiesFromBrowser) {
          args.push("--cookies-from-browser", this.options.cookiesFromBrowser);
        }
        args.push(url);
        execFileSync2("yt-dlp", args, {
          encoding: "utf-8",
          timeout: 6e4,
          stdio: "pipe"
        });
      } catch {
      }
      let subFile = null;
      for (const c of candidates) {
        if (fs3.existsSync(c)) {
          subFile = c;
          break;
        }
      }
      if (!subFile) throw new Error("No subtitle file found");
      const content = fs3.readFileSync(subFile, "utf-8");
      return this.parseVTT(content);
    } finally {
      for (const c of candidates) {
        try {
          if (fs3.existsSync(c)) fs3.unlinkSync(c);
        } catch {
        }
      }
    }
  }
  parseVTT(vtt) {
    const blocks = vtt.replace(/^WEBVTT[^\n]*\n/, "").split(/\n{2,}/);
    const entries = [];
    const seenTexts = /* @__PURE__ */ new Set();
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const timingIdx = lines.findIndex((l) => l.includes("-->"));
      if (timingIdx < 0) continue;
      const timingLine = lines[timingIdx];
      const match = timingLine.match(
        /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)/
      );
      if (!match) continue;
      const textLines = lines.slice(timingIdx + 1);
      const rawText = textLines.join(" ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      if (!rawText || rawText.length < 2 || seenTexts.has(rawText)) continue;
      seenTexts.add(rawText);
      entries.push({ text: rawText });
    }
    if (entries.length === 0) return "";
    const deduped = [];
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
    return deduped.map((e) => e.text).join(" ");
  }
  extractTitle(url) {
    try {
      const args = ["--js-runtimes", "node", "--get-title"];
      if (this.options.cookiesFromBrowser) {
        args.push("--cookies-from-browser", this.options.cookiesFromBrowser);
      }
      args.push(url);
      const result = execFileSync2("yt-dlp", args, {
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
function getFetcher(url, type, videoOptions, transcriberInstance) {
  const fullOptions = {
    ...videoOptions ?? { transcriber: "whisper" },
    transcriberInstance
  };
  if (type === "video") return new VideoFetcher(fullOptions);
  if (type === "text") return new TextFetcher({ cookiesFromBrowser: videoOptions?.cookiesFromBrowser });
  const vf = new VideoFetcher(fullOptions);
  if (vf.supports(url)) return vf;
  return new TextFetcher({ cookiesFromBrowser: videoOptions?.cookiesFromBrowser });
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

**\u5173\u952E\u6D1E\u5BDF / Key Takeaways (the most important section, use the same language as the content):**
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
- Use --- for visual separation between major topics (do not overuse)
- Use > blockquotes for standout definitions, surprising facts, or memorable quotes
- Include concrete examples and analogies \u2014 these stick better than abstract definitions

**Structure principles:**
- Title: # followed by the topic
- Opening: TL;DR blockquote + 1-2 sentences of context
- Body: organize by logic flow, not by the order content appeared. Merge related points across the source
- Section count: typically 3-6 ## sections. Don't over-fragment
- End with source link on its own line

**\u5173\u952E\u6D1E\u5BDF / Key Takeaways (the most important section, use the same language as the content):**
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

**\u5173\u952E\u6D1E\u5BDF / Key Takeaways (the most important section, use the same language as the content):**
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
import fs4 from "fs";
import path4 from "path";
var DATE_RE = /\{date\}/g;
var TITLE_RE = /\{title\}/g;
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 200);
}
function writeNote(markdown, title, directory, filenameTemplate) {
  if (!fs4.existsSync(directory)) {
    throw new Error(`Output directory does not exist: ${directory}`);
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(title) || "untitled";
  let filename = filenameTemplate.replace(TITLE_RE, safeTitle).replace(DATE_RE, date);
  if (!filename.endsWith(".md")) {
    filename += ".md";
  }
  const filePath = path4.join(directory, filename);
  fs4.writeFileSync(filePath, markdown, "utf-8");
  return { markdown, filePath };
}

// src/output/sanitize.ts
function sanitize(text) {
  let result = text.trim();
  result = result.replace(
    /\n{1,2}(?:希望对你[^\n]{0,80}|如有需要[^\n]{0,80}|如需[^\n]{0,80}|欢迎反馈[^\n]{0,80}|请告诉[^\n]{0,80}|以上[^\n]{0,40}内容[^\n]{0,40})$/g,
    ""
  );
  result = result.replace(
    /\n{1,2}(?:let me know[^\n]{0,200}|feel free to[^\n]{0,200}|happy to[^\n]{0,200}|please let me know[^\n]{0,200}|don't hesitate[^\n]{0,200}|hope this helps[^\n]{0,200}|thanks for reading[^\n]{0,200})$/gi,
    ""
  );
  result = result.replace(
    /^(?:Here is (?:a |the )?(?:summary|note|transcript)[^\n]{0,200}\n{1,2}|以下是[^\n]{0,200}\n{1,2})/i,
    ""
  );
  const lines = result.split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const lower = last.toLowerCase();
    if (lower === "---" || /^(let me know|feel free|happy to|hope this|thanks for|please let|don't hesitate)/i.test(lower) || /^(希望|如有|如需|欢迎|请告诉|以上)/.test(lower)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

// src/transcriber/local-whisper.ts
import { execFileSync as execFileSync3 } from "child_process";
import fs5 from "fs";
import path5 from "path";
import { fileURLToPath } from "url";
var __dirname = path5.dirname(fileURLToPath(import.meta.url));
var SCRIPT_PATH = [
  path5.resolve(__dirname, "scripts", "transcribe.py"),
  path5.resolve(__dirname, "..", "scripts", "transcribe.py"),
  path5.resolve(__dirname, "..", "..", "scripts", "transcribe.py")
].find((p) => fs5.existsSync(p)) ?? path5.resolve(__dirname, "..", "scripts", "transcribe.py");
var LocalWhisperTranscriber = class {
  constructor(config) {
    this.config = config;
    this.pythonPath = config.pythonPath ?? "python3";
  }
  config;
  pythonPath;
  async transcribe(audioPath) {
    return execFileSync3(this.pythonPath, [SCRIPT_PATH, audioPath, this.config.modelSize], {
      encoding: "utf-8",
      timeout: 18e5,
      // 30 minutes max
      maxBuffer: 50 * 1024 * 1024,
      // 50MB — enough for very long transcripts
      env: { ...process.env, HF_HUB_OFFLINE: "1" }
    });
  }
};

// src/optimizer/index.ts
import OpenAI2 from "openai";
var OPTIMIZE_PROMPT = `You are a content cleaner. Given raw text from a video transcript, subtitle file, or web page, clean it up into well-formatted prose for study notes.

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
var MIN_CHARS_FOR_OPTIMIZATION = 200;
async function optimizeTranscript(rawText, config) {
  if (rawText.length < MIN_CHARS_FOR_OPTIMIZATION) {
    return rawText;
  }
  const client = new OpenAI2({
    apiKey: config.apiKey ?? "",
    ...config.baseUrl ? { baseURL: config.baseUrl } : {}
  });
  const response = await client.chat.completions.create({
    model: config.model,
    max_tokens: 4096,
    temperature: 0.1,
    messages: [
      { role: "system", content: OPTIMIZE_PROMPT },
      { role: "user", content: `Clean up the following content:

${rawText}` }
    ]
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("Empty response from optimizer LLM");
  return text.trim();
}
var GENERIC_TITLE_PATTERNS = [
  /^来看看/i,
  /^Chat\b/i,
  /^(New Chat|Untitled|No Title)$/i,
  /^https?:\/\//i,
  /^.{1,5}$/,
  /^Untitled/i,
  /^未命名/i,
  /^无标题/i
];
function isGenericTitle(title) {
  if (!title || title.length < 2) return true;
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(title));
}
async function fixTitle(text, currentTitle, config) {
  if (!isGenericTitle(currentTitle)) return currentTitle;
  console.error(`Detected generic title: "${currentTitle}", generating better one...`);
  const snippet = text.slice(0, 1e3);
  const client = new OpenAI2({
    apiKey: config.apiKey ?? "",
    ...config.baseUrl ? { baseURL: config.baseUrl } : {}
  });
  try {
    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 50,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a title writer. Given content snippet, output ONLY a concise, descriptive title (max 15 words) in the same language as the content. No quotes, no Markdown, no explanation."
        },
        {
          role: "user",
          content: `Content:
${snippet}

Generate a title:`
        }
      ]
    });
    const generated = response.choices[0]?.message?.content?.trim();
    if (generated && generated.length > 2 && generated.length < 100) {
      const cleaned = generated.replace(/^["'《]|["'》]$/g, "");
      console.error(`Generated title: "${cleaned}"`);
      return cleaned;
    }
    console.error("Generated title was empty or too short, keeping original");
  } catch (err) {
    console.error(`Title generation failed: ${err.message}`);
  }
  return currentTitle;
}

// src/pipeline.ts
async function runPipelineFromText(text, title, sourceLabel, config, options) {
  const raw = { title, rawText: text };
  const provider = options?.providerOverride ?? config.provider.default;
  const providerConfig = config.providers[provider];
  if (providerConfig?.apiKey || providerConfig?.baseUrl) {
    console.error("Optimizing content...");
    try {
      raw.rawText = await optimizeTranscript(raw.rawText, providerConfig);
    } catch (err) {
      console.error("Optimization failed, using raw text:", err.message);
    }
    try {
      const fixedTitle = await fixTitle(raw.rawText, raw.title, providerConfig);
      if (fixedTitle !== raw.title) {
        console.error(`Title updated: "${raw.title}" \u2192 "${fixedTitle}"`);
        raw.title = fixedTitle;
      }
    } catch (err) {
      console.error("Title fix failed, keeping original:", err.message);
    }
  }
  const content = parseContent(raw, sourceLabel, "text");
  console.error(`Generating notes with ${provider}...`);
  const generator = getGenerator(provider, config.providers);
  const markdown = sanitize(await generator.generate(content));
  const outDir = config.output.directory;
  if (!fs6.existsSync(outDir)) {
    fs6.mkdirSync(outDir, { recursive: true });
  }
  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);
  console.error(`Note written to ${result.filePath}`);
  return result;
}
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
  if (true) {
    const provider2 = options?.providerOverride ?? config.provider.default;
    const providerConfig = config.providers[provider2];
    if (providerConfig?.apiKey || providerConfig?.baseUrl) {
      console.error("Optimizing transcript...");
      try {
        raw.rawText = await optimizeTranscript(raw.rawText, providerConfig);
      } catch (err) {
        console.error("Transcript optimization failed, using raw text:", err.message);
      }
      try {
        const fixedTitle = await fixTitle(raw.rawText, raw.title, providerConfig);
        if (fixedTitle !== raw.title) {
          console.error(`Title updated: "${raw.title}" \u2192 "${fixedTitle}"`);
          raw.title = fixedTitle;
        }
      } catch (err) {
        console.error("Title fix failed, keeping original:", err.message);
      }
    }
  }
  const content = parseContent(raw, url, resolvedType);
  const provider = options?.providerOverride ?? config.provider.default;
  console.error(`Generating notes with ${provider}...`);
  const generator = getGenerator(provider, config.providers);
  const markdown = sanitize(await generator.generate(content));
  const outDir = config.output.directory;
  if (!fs6.existsSync(outDir)) {
    fs6.mkdirSync(outDir, { recursive: true });
  }
  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);
  console.error(`Note written to ${result.filePath}`);
  return result;
}

// src/output/convert.ts
import { execFileSync as execFileSync4 } from "child_process";
function convertToPdf(mdPath, pdfPath) {
  try {
    execFileSync4("pandoc", [
      mdPath,
      "-o",
      pdfPath,
      "--pdf-engine=xelatex",
      "-V",
      "mainfont=DejaVu Serif",
      "-V",
      "monofont=DejaVu Sans Mono",
      "--from=markdown"
    ], { encoding: "utf-8", timeout: 3e4, stdio: "pipe" });
    return;
  } catch {
  }
  throw new Error(
    "PDF conversion requires pandoc. Install: sudo apt install pandoc texlive-xetex"
  );
}

// src/cli.ts
var HISTORY_FILE = path6.join(os4.homedir(), ".autolearning", "history.json");
function loadHistory() {
  try {
    if (fs7.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs7.readFileSync(HISTORY_FILE, "utf-8"));
    }
  } catch {
  }
  return {};
}
function saveHistory(history) {
  const dir = path6.dirname(HISTORY_FILE);
  if (!fs7.existsSync(dir)) fs7.mkdirSync(dir, { recursive: true });
  fs7.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}
var program = new Command();
program.name("autolearn").description("Generate structured Markdown study notes from URLs or local files").argument("[url]", "URL of the resource to learn from (optional if using --file or --stdin)").option("-p, --provider <name>", "AI provider").option("-o, --output <dir>", "Output directory for notes").option("-t, --type <type>", "Resource type: text, video, or auto", "auto").option("-c, --config <path>", "Path to config file").option("-v, --verbose", "Enable verbose logging").option("--cookies-from-browser <browser>", "Browser cookies for sites that require login (e.g. firefox, chrome)").option("--file <path>", "Read content from a local file (.md, .txt, etc.)").option("--stdin", "Read content from standard input").option("--title <title>", "Title for the notes (used with --file or --stdin)").option("--format <fmt>", "Output format: md or pdf", "md").option("--force", "Force re-processing even if URL was already processed").action(async (url, options) => {
  try {
    const config = loadConfig(options.config);
    if (options.output) {
      config.output.directory = options.output;
    }
    const history = loadHistory();
    if (options.file || options.stdin) {
      let text;
      let title;
      let sourceLabel;
      if (options.stdin) {
        text = await readStdin();
        title = options.title ?? "User Input";
        sourceLabel = "stdin";
      } else {
        const filePath = path6.resolve(options.file);
        if (!fs7.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        text = fs7.readFileSync(filePath, "utf-8");
        title = options.title ?? path6.basename(filePath, path6.extname(filePath));
        sourceLabel = `file:${filePath}`;
      }
      if (!text.trim()) {
        throw new Error("Input is empty");
      }
      const result2 = await runPipelineFromText(text, title, sourceLabel, config, {
        providerOverride: options.provider
      });
      await handleOutput(result2, options);
      return;
    }
    if (!url) {
      throw new Error("Please provide a URL, or use --file or --stdin");
    }
    const cleanUrl = url.trim();
    if (history[cleanUrl] && !options.force) {
      console.error(`Already processed on ${history[cleanUrl].date}: ${history[cleanUrl].file}`);
      console.error("Use --force to re-process.");
      return;
    }
    const result = await runPipeline(
      cleanUrl,
      options.type,
      config,
      {
        providerOverride: options.provider,
        cookiesFromBrowser: options.cookiesFromBrowser
      }
    );
    history[cleanUrl] = { date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), file: result.filePath };
    saveHistory(history);
    await handleOutput(result, options);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (options.verbose && error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
});
async function handleOutput(result, options) {
  const fmt = options.format === "pdf" ? "pdf" : "md";
  if (fmt === "pdf") {
    const pdfPath = result.filePath.replace(/\.md$/, ".pdf");
    console.error("Converting to PDF...");
    convertToPdf(result.filePath, pdfPath);
    console.log(`
Done! Note saved to: ${pdfPath}`);
  } else {
    console.log(`
Done! Note saved to: ${result.filePath}`);
  }
}
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}
program.parse();
