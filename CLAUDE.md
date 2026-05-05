# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AutoLearning 是一个 CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。

## 常用命令

```bash
pnpm dev                  # 开发运行（tsx）
pnpm build                # 构建（tsup）
pnpm test                 # 运行所有测试（vitest）
pnpm test src/<module>/   # 运行单个模块测试
node dist/cli.js --help   # 查看 CLI 帮助
```

## 架构

策略 + 管道模式，5 个模块线性执行：

```
CLI → Fetcher (策略) → Parser → Generator (策略) → Output
                                 ↘ Transcriber (策略, 按需)
```

- **Fetcher** (`src/fetcher/`): URL → 文本，TextFetcher（Readability 提取）和 VideoFetcher（yt-dlp 字幕）
- **Parser** (`src/parser/`): HTML 清洗、文本规范化
- **Generator** (`src/generator/`): LLM 生成笔记，支持 Claude / OpenAI / Ollama 三后端
- **Transcriber** (`src/transcriber/`): 语音转文字，支持 Whisper / 阿里云
- **Output** (`src/output/`): Markdown 文件写入
- **Config** (`src/config.ts`): TOML 配置 + `${ENV_VAR}` 展开
- **Pipeline** (`src/pipeline.ts`): 串联所有模块
- **CLI** (`src/cli.ts`): Commander 参数解析

配置文件：`~/.autolearning/config.toml`