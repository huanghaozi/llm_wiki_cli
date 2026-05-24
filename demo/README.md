# LLM Wiki CLI Demo

> **完整使用指南**（零基础入门 + 每条命令详解）：[`docs/CLI.zh-CN.md`](../docs/CLI.zh-CN.md)
>
> 终端内置帮助：`llm-wiki help` 或 `llm-wiki help ingest`

本目录包含可重复运行的 CLI 演示。

## 前置条件

- [Bun](https://bun.sh/) 或 Node.js 18+
- 已执行 `yarn install`（在仓库根目录）

## 运行 Demo（无需 LLM API）

### Windows

```powershell
.\demo\run-demo.ps1
```

### Linux / macOS

```bash
chmod +x demo/run-demo.sh
./demo/run-demo.sh
```

Demo 会：

1. 在 `demo/project/` 初始化示例 wiki
2. 列出页面
3. 运行结构 lint
4. 关键词搜索
5. 输出链接图谱

## 完整 LLM 流程（需 API Key）

```bash
# 配置 LLM
bun run cli/index.ts config

# 放入示例文档
mkdir -p demo/project/raw/sources
cp your-document.pdf demo/project/raw/sources/

# 导入（会调用 LLM 生成 wiki 页）
bun run cli/index.ts ingest -p demo/project

# 语义搜索（需先 config --embedding 并 embed）
bun run cli/index.ts embed -p demo/project
bun run cli/index.ts search "your query" -p demo/project

# RAG 对话
bun run cli/index.ts chat -p demo/project
```

## 原生组件 Demo

```bash
# 构建 llm-wiki-native
yarn native:build

# 从 PDF 提取内嵌图
native/target/release/llm-wiki-native.exe extract-images ^
  --input demo/project/raw/sources/sample.pdf ^
  --output-dir demo/project/raw/extracted/sample ^
  --format json

# 启动剪藏服务
bun run cli/index.ts clip -p demo/project --port 19827
```

## 清理

```bash
rm -rf demo/project
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force demo\project
```
