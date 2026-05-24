# LLM Wiki CLI 完全使用指南

> 本文档面向**从未接触过 LLM Wiki** 的用户。按顺序阅读即可完成从零到熟练的全部操作。
>
> 桌面图形版与 CLI 版共用同一套项目目录与 LanceDB 向量库，可在两者之间切换使用。

---

## 目录

1. [这是什么？](#这是什么)
2. [安装与环境准备](#安装与环境准备)
3. [核心概念（5 分钟读懂）](#核心概念5-分钟读懂)
4. [零基础快速上手](#零基础快速上手)
5. [项目目录结构](#项目目录结构)
6. [全局配置说明](#全局配置说明)
7. [命令详解（按场景）](#命令详解按场景)
8. [典型工作流](#典型工作流)
9. [Chrome 剪藏与 API 服务](#chrome-剪藏与-api-服务)
10. [Rust 原生组件](#rust-原生组件)
11. [与桌面版的差异](#与桌面版的差异)
12. [常见问题 FAQ](#常见问题-faq)
13. [命令速查表](#命令速查表)

---

## 这是什么？

**LLM Wiki** 是一个「用 LLM 帮你整理知识」的个人 Wiki 系统：

- 你把 **PDF、Word、Markdown** 等文档丢进去
- 系统自动 **分析、拆页、加链接**，形成可检索的知识库
- 你可以 **搜索、对话、看图谱**，发现知识之间的关联

**CLI 版**是在终端里完成上述全部操作，适合：

- 服务器 / 远程环境
- 自动化脚本与 CI
- 习惯命令行的开发者
- 不需要图形界面的场景

在终端输入 `llm-wiki help` 可随时查看内置帮助。

---

## 安装与环境准备

### 必需

| 组件 | 用途 | 安装 |
|------|------|------|
| **Bun** 或 Node 18+ | 运行 CLI | [bun.sh](https://bun.sh/) |
| **yarn** | 安装依赖 | `npm i -g yarn` |
| **LLM API** | 导入/对话/研究 | OpenAI、Anthropic、Google、Ollama 等 |

### 可选

| 组件 | 用途 | 安装 |
|------|------|------|
| **llm-wiki-native** | PDF 内嵌图提取、Chrome 剪藏服务 | `yarn native:build` |
| **PDFium** | PDF 图提取运行时库 | 见 [native/README.md](../native/README.md) |

### 安装步骤

```bash
# 1. 克隆仓库并进入目录
cd llm_wiki_cli

# 2. 安装依赖
yarn install

# 3. 验证 CLI
yarn cli:dev --help
# 或
bun run cli/index.ts help
```

### 编译为独立可执行文件（可选）

```bash
yarn cli:build      # Linux/macOS → llm-wiki
yarn cli:build:win  # Windows → llm-wiki.exe
```

---

## 核心概念（5 分钟读懂）

| 概念 | 说明 |
|------|------|
| **项目 (Project)** | 一个文件夹，包含 `wiki/`、`raw/` 等子目录 |
| **Wiki 页** | `wiki/` 下的 Markdown 文件，用 `[[wikilink]]` 互相链接 |
| **来源 (Source)** | `raw/sources/` 下的原始文档，导入前的素材 |
| **导入 (Ingest)** | 用 LLM 把来源文档变成结构化 Wiki 页 |
| **RAG 对话** | 先搜索相关 Wiki 页，再让 LLM 基于这些内容回答 |
| **向量搜索** | 把 Wiki 切块嵌入向量库（LanceDB），支持语义相似搜索 |
| **Review 队列** | 需要人工确认的事项（断链、导入失败等） |

**Wiki 页类型**（由 frontmatter `type:` 字段区分）：

- `entity` — 具体实体（人、公司、项目）
- `concept` — 抽象概念
- `source` — 来源摘要
- `query` — 研究/对话保存的结果
- `media` — 图片说明页

---

## 零基础快速上手

### 方式 A：一键 Demo（无需 API Key）

```powershell
# Windows
.\demo\run-demo.ps1

# Linux/macOS
./demo/run-demo.sh
```

Demo 会创建示例项目并演示 `pages`、`lint`、`search`、`graph`。

### 方式 B：完整流程（需 LLM API）

```bash
# ① 创建项目
llm-wiki init ./my-wiki --template general

# ② 配置 LLM（交互式，按提示输入 API Key 和模型名）
llm-wiki config

# ③ 测试连接是否正常
llm-wiki test

# ④ 放入要导入的文档
cp ~/Documents/report.pdf ./my-wiki/raw/sources/

# ⑤ 导入（会调用 LLM，可能需要几分钟）
llm-wiki ingest -p ./my-wiki

# ⑥ 与知识库对话
llm-wiki chat -p ./my-wiki

# ⑦ 检查 Wiki 健康度
llm-wiki lint -p ./my-wiki
```

**提示**：所有命令都支持 `-p, --project <路径>` 指定项目；也可 `cd` 进入项目目录后省略 `-p`。

---

## 项目目录结构

```
my-wiki/
├── wiki/                      # ★ 知识库主体（Markdown）
│   ├── index.md               # 索引页（导入时自动更新）
│   ├── log.md                 # 变更日志
│   ├── Welcome.md             # 初始化时的欢迎页
│   ├── entities/              # 实体类页面
│   ├── concepts/              # 概念类页面
│   ├── sources/               # 来源摘要
│   ├── queries/               # 研究/对话保存
│   ├── overview/              # 概览
│   └── media/                 # 图片 caption 页
├── raw/
│   ├── sources/               # ★ 放置待导入的原始文件
│   └── extracted/             # Rust 工具提取的内嵌图片
├── purpose.md                 # 项目用途说明
└── .llm-wiki/
    ├── project.json           # 项目元数据
    ├── lancedb/               # 向量索引（与桌面版共用）
    ├── review-queue.json      # 待审核队列
    └── image-caption-cache.json
```

**全局配置**（所有项目共享）：

- Linux/macOS: `~/.llm-wiki-cli/config.json`
- Windows: `%USERPROFILE%\.llm-wiki-cli\config.json`

---

## 全局配置说明

运行 `llm-wiki config` 进入交互式配置，或分项配置：

| 命令 | 配置内容 |
|------|----------|
| `llm-wiki config` | LLM 提供商、模型、API Key、输出语言 |
| `llm-wiki config --web-search` | Tavily / SerpApi / SearXNG / Ollama 联网搜索 |
| `llm-wiki config --embedding` | 向量嵌入模型与 LanceDB 语义搜索 |
| `llm-wiki config --multimodal` | 视觉模型（图片 caption） |
| `llm-wiki config --api-server` | 本地 HTTP API（端口、Token） |
| `llm-wiki config --schedule-import` | 定时扫描文件夹并导入 |
| `llm-wiki config --proxy` | HTTP/HTTPS 代理 |
| `llm-wiki config --show` | 查看当前配置（密钥脱敏） |

### LLM 提供商

| 值 | 说明 |
|----|------|
| `openai` | OpenAI API（GPT-4o 等） |
| `anthropic` | Claude API |
| `google` | Gemini API |
| `ollama` | 本地 Ollama（无需 API Key） |
| `custom` | 自定义 OpenAI 兼容端点 |

### 输出语言

`outputLanguage` 控制 LLM **生成内容**的语言：

- `auto` — 根据输入自动检测（中文输入→中文输出）
- `en` / `zh` / `ja` / `ko` 等 — 强制指定

---

## 命令详解（按场景）

以下每条命令均可用 `llm-wiki help <命令>` 查看专题帮助。

---

### 项目管理

#### `init [路径]` — 创建新项目

```bash
llm-wiki init ./my-wiki
llm-wiki init ./lab -t research
```

| 选项 | 说明 |
|------|------|
| `-t, --template` | 模板：`general`（通用）、`research`（研究）、`reading`（阅读笔记）、`personal`（个人）、`business`（商业） |

创建后会生成完整目录结构、Welcome 页和 purpose.md。

#### `open [路径]` — 打开已有项目

```bash
llm-wiki open ./my-wiki     # 直接打开
llm-wiki open               # 从最近项目列表选择
```

显示 Wiki 页数、来源文件数，并写入最近项目列表。

#### `open-folder [路径]` — 在文件管理器中打开

```bash
llm-wiki open-folder -p ./my-wiki
```

Windows 用资源管理器，macOS 用 Finder，Linux 用 `xdg-open`。

---

### 配置与测试

#### `config` — 配置

见 [全局配置说明](#全局配置说明)。

#### `test` — 测试 LLM 连接

```bash
llm-wiki test
```

发送一条简单消息验证 API Key、模型名、网络是否正常。

---

### Wiki 内容读写

#### `pages` — 列出所有 Wiki 页

```bash
llm-wiki pages -p ./my-wiki
llm-wiki pages -f tree      # 树形
llm-wiki pages -f json      # JSON（供脚本使用）
```

#### `read <page>` — 阅读页面

```bash
llm-wiki read "Alpha Entity" -p ./my-wiki
llm-wiki read entities/alpha-entity -p ./my-wiki -r   # 原始 Markdown
```

支持页面名、相对路径或 slug，模糊匹配。

#### `write` — 写入/编辑页面

```bash
llm-wiki write --page "My Note" --content "# Hello\n\nContent here." -p ./my-wiki
llm-wiki write --page concepts/new-idea --file ./draft.md -p ./my-wiki
```

无 `--page` 时进入交互式输入。

#### `wiki-delete <pages...>` — 删除页面

```bash
llm-wiki wiki-delete orphan-page -p ./my-wiki
llm-wiki wiki-delete entities/old entities/duplicate -y -p ./my-wiki
```

| 选项 | 说明 |
|------|------|
| `-y, --yes` | 跳过确认 |
| 行为 | 删除文件并清理其他页中的 `[[wikilink]]` 引用 |

---

### 来源文件管理

#### `sources` — 列出原始来源

```bash
llm-wiki sources -p ./my-wiki
llm-wiki sources -f json
```

#### `source-delete <files...>` — 删除来源

```bash
llm-wiki source-delete report.pdf -p ./my-wiki
llm-wiki source-delete old/ -k -p ./my-wiki   # 保留关联 wiki 页
```

| 选项 | 说明 |
|------|------|
| `-k, --keep-wiki` | 只删来源，不删生成的 wiki 页 |

---

### 文档导入与增强

#### `ingest [files...]` — 导入文档 ★核心命令

```bash
llm-wiki ingest -p ./my-wiki                    # 导入 raw/sources/ 下全部
llm-wiki ingest ./my-wiki/raw/sources/a.pdf     # 导入指定文件
llm-wiki ingest ./docs/ -p ./my-wiki            # 导入整个目录
```

**支持格式**：`.md`、`.txt`、`.pdf`、`.docx`、`.doc`

**内部流程**：

1. 读取并提取文本（PDF 用 pdf-parse，Word 用 mammoth）
2. 若已安装 `llm-wiki-native`，从 PDF/DOCX/PPTX **提取内嵌图片**到 `raw/extracted/`
3. LLM **分析**文档主题与关键信息
4. LLM **生成** 1–5 个 Wiki 页（entities/concepts/sources）
5. 写入 `wiki/`，更新 `index.md` 和 `log.md`
6. 若已启用 embedding，自动写入向量索引
7. 若未生成任何页，加入 Review 队列

**前置条件**：已运行 `llm-wiki config` 配置 LLM。

#### `enrich` — 智能补全 wikilink

```bash
llm-wiki enrich -p ./my-wiki
llm-wiki enrich --page entities/foo -p ./my-wiki
llm-wiki enrich --dry-run -p ./my-wiki    # 仅预览建议
```

LLM 分析页面内容，建议并添加缺失的 `[[wikilink]]` 交叉引用。

#### `embed` — 重建向量索引

```bash
llm-wiki embed -p ./my-wiki
llm-wiki embed -f -p ./my-wiki    # 强制全量重建
```

**前置条件**：

```bash
llm-wiki config --embedding    # 启用并配置嵌入模型
llm-wiki embed -p ./my-wiki    # 首次索引
```

索引存储在 `{project}/.llm-wiki/lancedb/`，与桌面版共用。

#### `caption [files...]` — 图片说明（多模态）

```bash
llm-wiki config --multimodal   # 先配置视觉模型
llm-wiki caption -p ./my-wiki               # 扫描 raw/sources 中的图片
llm-wiki caption photo.png -p ./my-wiki     # 指定图片
```

- 支持 `.png`、`.jpg`、`.webp`、`.gif`
- 也会从 PDF 等文档中**自动提取**内嵌图再 caption（需 native 工具）
- 结果写入 `wiki/media/`，缓存于 `.llm-wiki/image-caption-cache.json`

---

### 检索与对话

#### `search <query>` — 搜索

```bash
llm-wiki search "机器学习" -p ./my-wiki
llm-wiki search "neural network" -l 10 -p ./my-wiki
```

| 模式 | 条件 | 说明 |
|------|------|------|
| `keyword` | 默认 | 分词 + 标题/正文加权 |
| `hybrid` | 已 embed | 关键词 + 向量 RRF 融合 |
| `vector` | 已 embed 且无关键词命中 | 纯语义搜索 |

#### `chat` — RAG 对话 ★核心命令

```bash
llm-wiki chat -p ./my-wiki
```

进入交互式 REPL：

| 输入 | 作用 |
|------|------|
| 任意问题 | 混合搜索 + 图谱扩展 → LLM 回答 |
| `/save 标题` | 将上次回答保存到 `wiki/queries/` |
| `exit` / `quit` | 退出 |

**RAG 流程**：搜索相关页 → 图谱找关联页 → 按上下文预算组装 → 流式输出。

简单问候（如「你好」）会跳过 RAG，直接回复。

#### `graph` — 知识图谱

```bash
llm-wiki graph -p ./my-wiki
llm-wiki graph --insights -p ./my-wiki
llm-wiki graph --insights --research -p ./my-wiki
llm-wiki graph -f json --insights -p ./my-wiki
```

与桌面版对齐的 **四信号加权图谱**：

1. 直接 wikilink
2. 共同邻居（Adamic-Adar）
3. 类型亲和度（entity↔concept 等）
4. Louvain 社区检测

`--insights` 额外输出：

- **社区聚类**及 cohesion（内聚度）
- **意外连接**（跨社区、跨类型、外围连枢纽）
- **知识缺口**（孤立页、稀疏集群、桥接节点）

`--research` 根据缺口建议 `llm-wiki research` 命令。

#### `research [topic]` — 深度研究

```bash
llm-wiki research "量子计算最新进展" -p ./my-wiki
llm-wiki research "某主题" --no-ingest -p ./my-wiki   # 只研究不写入
```

**流程**：

1. 联网搜索（需 `config --web-search`）
2. LLM 综合搜索结果撰写报告
3. 默认写入 `wiki/queries/` 并更新索引

---

### 质量与维护

#### `lint` — Wiki 健康检查

```bash
llm-wiki lint -p ./my-wiki
llm-wiki lint --semantic -p ./my-wiki    # LLM 语义分析
llm-wiki lint --fix -p ./my-wiki        # 自动修复
```

| 检查项 | 说明 |
|--------|------|
| 孤儿页 | 没有其他页链接指向它 |
| 断链 | `[[wikilink]]` 目标不存在 |
| 无出链 | 页内没有任何 wikilink |
| 语义问题 | `--semantic` 时 LLM 检测矛盾、过时等 |

`--fix` 行为：

- 孤儿页 → 添加到 `index.md`
- 断链 → 加入 Review 队列

#### `maintenance` — 重复页检测与合并

```bash
llm-wiki maintenance -p ./my-wiki           # 扫描重复
llm-wiki maintenance --merge -p ./my-wiki # 交互式合并
```

LLM 识别可能描述同一实体的不同页面（如 `paos` vs `聚磷菌`），`--merge` 可选择保留页并合并内容、重写引用。

#### `review` — 审核队列

```bash
llm-wiki review -p ./my-wiki                    # 列出待办
llm-wiki review -i -p ./my-wiki                 # 交互式处理
llm-wiki review --resolve abc123 --action remove-link -p ./my-wiki
llm-wiki review --clear -p ./my-wiki            # 清除已解决项
```

Review 项来源：导入失败、断链、lint 等。

---

### 自动化与服务

#### `sync` — 监视来源文件夹

```bash
llm-wiki sync -p ./my-wiki
llm-wiki sync --auto-ingest -p ./my-wiki
```

使用 chokidar 监视 `raw/sources/`：

- 新文件 / 修改 → 提示或自动 ingest（`--auto-ingest`）
- 删除 → 可选清理

#### `schedule-import` — 定时导入

```bash
llm-wiki config --schedule-import   # 先配置间隔与路径
llm-wiki schedule-import -p ./my-wiki
llm-wiki schedule-import --once -p ./my-wiki   # 只跑一次
```

按配置间隔扫描文件夹，复制新文件到 `raw/sources/` 并 ingest。

#### `serve` — 本地 HTTP API

```bash
llm-wiki config --api-server   # 配置端口与 Token
llm-wiki serve -p ./my-wiki
llm-wiki serve --port 19828 -p ./my-wiki
```

默认 `http://127.0.0.1:19828`，与桌面版 API 兼容。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/projects` | 列出已注册项目 |
| GET | `/api/v1/projects/{id}/files` | Wiki 文件列表 |
| GET | `/api/v1/projects/{id}/files/content?path=wiki/...` | 读取文件内容 |
| POST | `/api/v1/projects/{id}/search` | `{"query":"..."}` 混合搜索 |
| GET | `/api/v1/projects/{id}/graph` | 完整加权图谱 JSON |
| POST | `/api/v1/projects/{id}/sources/rescan` | 重新 ingest |
| POST | `/api/v1/projects/{id}/chat` | 501（请用终端 `chat`） |

**认证**（若配置了 Token）：

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:19828/api/v1/projects
# 或
curl -H "X-LLM-Wiki-Token: YOUR_TOKEN" ...
```

环境变量 `LLM_WIKI_API_TOKEN` 可覆盖配置文件中的 Token。

#### `clip` — Chrome 剪藏服务

```bash
yarn native:build                              # 先构建原生工具
llm-wiki clip -p ./my-wiki --port 19827
```

启动 HTTP 服务供浏览器扩展调用，将网页内容剪藏到项目。端点：`/status`、`/clip`、`/clips/pending` 等。

---

### 帮助

#### `help [topic]` — 内置帮助

```bash
llm-wiki help              # 入门概览
llm-wiki help ingest       # ingest 专题
llm-wiki help chat         # chat 专题
llm-wiki help graph        # graph 专题
```

---

## 典型工作流

### 研究型项目

```bash
llm-wiki init ./research -t research
llm-wiki config
llm-wiki config --web-search
llm-wiki config --embedding

cp papers/*.pdf ./research/raw/sources/
llm-wiki ingest -p ./research
llm-wiki embed -p ./research

llm-wiki graph --insights --research -p ./research
llm-wiki research "某领域空白" -p ./research
llm-wiki lint --fix -p ./research
llm-wiki chat -p ./research
```

### 阅读笔记

```bash
llm-wiki init ./reading -t reading
llm-wiki config

# 浏览器剪藏 或 手动放文件
llm-wiki clip -p ./reading          # 终端 1：剪藏服务
llm-wiki sync --auto-ingest -p ./reading   # 终端 2：自动导入

llm-wiki enrich -p ./reading
llm-wiki search "第三章" -p ./reading
```

### 团队 API 集成

```bash
llm-wiki config --api-server
export LLM_WIKI_API_TOKEN=secret
llm-wiki serve -p ./team-wiki

curl -X POST http://127.0.0.1:19828/api/v1/projects/current/search \
  -H "Authorization: Bearer secret" \
  -H "Content-Type: application/json" \
  -d '{"query":"项目里程碑"}'
```

---

## Chrome 剪藏与 API 服务

### 剪藏工作流

1. 构建 `llm-wiki-native`：`yarn native:build`
2. 启动剪藏服务：`llm-wiki clip -p <项目>`
3. 安装并配置 LLM Wiki 浏览器扩展
4. 浏览网页时点击扩展 → 内容保存到 `raw/sources/`
5. 运行 `llm-wiki ingest` 或 `sync --auto-ingest` 生成 Wiki 页

### API 与 Cursor / Agent 集成

本地 API 可被 AI Agent、脚本或 IDE 插件调用，实现：

- 程序化搜索 Wiki
- 读取页面内容
- 触发重新导入

Chat 接口尚未在 HTTP 层实现（与桌面 Rust API 一致），请使用 `llm-wiki chat`。

---

## Rust 原生组件

| 子命令 | 功能 |
|--------|------|
| `extract-images` | 从 PDF/DOCX/PPTX 提取内嵌 raster 图 |
| `clip-server` | Chrome 剪藏 HTTP 服务 |

```bash
# 构建
yarn native:build

# 手动提取图片
native/target/release/llm-wiki-native extract-images \
  --input doc.pdf --output-dir ./out --format json

# 测试
yarn native:test
```

**多平台编译**：

| Target | 平台 |
|--------|------|
| `x86_64-pc-windows-msvc` | Windows x64 |
| `aarch64-pc-windows-msvc` | Windows ARM64 |
| `x86_64-unknown-linux-gnu` | Linux x64 |
| `aarch64-unknown-linux-gnu` | Linux ARM64 |

详见 [native/README.md](../native/README.md)。

---

## 与桌面版的差异

| 功能 | CLI | 桌面 GUI |
|------|-----|----------|
| Wikilink 编辑 | `write` 纯 Markdown | WYSIWYG 编辑器 |
| 图谱可视化 | 终端文本 / JSON | Sigma.js 交互图 |
| 向量搜索 | LanceDB（JS） | 同左（共用路径） |
| 图谱算法 | 四信号加权 + insights | 同左 |
| Chrome 剪藏 | `clip` + native | 内置守护进程 |
| 多会话聊天历史 | 单会话 REPL | 多会话持久化 |
| Claude Code / Codex CLI 模式 | 不支持 | 支持 |
| 应用更新检测 | 无 | 有 |
| 界面 i18n | 中文文档 + 英文命令提示 | 多语言 UI |

**CLI 已实现且与桌面对齐的核心能力**：init、ingest、RAG chat、hybrid search、四信号 graph insights、lint/fix、review、research、embed、caption、native 图提取、clip-server、HTTP API、maintenance 去重、enrich、sync、schedule-import。

---

## 常见问题 FAQ

### 安装与运行

**Q: 提示 `No API key configured`**

运行 `llm-wiki config` 配置 API Key；本地 Ollama 选 `ollama` 提供商可无需 Key。

**Q: PowerShell 无法运行脚本**

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Q: `llm-wiki-native` 未找到**

```bash
yarn native:build
# 或将二进制放到 native/target/release/ 或 bin/
```

### 导入与搜索

**Q: ingest 很慢或失败**

- 检查 `llm-wiki test` 是否通过
- 大 PDF 可能超时，尝试拆分文档
- 查看终端错误信息

**Q: 搜索无向量结果**

```bash
llm-wiki config --embedding   # 启用
llm-wiki embed -p <项目>      # 建索引
```

**Q: PDF 内嵌图提取失败**

设置 `PDFIUM_DYNAMIC_LIB_PATH` 指向 PDFium 动态库，见 native/README。

### 项目与配置

**Q: 如何在多个项目间切换**

```bash
llm-wiki open                    # 选最近项目
llm-wiki pages -p /path/to/A    # 或每次指定 -p
```

**Q: 配置存在哪里**

全局：`~/.llm-wiki-cli/config.json`（Windows 为 `%USERPROFILE%\.llm-wiki-cli\`）

**Q: 代理环境无法访问 API**

```bash
llm-wiki config --proxy
# 输入 http://127.0.0.1:7890 等
```

---

## 命令速查表

| 命令 | 一句话说明 |
|------|------------|
| `init` | 创建新项目 |
| `open` | 打开项目 |
| `open-folder` | 文件管理器打开目录 |
| `config` | 配置 LLM / 搜索 / 嵌入等 |
| `test` | 测试 LLM 连接 |
| `pages` | 列出 Wiki 页 |
| `read` | 阅读页面 |
| `write` | 写入/编辑页面 |
| `wiki-delete` | 删除页面 |
| `sources` | 列出来源文件 |
| `source-delete` | 删除来源 |
| `ingest` | 导入文档生成 Wiki |
| `chat` | RAG 对话 |
| `search` | 搜索 Wiki |
| `graph` | 知识图谱分析 |
| `research` | 联网深度研究 |
| `enrich` | 补全 wikilink |
| `caption` | 图片说明 |
| `embed` | 向量索引 |
| `lint` | 健康检查 |
| `maintenance` | 重复页合并 |
| `review` | 审核队列 |
| `sync` | 监视来源文件夹 |
| `schedule-import` | 定时导入 |
| `serve` | HTTP API 服务 |
| `clip` | Chrome 剪藏服务 |
| `help` | 内置帮助 |

---

**更多示例**：见 [demo/README.md](../demo/README.md)

**更新日志**：CLI 版本随 `package.json` 中 `version` 字段（当前 0.4.13）。
