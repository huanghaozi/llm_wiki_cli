# LLM Wiki CLI

<p align="center">
  <img src="logo.jpg" width="128" height="128" style="border-radius: 22%;" alt="LLM Wiki Logo">
</p>

<p align="center">
  <strong>在终端中自我构建的个人知识库。</strong><br>
  导入文档、语义搜索、RAG 对话、图谱分析 —— 全部通过命令行完成。
</p>

<p align="center">
  <a href="README.md">English</a> | 中文 | <a href="README_JA.md">日本語</a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#命令一览">命令一览</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="docs/CLI.zh-CN.md">完整 CLI 文档</a>
</p>

---

> **本仓库是 LLM Wiki 的 CLI 版本。**  
> 与[桌面版](https://github.com/nashsu/llm_wiki)共用相同的 Wiki 项目格式和 LanceDB 向量库，面向终端、脚本、服务器与 CI 等无 GUI 场景。

## 这是什么？

**LLM Wiki CLI** 将 PDF、Word、Markdown 等文档自动转化为有组织、相互链接的知识库。

与传统 RAG（每次查询从头检索）不同，LLM 会在 `wiki/` 目录下**增量构建并维护持久化 Wiki**。之后你可以通过命令行搜索、对话、检查质量、分析图谱，无需打开图形界面。

本项目基于 [Karpathy 的 LLM Wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，实现为包含 **24 个子命令**的完整 CLI，并附带可选的 **Rust 原生工具**（PDF 内嵌图提取、Chrome 剪藏服务）。

## 快速开始

```bash
# 1. 安装依赖
yarn install

# 2. 创建项目
yarn cli:dev init ./my-wiki --template general

# 3. 配置 LLM（交互式）
yarn cli:dev config
yarn cli:dev test

# 4. 放入文档并导入
cp report.pdf ./my-wiki/raw/sources/
yarn cli:dev ingest -p ./my-wiki

# 5. 与知识库对话
yarn cli:dev chat -p ./my-wiki
```

**没有 API Key？** 可运行 Demo（仅结构检查，无需 LLM）：

```bash
./demo/run-demo.sh          # Linux/macOS
./demo/run-demo.ps1         # Windows
```

**完整新手指南：** [docs/CLI.zh-CN.md](docs/CLI.zh-CN.md) · 终端运行 `llm-wiki help`

## 命令一览

| 类别 | 命令 |
|------|------|
| **项目** | `init`, `open`, `open-folder` |
| **配置** | `config`, `test`, `help` |
| **内容** | `pages`, `read`, `write`, `wiki-delete`, `sources`, `source-delete` |
| **处理** | `ingest`, `chat`, `search`, `graph`, `research`, `enrich`, `caption`, `embed` |
| **服务** | `serve`, `clip`, `sync`, `schedule-import` |
| **维护** | `lint`, `maintenance`, `review` |

```bash
llm-wiki --help
llm-wiki help ingest      # 查看 ingest 专题帮助
llm-wiki help chat
```

## 功能特性

### 核心工作流

- **两步导入** — LLM 先分析文档，再生成结构化 Wiki 页（`entities/`、`concepts/`、`sources/`）
- **RAG 对话** — 混合搜索 + 图谱扩展 + 流式输出；支持 `/save` 保存回答
- **混合搜索** — 分词关键词 + 可选 LanceDB 向量检索（RRF 融合）
- **四信号知识图谱** — 直接链接、Adamic-Adar、类型亲和；Louvain 社区检测
- **图谱洞察** — 意外连接、孤立页、稀疏集群、桥接节点（与桌面版算法对齐）
- **深度研究** — Tavily / SerpApi / SearXNG 联网搜索 → 写入 Wiki
- **健康检查** — 孤儿页、断链、无出链；可选 LLM 语义分析；`--fix` 自动修复
- **重复页维护** — LLM 检测并合并重复实体/概念页
- **审核队列** — 断链、导入失败等需人工确认的事项

### 原生组件与集成

- **`llm-wiki-native`**（Rust）— 从 PDF/DOCX/PPTX 提取内嵌图；Chrome 剪藏 HTTP 服务（`:19827`）
- **本地 HTTP API** — `llm-wiki serve` 监听 `:19828`（搜索、读文件、图谱、重新扫描）
- **Chrome 扩展** — 运行 `llm-wiki clip` 配合浏览器扩展剪藏网页
- **Obsidian 兼容** — `wiki/` 可直接作为 Obsidian 仓库

### 可配置项

- LLM：OpenAI、Anthropic、Google、Ollama、自定义端点
- 向量嵌入：OpenAI 兼容 `/embeddings` → LanceDB（`{project}/.llm-wiki/lancedb`）
- 多模态：图片与 PDF 内嵌图的 vision caption
- HTTP 代理、定时文件夹导入、输出语言

## 安装

### 环境要求

- **Bun** 或 Node.js 18+
- **yarn**（推荐）
- **Rust**（可选，用于构建 `llm-wiki-native`）

### 开发模式

```bash
git clone https://github.com/huanghaozi/llm_wiki_cli.git
cd llm_wiki_cli
yarn install

yarn cli:dev --help
yarn test:cli                # 84 项单元/集成测试
yarn test:cli:coverage       # 覆盖率 ≥90%（cli/lib）
```

### 编译独立可执行文件

```bash
yarn cli:build      # Linux/macOS
yarn cli:build:win  # Windows
```

### Rust 原生工具

```bash
yarn native:build
yarn native:test
```

多平台交叉编译说明见 [native/README.md](native/README.md)（Windows/Linux，x86_64/ARM64）。

## 项目结构

```
my-wiki/
├── purpose.md
├── wiki/
│   ├── index.md
│   ├── log.md
│   ├── entities/
│   ├── concepts/
│   └── ...
├── raw/sources/          # 放入待导入文件，然后 llm-wiki ingest
└── .llm-wiki/
    ├── lancedb/          # 向量索引（与桌面版共用）
    └── review-queue.json
```

全局 CLI 配置：`~/.llm-wiki-cli/config.json`（Windows：`%USERPROFILE%\.llm-wiki-cli\`）

## 本地 HTTP API

```bash
llm-wiki config --api-server
llm-wiki serve -p ./my-wiki
```

| 端点 | 说明 |
|------|------|
| `GET /api/v1/health` | 健康检查 |
| `GET /api/v1/projects` | 项目列表 |
| `POST /api/v1/projects/{id}/search` | 混合搜索 |
| `GET /api/v1/projects/{id}/graph` | 完整加权图谱 JSON |
| `POST /api/v1/projects/{id}/sources/rescan` | 重新导入来源 |

认证：`Authorization: Bearer <token>` 或 `X-LLM-Wiki-Token`。

## 技术栈（CLI）

| 层级 | 技术 |
|------|------|
| 运行时 | Bun / Node.js |
| CLI | Commander + @inquirer/prompts |
| 向量库 | LanceDB |
| 图谱 | graphology + Louvain |
| 文档解析 | pdf-parse、mammoth |
| 原生 | Rust（PDFium、clip server） |
| 测试 | Vitest |
| CI | GitHub Actions |

仓库中仍保留桌面版源码（`src/`、`src-tauri/`），可用 `yarn tauri dev` 构建 GUI。本 README 以 CLI 为主。

## CLI 与桌面版对比

| 能力 | CLI | 桌面 GUI |
|------|-----|----------|
| 导入、对话、搜索、图谱、lint、研究 | ✅ | ✅ |
| 向量搜索（LanceDB） | ✅ | ✅（同路径） |
| 图谱洞察算法 | ✅（终端/json） | ✅（+ Sigma.js 可视化） |
| 可视化编辑 | `write`（Markdown） | Milkdown WYSIWYG |
| 多会话聊天历史 | 单会话 REPL | 持久化多会话 |

CLI 创建的项目可直接用桌面版打开，反之亦然。

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/CLI.zh-CN.md](docs/CLI.zh-CN.md) | **完整 CLI 使用指南**（零基础、每条命令详解） |
| [demo/README.md](demo/README.md) | Demo 运行说明 |
| [native/README.md](native/README.md) | 原生工具构建与 PDFium |
| `llm-wiki help [topic]` | 内置专题帮助 |

## 致谢

方法论来自 **Andrej Karpathy** 的 [llm-wiki.md](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)。

CLI 实现在 [LLM Wiki 桌面项目](https://github.com/nashsu/llm_wiki) 基础上扩展。

## 许可证

GNU General Public License v3.0 — 见 [LICENSE](LICENSE)。
