# AutoLearning

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blue)](https://claude.ai/code)

从 URL 或本地文件自动生成结构化 Markdown 学习笔记的 CLI 工具。

**文本**：r.jina.ai 代理抓取 + Readability 降级，反爬网站支持 `--stdin` / `--file` 手动输入。

**视频**：字幕优先（秒级）→ 本地 Faster-Whisper 兜底（分钟级），自动转录优化与去重。

**输出**：TL;DR 开篇 → 灵活分段（表格/引用/代码块自适应）→ 关键洞察收尾，自动过滤 AI 客套话。

## 安装

```bash
pnpm install
pnpm build

# 注册全局命令
pnpm link --global
```

> 全局命令需要 `pnpm setup` 并将 `PNPM_HOME` 加入 PATH。

### 前置依赖

| 工具 | 用途 | 何时需要 | 安装 |
|------|------|----------|------|
| yt-dlp | 视频下载/字幕提取 | 视频输入 | `pip install yt-dlp` |
| FFmpeg | 音频提取与转码 | 视频输入 | `sudo apt install ffmpeg` |
| Python 3.10+ | 运行 Whisper 脚本 | 视频无字幕时 | `apt install python3` |
| faster-whisper | 本地语音转录 | 视频无字幕时 | `uv pip install faster-whisper` |

文本/博客输入无需额外依赖。

## 使用

### 文本（文档、博客、专栏）

```bash
# 普通网站
autolearn https://nodejs.org/en/about

# 需要反爬的网站（自动走 r.jina.ai 代理）
autolearn https://www.bilibili.com/opus/1042547317663596551

# 强反爬网站（浏览器复制 → 命令行输入）
pbpaste | autolearn --stdin --title "文章标题"
autolearn --file article.md
```

### 视频（YouTube、Bilibili）

```bash
# YouTube（通常有字幕，秒级完成）
autolearn -t video https://www.youtube.com/watch?v=xxx

# Bilibili（需浏览器登录态）
autolearn -t video --cookies-from-browser firefox https://www.bilibili.com/video/BVxxx

# 自动检测类型
autolearn https://www.youtube.com/watch?v=xxx
```

### 其他选项

```bash
# 指定 AI 提供商
autolearn -p claude https://example.com/article

# 指定输出目录
autolearn -o ./my-notes https://example.com/article

# 查看完整帮助
autolearn --help
```

## 配置

`~/.autolearning/config.toml`：

```toml
[provider]
default = "deepseek"

# AI 提供商（支持任意 OpenAI 兼容接口）
[providers.deepseek]
api_key = "${DEEPSEEK_API_KEY}"
model = "deepseek-chat"
base_url = "https://api.deepseek.com/v1"

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

# 本地 Whisper（视频无字幕时自动启用）
[local_whisper]
python_path = "/path/to/venv/bin/python3"
model_size = "base"        # tiny | base | small | medium | large
```

`${VAR}` 格式自动展开为环境变量。

## 架构

```
                 ┌─ 文本 ─→ r.jina.ai(主) → Readability(降级) ─┐
CLI → Fetcher ──┤                                              ├─→ Optimizer → Parser → Generator → sanitize → Output
                 └─ 视频 ─→ 字幕提取(主) → Whisper转录(降级) ──┘
```

| 模块 | 路径 | 职责 |
|------|------|------|
| CLI | `src/cli.ts` | 命令行解析，支持 URL/文件/stdin 三种输入 |
| Config | `src/config.ts` | TOML 配置 + `${ENV}` 展开 |
| Fetcher | `src/fetcher/` | TextFetcher（r.jina.ai/curl → Readability 降级）+ VideoFetcher（字幕 → Whisper 双路径），含 VTT 去重 |
| Optimizer | `src/optimizer/` | LLM 清洗（去时间戳、纠错、去网页噪音、智能分段） |
| Parser | `src/parser/` | HTML 清洗、文本规范化 |
| Generator | `src/generator/` | LLM 生成笔记（Claude/OpenAI/DeepSeek/Ollama），含自适应排版 prompt |
| Transcriber | `src/transcriber/` | 语音转文字（本地 Faster-Whisper / OpenAI Whisper API / 阿里云） |
| Output | `src/output/` | Markdown 写入 + LLM 客套话过滤 |

## 开发

```bash
pnpm dev           # 开发运行（tsx）
pnpm build         # 构建
pnpm test          # 全部测试（52 个）
pnpm test:watch    # 监听模式
```
