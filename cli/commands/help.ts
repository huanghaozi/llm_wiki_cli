import chalk from "chalk"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

export function helpCommand(topic?: string) {
  const docPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "CLI.zh-CN.md")

  if (topic) {
    printTopicHelp(topic)
    return
  }

  console.log(chalk.bold("\nLLM Wiki CLI — 帮助\n"))
  console.log("完整文档: docs/CLI.zh-CN.md")
  console.log("Demo 教程: demo/README.md\n")

  console.log(chalk.bold("零基础 5 步上手:\n"))
  console.log("  1. llm-wiki init ./my-wiki          # 创建项目")
  console.log("  2. llm-wiki config                  # 配置 LLM")
  console.log("  3. llm-wiki test                    # 测试连接")
  console.log("  4. llm-wiki ingest -p ./my-wiki     # 导入文档")
  console.log("  5. llm-wiki chat -p ./my-wiki       # 对话检索\n")

  console.log(chalk.bold("命令分类:\n"))
  const sections = [
    ["项目", "init, open, open-folder"],
    ["配置", "config, test"],
    ["内容", "pages, read, write, wiki-delete, sources, source-delete"],
    ["处理", "ingest, chat, search, graph, research, enrich, caption, embed"],
    ["服务", "serve, clip, schedule-import, sync"],
    ["维护", "lint, maintenance, review"],
  ]
  for (const [cat, cmds] of sections) {
    console.log(`  ${chalk.cyan(cat)}: ${cmds}`)
  }

  console.log(chalk.dim("\n查看某命令详情: llm-wiki help <command>"))
  console.log(chalk.dim("例如: llm-wiki help ingest\n"))

  try {
    const doc = readFileSync(docPath, "utf-8")
    const quickStart = doc.split("## 快速开始")[1]?.split("---")[0]
    if (quickStart) {
      console.log(chalk.bold("快速开始（摘自文档）:\n"))
      console.log(quickStart.trim())
    }
  } catch {
    // doc optional at runtime
  }
}

function printTopicHelp(topic: string) {
  const guides: Record<string, string[]> = {
    init: [
      "初始化新的 wiki 项目目录。",
      "",
      "用法:",
      "  llm-wiki init [路径] [-t 模板]",
      "",
      "模板: general | research | reading | personal | business",
      "",
      "示例:",
      "  llm-wiki init ./research-wiki -t research",
    ],
    config: [
      "交互式配置 LLM、联网搜索、向量嵌入、多模态等。",
      "",
      "用法:",
      "  llm-wiki config                    # 主配置",
      "  llm-wiki config --show             # 查看当前配置",
      "  llm-wiki config --web-search       # 仅配置联网搜索",
      "  llm-wiki config --embedding         # 仅配置向量搜索",
      "  llm-wiki config --multimodal        # 仅配置图片 caption",
      "  llm-wiki config --api-server        # 本地 API 服务",
      "  llm-wiki config --schedule-import   # 定时导入",
      "  llm-wiki config --proxy             # HTTP 代理",
    ],
    ingest: [
      "将 PDF/DOCX/TXT/MD 等文档导入并生成结构化 wiki 页面（需 LLM）。",
      "",
      "用法:",
      "  llm-wiki ingest [文件...] -p <项目>",
      "",
      "流程:",
      "  1. 读取 raw/sources/ 或指定文件",
      "  2. （可选）Rust 原生工具提取 PDF 内嵌图",
      "  3. LLM 分析文档并生成 wiki/entities、concepts 等页面",
      "  4. 更新 index.md、log.md，可选写入向量索引",
      "",
      "示例:",
      "  cp report.pdf ./my-wiki/raw/sources/",
      "  llm-wiki ingest -p ./my-wiki",
    ],
    chat: [
      "与知识库对话（RAG + 图谱扩展 + 混合搜索）。",
      "",
      "用法:",
      "  llm-wiki chat -p <项目>",
      "",
      "内置命令:",
      "  exit / quit     退出",
      "  /save <标题>    将上次回答保存到 wiki/queries/",
      "",
      "需先运行 llm-wiki config 配置 LLM。",
    ],
    search: [
      "搜索 wiki 页面（关键词 + 可选 LanceDB 向量混合检索）。",
      "",
      "用法:",
      "  llm-wiki search \"查询词\" -p <项目> [-l 20]",
      "",
      "启用向量搜索:",
      "  llm-wiki config --embedding",
      "  llm-wiki embed -p <项目>",
    ],
    graph: [
      "分析 wikilink 知识图谱（四信号加权，与桌面版对齐）。",
      "",
      "用法:",
      "  llm-wiki graph -p <项目>",
      "  llm-wiki graph -p <项目> --insights",
      "  llm-wiki graph -p <项目> --insights --research",
      "  llm-wiki graph -f json --insights",
      "",
      "--insights: 社区检测、意外连接、知识缺口",
      "--research: 根据缺口建议 research 命令",
    ],
    lint: [
      "检查 wiki 健康度：孤儿页、断链、无出链。",
      "",
      "用法:",
      "  llm-wiki lint -p <项目>",
      "  llm-wiki lint -p <项目> --semantic   # LLM 语义分析",
      "  llm-wiki lint -p <项目> --fix        # 自动修复孤儿/断链入队",
    ],
    serve: [
      "启动本地 HTTP API（默认 :19828，与桌面版 API 兼容）。",
      "",
      "用法:",
      "  llm-wiki serve -p <项目> [--port 19828]",
      "",
      "端点:",
      "  GET  /api/v1/health",
      "  GET  /api/v1/projects",
      "  GET  /api/v1/projects/{id}/files",
      "  GET  /api/v1/projects/{id}/files/content?path=wiki/...",
      "  POST /api/v1/projects/{id}/search  { \"query\": \"...\" }",
      "  GET  /api/v1/projects/{id}/graph",
      "  POST /api/v1/projects/{id}/sources/rescan",
      "",
      "认证: Authorization: Bearer <token> 或 X-LLM-Wiki-Token",
    ],
    clip: [
      "启动 Chrome 网页剪藏服务（默认 :19827）。",
      "",
      "用法:",
      "  llm-wiki clip -p <项目> [--port 19827]",
      "",
      "需先构建 llm-wiki-native: yarn native:build",
      "配合浏览器扩展将网页保存到项目 raw/sources/。",
    ],
  }

  const guide = guides[topic.toLowerCase()]
  if (!guide) {
    console.log(chalk.yellow(`暂无 "${topic}" 的专题帮助。运行 llm-wiki ${topic} --help 查看参数。`))
    console.log(chalk.dim("完整文档: docs/CLI.zh-CN.md"))
    return
  }

  console.log(chalk.bold(`\n${topic} — 帮助\n`))
  for (const line of guide) console.log(line)
  console.log(chalk.dim("\n完整文档: docs/CLI.zh-CN.md"))
}
