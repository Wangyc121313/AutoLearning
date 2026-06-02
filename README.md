# AutoLearning

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blue)](https://claude.ai/code)

CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。支持字幕提取 + 本地 Whisper 转录双路径，内置转录文本优化与 LLM 客套话过滤，输出风格灵活、可读性强的笔记。

## 安装

```bash
pnpm install
pnpm build

# 注册全局命令（之后终端直接输入 autolearn）
pnpm link --global
```

> 全局命令需要 `pnpm setup` 并将 `PNPM_HOME` 加入 PATH（安装时会提示）。

### 前置依赖

| 工具 | 用途 | 安装 |
|------|------|------|
| Python 3.10+ | 运行转录脚本 | `apt install python3` |
| yt-dlp | 视频下载/字幕提取 | `pip install yt-dlp` |
| FFmpeg | 音频提取与转码 | `sudo apt install ffmpeg` |
| faster-whisper | 本地语音转录（视频无字幕时需要） | `uv pip install faster-whisper` |

## 使用

```bash
# 文档/博客
autolearn https://example.com/article

# 视频（自动提取字幕，无字幕时本地 Whisper 转录）
autolearn -t video https://www.youtube.com/watch?v=xxx

# 指定 AI 提供商
autolearn -p openai https://example.com/article

# Bilibili 视频（需要浏览器 cookie）
autolearn -t video --cookies-from-browser firefox https://www.bilibili.com/video/BVxxx

# 指定输出目录
autolearn -o ./my-notes https://example.com/article

# 查看帮助
autolearn --help
```

## 配置

配置文件：`~/.autolearning/config.toml`

```toml
[provider]
default = "deepseek"

# AI 提供商（支持任意 OpenAI 兼容接口）
[providers.deepseek]
api_key = "sk-xxx"
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

# 本地 Whisper 转录（视频无字幕时自动启用）
[local_whisper]
python_path = "/path/to/venv/bin/python3"
model_size = "base"        # tiny | base | small | medium | large
```

`${VAR}` 格式会自动展开环境变量。

## 架构

```
CLI → Fetcher → Optimizer → Parser → Generator → sanitize → Output
              ↘ Transcriber（无字幕时）              (去客套话)
```

### 视频处理双路径

```
┌─ 有字幕（秒级）→ 提取 VTT ──────────────────┐
│                                              ├→ Optimizer → 生成笔记
└─ 无字幕（分钟级）→ 下载音频 → 本地 Whisper ──┘
```

### 模块

| 模块 | 路径 | 职责 |
|------|------|------|
| CLI | `src/cli.ts` | 命令行参数解析 |
| Config | `src/config.ts` | TOML 配置加载 + `${ENV}` 展开 |
| Fetcher | `src/fetcher/` | URL 抓取（TextFetcher/VideoFetcher），含 VTT 解析去重 |
| Optimizer | `src/optimizer/` | LLM 清洗转录文本（去时间戳、纠错、重组句子） |
| Parser | `src/parser/` | HTML 清洗、文本规范化 |
| Generator | `src/generator/` | LLM 生成笔记（Claude/OpenAI/DeepSeek/Ollama） |
| Transcriber | `src/transcriber/` | 语音转文字（OpenAI Whisper API/本地 Faster-Whisper/阿里云） |
| Output | `src/output/` | Markdown 写入 + LLM 客套话过滤 |

## 开发

```bash
pnpm dev           # 开发运行（tsx）
pnpm build         # 构建
pnpm test          # 运行全部测试（50 个）
pnpm test:watch    # 监听模式
```
