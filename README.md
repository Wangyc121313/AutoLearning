# AutoLearning

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blue)](https://claude.ai/code)

CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。

## 安装

```bash
pnpm install
pnpm build
```

## 使用

```bash
# 文档/博客
autolearn https://example.com/article

# 视频（自动提取字幕）
autolearn -t video https://www.youtube.com/watch?v=xxx

# 指定 AI 提供商
autolearn -p openai https://example.com/article

# 指定输出目录
autolearn -o ./my-notes https://example.com/article
```

## 配置

创建 `~/.autolearning/config.toml`：

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
```

支持的环境变量：`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`。

## 开发

```bash
pnpm dev          # 开发运行
pnpm build        # 构建
pnpm test         # 运行测试
pnpm test:watch   # 监听模式
```

## 架构

```
CLI → Fetcher → Parser → Generator → Output
```

- **Fetcher** — URL 内容抓取（文本 / 视频字幕）
- **Parser** — 清洗规范化
- **Generator** — LLM 生成笔记（Claude / OpenAI / Ollama）
- **Output** — Markdown 文件写入
