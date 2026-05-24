# LLM Wiki CLI

<p align="center">
  <img src="logo.jpg" width="128" height="128" style="border-radius: 22%;" alt="LLM Wiki Logo">
</p>

<p align="center">
  <strong>A personal knowledge base that builds itself — from the terminal.</strong><br>
  Ingest documents, search semantically, chat with RAG, and maintain a structured wiki via CLI.
</p>

<p align="center">
  English | <a href="README_CN.md">中文</a> | <a href="README_JA.md">日本語</a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="docs/CLI.zh-CN.md">Full CLI Guide (中文)</a>
</p>

---

> **This repository is the CLI edition of LLM Wiki.**  
> It shares the same wiki project format and LanceDB vector store as the [desktop app](https://github.com/nashsu/llm_wiki), but is designed to run headless in terminals, scripts, servers, and CI.

## What is this?

**LLM Wiki CLI** turns your documents (PDF, DOCX, Markdown, …) into an organized, interlinked knowledge base — automatically, from the command line.

Instead of traditional RAG (retrieve-and-answer from scratch every time), the LLM **incrementally builds and maintains a persistent wiki** under `wiki/`. You then search, chat, lint, and graph-analyze that wiki without a GUI.

Based on [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), implemented as a full **24-command CLI** with optional **Rust native tools** for PDF image extraction and Chrome web clipping.

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Create a project
yarn cli:dev init ./my-wiki --template general

# 3. Configure LLM (interactive)
yarn cli:dev config
yarn cli:dev test

# 4. Add documents and ingest
cp report.pdf ./my-wiki/raw/sources/
yarn cli:dev ingest -p ./my-wiki

# 5. Chat with your knowledge base
yarn cli:dev chat -p ./my-wiki
```

**No API key?** Run the demo (structure checks only):

```bash
./demo/run-demo.sh          # Linux/macOS
./demo/run-demo.ps1         # Windows
```

**Full beginner guide:** [docs/CLI.zh-CN.md](docs/CLI.zh-CN.md) (Chinese, most detailed) · `llm-wiki help`

## Commands

| Category | Commands |
|----------|----------|
| **Project** | `init`, `open`, `open-folder` |
| **Config** | `config`, `test`, `help` |
| **Content** | `pages`, `read`, `write`, `wiki-delete`, `sources`, `source-delete` |
| **Processing** | `ingest`, `chat`, `search`, `graph`, `research`, `enrich`, `caption`, `embed` |
| **Services** | `serve`, `clip`, `sync`, `schedule-import` |
| **Maintenance** | `lint`, `maintenance`, `review` |

```bash
llm-wiki --help
llm-wiki help ingest
llm-wiki help chat
```

## Features

### Core workflow (CLI)

- **Two-step ingest** — LLM analyzes documents, then generates structured wiki pages (`entities/`, `concepts/`, `sources/`)
- **RAG chat** — hybrid search + graph expansion + streaming responses; `/save` to archive answers
- **Hybrid search** — tokenized keyword search + optional LanceDB vector retrieval (RRF fusion)
- **4-signal knowledge graph** — direct links, Adamic-Adar, type affinity; Louvain communities
- **Graph insights** — surprising connections, isolated pages, sparse clusters, bridge nodes
- **Deep research** — Tavily / SerpApi / SearXNG web search → wiki pages
- **Lint & fix** — orphan pages, broken wikilinks, optional LLM semantic analysis
- **Duplicate maintenance** — LLM detects and merges duplicate entity/concept pages
- **Review queue** — human-in-the-loop for broken links, failed ingests, etc.

### Native & integrations

- **`llm-wiki-native`** (Rust) — extract embedded images from PDF/DOCX/PPTX; Chrome clip HTTP server (`:19827`)
- **Local HTTP API** — `llm-wiki serve` on `:19828` (search, files, graph, rescan); compatible with desktop API shape
- **Chrome extension** — run `llm-wiki clip` + browser extension to clip web pages into `raw/sources/`
- **Obsidian compatible** — `wiki/` works as an Obsidian vault

### Configurable

- LLM: OpenAI, Anthropic, Google, Ollama, custom endpoints
- Embedding: any OpenAI-compatible `/embeddings` → LanceDB at `{project}/.llm-wiki/lancedb`
- Vision captioning for images and extracted PDF figures
- HTTP proxy, scheduled folder import, output language

## Installation

### Requirements

- **Bun** or Node.js 18+
- **yarn** (recommended)
- **Rust** (optional, for `llm-wiki-native`)

### Development

```bash
git clone https://github.com/huanghaozi/llm_wiki_cli.git
cd llm_wiki_cli
yarn install

yarn cli:dev --help          # run via Bun
yarn test:cli                # unit & integration tests
yarn test:cli:coverage       # coverage report (≥90% on cli/lib)
```

### Standalone binary

```bash
yarn cli:build      # Linux/macOS → ./llm-wiki
yarn cli:build:win  # Windows → llm-wiki.exe
```

### Rust native tools

```bash
yarn native:build   # builds llm-wiki-native
yarn native:test    # Rust unit tests
```

See [native/README.md](native/README.md) for PDFium setup and cross-compilation (Windows/Linux, x86_64/ARM64).

## Project structure

```
my-wiki/
├── purpose.md
├── wiki/
│   ├── index.md
│   ├── log.md
│   ├── entities/
│   ├── concepts/
│   └── ...
├── raw/sources/          # drop files here, then `llm-wiki ingest`
└── .llm-wiki/
    ├── lancedb/          # vector index (shared with desktop app)
    └── review-queue.json
```

Global CLI config: `~/.llm-wiki-cli/config.json`

## Local HTTP API

```bash
llm-wiki config --api-server
llm-wiki serve -p ./my-wiki
```

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health check |
| `GET /api/v1/projects` | List registered projects |
| `POST /api/v1/projects/{id}/search` | Hybrid search |
| `GET /api/v1/projects/{id}/graph` | Full weighted graph JSON |
| `POST /api/v1/projects/{id}/sources/rescan` | Re-ingest sources |

Auth: `Authorization: Bearer <token>` or `X-LLM-Wiki-Token`.

## Tech stack (CLI)

| Layer | Technology |
|-------|------------|
| Runtime | Bun / Node.js |
| CLI framework | Commander + @inquirer/prompts |
| Vector DB | LanceDB (`@lancedb/lancedb`) |
| Graph | graphology + Louvain |
| Documents | pdf-parse, mammoth |
| Native | Rust (`llm-wiki-native`) — PDFium, clip server |
| Tests | Vitest (84 tests, ≥90% coverage on `cli/lib`) |
| CI | GitHub Actions — CLI tests + multi-platform native builds |

The repo also contains the **Tauri desktop app** source (`src/`, `src-tauri/`) from upstream LLM Wiki. This README focuses on the CLI; the GUI can still be built with `yarn tauri dev`.

## CLI vs desktop GUI

| Capability | CLI | Desktop GUI |
|------------|-----|-------------|
| Ingest, chat, search, graph, lint, research | ✅ | ✅ |
| Vector search (LanceDB) | ✅ | ✅ (same path) |
| Graph insights algorithm | ✅ (text/json) | ✅ (+ Sigma.js UI) |
| WYSIWYG editor | `write` (Markdown) | Milkdown |
| Multi-session chat history | single REPL | persisted sessions |
| Claude Code / Codex CLI transport | — | ✅ |

Projects created by CLI open in the desktop app and vice versa.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/CLI.zh-CN.md](docs/CLI.zh-CN.md) | Complete CLI guide (Chinese, every command explained) |
| [demo/README.md](demo/README.md) | Runnable demo walkthrough |
| [native/README.md](native/README.md) | Native binary build & PDFium |
| `llm-wiki help [topic]` | Built-in topic help |

## Credits

Methodology from **Andrej Karpathy**'s [llm-wiki.md](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

CLI implementation extends the [LLM Wiki desktop project](https://github.com/nashsu/llm_wiki).

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
