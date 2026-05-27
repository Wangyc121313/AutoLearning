# AutoLearning

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blue)](https://claude.ai/code)         

CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。

## 安装

```bash
pnpm install
pnpm build

# 注册全局命令（之后终端直接输入 autolearn 即可）
pnpm link --global
```

**前置依赖：**

| 工具 | 用途 | 安装 |
|------|------|------|
| yt-dlp | 视频下载/字幕提取 | `pip install yt-dlp` |
| FFmpeg | 音频提取 | `sudo apt install ffmpeg` |
| faster-whisper | 本地语音转录（可选，仅视频无字幕时需要） | `uv pip install faster-whisper` |

## 使用

```bash
# 文档/博客
autolearn https://example.com/article

# 视频（自动提取字幕，或本地 Whisper 转录）
autolearn -t video https://www.youtube.com/watch?v=xxx

# 指定 AI 提供商
autolearn -p openai https://example.com/article

# Bilibili 视频（需要浏览器 cookie 登录）
autolearn -t video --cookies-from-browser firefox https://www.bilibili.com/video/BVxxx

# 指定输出目录
autolearn -o ./my-notes https://example.com/article

# 查看帮助
autolearn --help
```

如果未注册全局命令，也可以用 `node dist/cli.js` 替代 `autolearn`。

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
model_size = "base"    # tiny | base | small | medium | large

# OpenAI Whisper API（云端，按量计费）
[whisper]
api_key = "${OPENAI_API_KEY}"
model = "whisper-1"
```

`${VAR}` 格式的值会自动展开环境变量。

## 架构

```
CLI → Fetcher → Parser → Generator → Output
              ↘ Transcriber（无字幕时）
```

**视频处理双路径：**

```
┌─ 有字幕（秒级）─→ yt-dlp 提取 VTT ──────────────┐
│                                                  ├─→ Parser → LLM 生成笔记
└─ 无字幕（分钟级）─→ yt-dlp 下载音频 → 本地 Whisper ─┘
```

**模块：**

| 模块 | 路径 | 职责 |
|------|------|------|
| CLI | `src/cli.ts` | 命令行参数解析 |
| Config | `src/config.ts` | TOML 配置加载 + 环境变量展开 |
| Fetcher | `src/fetcher/` | URL 内容抓取（TextFetcher / VideoFetcher） |
| Parser | `src/parser/` | HTML 清洗、文本规范化 |
| Generator | `src/generator/` | LLM 生成笔记（Claude / OpenAI / DeepSeek / Ollama） |
| Transcriber | `src/transcriber/` | 语音转文字（OpenAI Whisper API / 本地 Faster-Whisper / 阿里云） |
| Output | `src/output/` | Markdown 文件写入 |

## 开发

```bash
pnpm dev          # 开发运行（tsx）
pnpm build        # 构建
pnpm test         # 运行全部测试
pnpm test:watch   # 监听模式
```
