#!/usr/bin/env bun
import { Command } from "commander"
import chalk from "chalk"
import { applyProxyFromConfig } from "./lib/proxy-config.js"
import { initCommand } from "./commands/init.js"
import { configCommand, showConfig } from "./commands/config.js"
import { ingestCommand } from "./commands/ingest.js"
import { chatCommand } from "./commands/chat.js"
import { searchCommand } from "./commands/search.js"
import { graphCommand } from "./commands/graph.js"
import { researchCommand } from "./commands/research.js"
import { syncCommand } from "./commands/sync.js"
import { lintCommand } from "./commands/lint.js"
import { pagesCommand } from "./commands/pages.js"
import { readCommand } from "./commands/read.js"
import { wikiDeleteCommand } from "./commands/wiki-delete.js"
import { sourcesCommand } from "./commands/sources.js"
import { sourceDeleteCommand } from "./commands/source-delete.js"
import { testCommand } from "./commands/test.js"
import { enrichCommand } from "./commands/enrich.js"
import { openCommand } from "./commands/open.js"
import { openFolderCommand } from "./commands/open-folder.js"
import { reviewCommand } from "./commands/review.js"
import { writeCommand } from "./commands/write.js"
import { maintenanceCommand } from "./commands/maintenance.js"
import { embedCommand } from "./commands/embed.js"
import { serveCommand } from "./commands/serve.js"
import { scheduleImportCommand } from "./commands/schedule-import.js"
import { captionCommand } from "./commands/caption.js"
import { clipCommand } from "./commands/clip.js"
import { helpCommand } from "./commands/help.js"

applyProxyFromConfig()

const program = new Command()

program
  .name("llm-wiki")
  .description("LLM Wiki CLI — 个人知识库命令行工具（与桌面版功能对齐）")
  .version("0.4.13")
  .addHelpText("after", `
示例:
  $ llm-wiki init ./my-wiki -t research
  $ llm-wiki config && llm-wiki test
  $ llm-wiki ingest -p ./my-wiki
  $ llm-wiki chat -p ./my-wiki

完整中文文档: docs/CLI.zh-CN.md
专题帮助: llm-wiki help <command>
`)

// Project Management
program
  .command("init [path]")
  .description("Initialize a new wiki project")
  .option("-t, --template <template>", "Project template (general|research|reading|personal|business)")
  .action((path, options) => initCommand(path, options.template))

program
  .command("open [path]")
  .description("打开已有项目（显示摘要并加入最近列表）")
  .action((path) => openCommand({ path }))

program
  .command("open-folder [path]")
  .description("在文件管理器中打开项目目录")
  .action((path) => openFolderCommand({ path }))

program
  .command("help [topic]")
  .description("显示 CLI 帮助（零基础入门与命令详解）")
  .action((topic) => helpCommand(topic))

// Configuration
program
  .command("config")
  .description("配置 LLM、搜索、嵌入、API 等")
  .option("-s, --show", "显示当前配置")
  .option("--web-search", "仅配置联网搜索")
  .option("--embedding", "仅配置向量嵌入")
  .option("--multimodal", "仅配置图片 caption")
  .option("--api-server", "配置本地 HTTP API 服务")
  .option("--schedule-import", "配置定时导入")
  .option("--proxy", "配置 HTTP 代理")
  .action((options) => {
    if (options.show) {
      showConfig()
    } else {
      configCommand({
        webSearch: options.webSearch,
        embedding: options.embedding,
        multimodal: options.multimodal,
        apiServer: options.apiServer,
        scheduleImport: options.scheduleImport,
        proxy: options.proxy,
      })
    }
  })

program
  .command("test")
  .description("Test LLM connection and functionality")
  .action(() => testCommand({}))

// Wiki Content
program
  .command("pages")
  .description("List all wiki pages")
  .option("-p, --project <path>", "Project directory")
  .option("-f, --format <format>", "Output format (list|tree|json)", "list")
  .action((options) => pagesCommand({ projectPath: options.project, format: options.format }))

program
  .command("read <page>")
  .description("Read a wiki page")
  .option("-p, --project <path>", "Project directory")
  .option("-r, --raw", "Output raw markdown (no formatting)")
  .action((page, options) => readCommand({ page, projectPath: options.project, raw: options.raw }))

program
  .command("write")
  .description("Write or edit a wiki page")
  .option("-p, --project <path>", "Project directory")
  .option("--page <page>", "Page path or name")
  .option("--content <content>", "Content to write")
  .option("--file <file>", "Read content from file")
  .action((options) => writeCommand({
    projectPath: options.project,
    page: options.page,
    content: options.content,
    file: options.file,
  }))

program
  .command("wiki-delete <pages...>")
  .description("Delete wiki pages and clean up references")
  .option("-p, --project <path>", "Project directory")
  .option("-y, --yes", "Skip confirmation")
  .action((pages, options) => wikiDeleteCommand({ pages, projectPath: options.project, yes: options.yes }))

program
  .command("sources")
  .description("List all source files")
  .option("-p, --project <path>", "Project directory")
  .option("-f, --format <format>", "Output format (list|json)", "list")
  .action((options) => sourcesCommand({ projectPath: options.project, format: options.format }))

