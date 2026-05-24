import { input } from "@inquirer/prompts"
import chalk from "chalk"
import { join } from "node:path"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"
import { readTextFile, fileExists } from "../lib/fs-adapter.js"
import { hybridSearchWikiPages, tokenizeQuery } from "../lib/search-engine.js"
import { buildRetrievalGraph, getRelatedNodes } from "../lib/retrieval-graph.js"
import { computeContextBudget } from "../lib/context-budget.js"
import { isGreeting } from "../lib/greeting-detector.js"
import { buildLanguageDirective, buildLanguageReminder } from "../lib/output-language.js"
import { appendToLog } from "../lib/project-utils.js"

interface ChatOptions {
  projectPath?: string
}

export async function chatCommand(options: ChatOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()

  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  console.log(chalk.bold("\nLLM Wiki Chat\n"))
  console.log(chalk.dim("Ask questions about your knowledge base. Type 'exit' to quit, '/save <title>' to save answer to wiki.\n"))

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []
  let lastResponse = ""

  while (true) {
    const userInput = await input({ message: chalk.cyan("You:") })

    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      console.log(chalk.dim("\nGoodbye!"))
      break
    }

    if (userInput.startsWith("/save ")) {
      const title = userInput.slice(6).trim()
      if (!title) {
        console.log(chalk.yellow("Usage: /save <page title>"))
        continue
      }
      if (!lastResponse) {
        console.log(chalk.yellow("No response to save yet."))
        continue
      }
      await saveToWiki(projectPath, title, lastResponse)
      console.log(chalk.green(`Saved to wiki/queries/${slugify(title)}.md`))
      continue
    }

    const systemMessages = await buildSystemContext(projectPath, config, userInput)
    const turnMessages = [
      ...systemMessages,
      ...messages.filter((m) => m.role !== "system"),
      { role: "user" as const, content: `${buildLanguageReminder(config, userInput)}\n\n${userInput}` },
    ]

    messages.push({ role: "user", content: userInput })
    process.stdout.write(chalk.yellow("AI: "))

    let response = ""
    await streamChat(config, turnMessages, {
      onToken: (token) => {
        process.stdout.write(token)
        response += token
      },
      onDone: () => console.log("\n"),
      onError: (error) => console.log(chalk.red(`\nError: ${error.message}`)),
    })

    lastResponse = response
    messages.push({ role: "assistant", content: response })
  }
}

async function buildSystemContext(
  projectPath: string,
  config: ReturnType<typeof loadConfig>,
  query: string,
): Promise<Array<{ role: "system"; content: string }>> {
  if (isGreeting(query)) {
    return [{
      role: "system",
      content: "The user sent a casual greeting — reply briefly and naturally in one or two sentences.",
    }]
  }

  const wikiDir = join(projectPath, "wiki")
  if (!fileExists(wikiDir)) {
    return [{ role: "system", content: "You are a helpful assistant." }]
  }

  const { indexBudget, pageBudget, maxPageSize } = computeContextBudget(config.maxContextSize)

  const rawIndex = fileExists(join(wikiDir, "index.md"))
    ? readTextFile(join(wikiDir, "index.md"))
    : ""
  const purpose = fileExists(join(projectPath, "purpose.md"))
    ? readTextFile(join(projectPath, "purpose.md"))
    : ""

  const { results: searchResults } = await hybridSearchWikiPages(
    projectPath,
    query,
    10,
    config.embedding,
  )
  const graph = buildRetrievalGraph(projectPath)

  let index = rawIndex
  if (rawIndex.length > indexBudget) {
    const tokens = tokenizeQuery(query)
    const lines = rawIndex.split("\n")
    const kept: string[] = []
    let size = 0
    for (const line of lines) {
      const relevant = line.startsWith("##") || tokens.some((t) => line.toLowerCase().includes(t))
      if (relevant && size + line.length + 1 <= indexBudget) {
        kept.push(line)
        size += line.length + 1
      }
    }
    index = kept.join("\n")
    if (index.length < rawIndex.length) index += "\n\n[...index trimmed...]"
  }

  const searchHitPaths = new Set(searchResults.map((r) => r.path))
  const expandedIds = new Set<string>()
  const graphExpansions: Array<{ title: string; path: string; relevance: number }> = []

  for (const result of searchResults) {
    const nodeId = result.relPath.replace(/\.md$/, "")
    for (const { node, relevance } of getRelatedNodes(nodeId, graph, 3)) {
      if (relevance < 2.0 || searchHitPaths.has(node.path) || expandedIds.has(node.id)) continue
      expandedIds.add(node.id)
      graphExpansions.push({ title: node.title, path: node.path, relevance })
    }
  }
  graphExpansions.sort((a, b) => b.relevance - a.relevance)

  let usedChars = 0
  type PageEntry = { title: string; path: string; content: string }
  const relevantPages: PageEntry[] = []

  const tryAddPage = (title: string, filePath: string): boolean => {
    if (usedChars >= pageBudget) return false
    try {
      const raw = readFileSync(filePath, "utf-8")
      const truncated = raw.length > maxPageSize ? raw.slice(0, maxPageSize) + "\n\n[...truncated...]" : raw
      if (usedChars + truncated.length > pageBudget) return false
      usedChars += truncated.length
      relevantPages.push({ title, path: filePath, content: truncated })
      return true
    } catch {
      return false
    }
  }

  for (const r of searchResults.filter((r) => r.titleMatch)) tryAddPage(r.title, r.path)
  for (const r of searchResults.filter((r) => !r.titleMatch)) tryAddPage(r.title, r.path)
  for (const exp of graphExpansions) tryAddPage(exp.title, exp.path)

  if (relevantPages.length === 0) {
    const overview = join(wikiDir, "overview.md")
    if (fileExists(overview)) tryAddPage("Overview", overview)
  }

  const pagesContext = relevantPages.length > 0
    ? relevantPages.map((p, i) => `### [${i + 1}] ${p.title}\nPath: ${p.path}\n\n${p.content}`).join("\n\n---\n\n")
    : "(No wiki pages found)"

  const pageList = relevantPages.map((p, i) => `[${i + 1}] ${p.title}`).join("\n")

  return [{
    role: "system",
    content: [
      "You are a knowledgeable wiki assistant. Answer based on the wiki content below.",
      buildLanguageDirective(config, query),
      "",
      "## Rules",
      "- Cite pages using [N] notation matching the numbered list.",
      "- Use [[wikilink]] syntax when referencing wiki pages.",
      "- If the answer is not in the knowledge base, say so clearly.",
      "",
      purpose ? `## Project Purpose\n${purpose.slice(0, 1500)}\n` : "",
      index ? `## Wiki Index\n${index}\n` : "",
      `## Retrieved Pages\n${pageList}\n`,
      pagesContext,
    ].filter(Boolean).join("\n"),
  }]
}

function slugify(title: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)
  return `query-${slug}-${date}`
}

async function saveToWiki(projectPath: string, title: string, content: string) {
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${slugify(title)}.md`
  const queriesDir = join(projectPath, "wiki", "queries")
  if (!fileExists(queriesDir)) mkdirSync(queriesDir, { recursive: true })

  const pageContent = [
    "---",
    `type: query`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `created: ${date}`,
    `origin: chat`,
    `tags: [chat]`,
    "---",
    "",
    `# ${title}`,
    "",
    content.trim(),
    "",
  ].join("\n")

  writeFileSync(join(queriesDir, filename), pageContent)
  appendToLog(projectPath, `Saved chat answer: ${title}`)
}