program
  .command("source-delete <files...>")
  .description("Delete source files and optionally clean up wiki")
  .option("-p, --project <path>", "Project directory")
  .option("-y, --yes", "Skip confirmation")
  .option("-k, --keep-wiki", "Keep associated wiki pages")
  .action((files, options) => sourceDeleteCommand({ files, projectPath: options.project, yes: options.yes, keepWiki: options.keepWiki }))

// Processing
program
  .command("ingest [files...]")
  .description("Ingest documents into wiki")
  .option("-p, --project <path>", "Project directory")
  .action((files, options) => ingestCommand({ files, projectPath: options.project }))

program
  .command("chat")
  .description("Interactive chat with your knowledge base (RAG + graph expansion)")
  .option("-p, --project <path>", "Project directory")
  .action((options) => chatCommand({ projectPath: options.project }))

program
  .command("search <query>")
  .description("Search wiki pages (tokenized keyword search)")
  .option("-p, --project <path>", "Project directory")
  .option("-l, --limit <n>", "Max results", "20")
  .action((query, options) => searchCommand({ query, projectPath: options.project, limit: Number(options.limit) }))

program
  .command("graph")
  .description("知识图谱分析（四信号加权，与桌面版对齐）")
  .option("-p, --project <path>", "项目目录")
  .option("-f, --format <format>", "输出格式 (text|json)", "text")
  .option("--insights", "社区检测、意外连接、知识缺口")
  .option("--research", "根据缺口建议 research 命令（需配合 --insights）")
  .action((options) => graphCommand({
    projectPath: options.project,
    format: options.format,
    insights: options.insights,
    research: options.research,
  }))

program
  .command("research [topic]")
  .description("Deep research on a topic (web search + save to wiki)")
  .option("-p, --project <path>", "Project directory")
  .option("--no-ingest", "Skip auto-ingest after saving")
  .action((topic, options) => researchCommand({
    topic,
    projectPath: options.project,
    noIngest: options.ingest === false,
  }))

program
  .command("enrich")
  .description("Suggest and add missing wikilinks using LLM")
  .option("-p, --project <path>", "Project directory")
  .option("--page <page>", "Specific page to enrich")
  .option("--dry-run", "Show suggestions without applying")
  .action((options) => enrichCommand({ projectPath: options.project, page: options.page, dryRun: options.dryRun }))

program
  .command("clip")
  .description("Start Chrome clip server (requires llm-wiki-native binary)")
  .option("-p, --project <path>", "Project directory")
  .option("--port <port>", "Port number", "19827")
  .action((options) => clipCommand({ projectPath: options.project, port: Number(options.port) }))

program
  .command("caption [files...]")
  .description("Generate vision captions for images and save to wiki/media")
  .option("-p, --project <path>", "Project directory")
  .action((files, options) => captionCommand({ files, projectPath: options.project }))

program
  .command("embed")
  .description("Index wiki pages for vector search (LanceDB)")
  .option("-p, --project <path>", "Project directory")
  .option("-f, --force", "Re-index all pages")
  .action((options) => embedCommand({ projectPath: options.project, force: options.force }))

program
  .command("serve")
  .description("Start local HTTP API server (compatible with desktop API on :19828)")
  .option("-p, --project <path>", "Project directory")
  .option("--port <port>", "Port number", "19828")
  .action((options) => serveCommand({ projectPath: options.project, port: Number(options.port) }))

program
  .command("schedule-import")
  .description("Periodically scan and import files from a watch folder")
  .option("-p, --project <path>", "Project directory")
  .option("--once", "Run one scan then exit")
  .action((options) => scheduleImportCommand({ projectPath: options.project, once: options.once }))

// Maintenance
program
  .command("lint")
  .description("Check wiki health (orphans, broken links, missing outlinks)")
  .option("-p, --project <path>", "Project directory")
  .option("--semantic", "Run LLM-powered semantic analysis")
  .option("--fix", "Auto-fix orphans (add to index) and queue broken links for review")
  .action((options) => lintCommand({ projectPath: options.project, semantic: options.semantic, fix: options.fix }))

program
  .command("maintenance")
  .description("Detect and merge duplicate entity/concept pages")
  .option("-p, --project <path>", "Project directory")
  .option("--merge", "Interactively merge a detected duplicate group")
  .action((options) => maintenanceCommand({ projectPath: options.project, merge: options.merge }))

program
  .command("sync")
  .description("Watch source folder for changes")
  .option("-p, --project <path>", "Project directory")
  .option("--auto-ingest", "Automatically ingest new/changed files and clean up deletions")
  .action((options) => syncCommand({ projectPath: options.project, autoIngest: options.autoIngest }))

program
  .command("review")
  .description("Manage review queue (list, resolve, clear)")
  .option("-p, --project <path>", "Project directory")
  .option("--resolve <id>", "Resolve a review item by ID")
  .option("--action <action>", "Action when resolving")
  .option("--clear", "Clear resolved review items")
  .option("-i, --interactive", "Interactively resolve pending items")
  .action((options) => reviewCommand({
    projectPath: options.project,
    resolve: options.resolve,
    action: options.action,
    clear: options.clear,
    interactive: options.interactive,
  }))

// Error handling
program.on("command:*", () => {
  console.error(chalk.red(`Unknown command: ${program.args.join(" ")}`))
  console.log(chalk.dim("Run 'llm-wiki --help' for available commands."))
  process.exit(1)
})

program.parse()
