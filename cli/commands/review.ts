import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import { select, confirm, input } from "@inquirer/prompts"
import { loadConfig } from "../lib/config-store.js"
import { chatCompletion } from "../lib/llm-client.js"
import { loadReviews, saveReviews } from "../lib/project-utils.js"
import { researchCommand } from "./research.js"
import { ingestCommand } from "./ingest.js"

interface ReviewOption {
  label: string
  action: string
}

interface ReviewItem {
  id: string
  type: "contradiction" | "duplicate" | "missing-page" | "confirm" | "suggestion"
  title: string
  description: string
  sourcePath?: string
  affectedPages?: string[]
  searchQueries?: string[]
  options: ReviewOption[]
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

interface ReviewOptions {
  projectPath?: string
  resolve?: string
  action?: string
  clear?: boolean
  interactive?: boolean
}

function formatType(type: ReviewItem["type"]): string {
  const labels: Record<ReviewItem["type"], string> = {
    contradiction: "Contradiction",
    duplicate: "Duplicate",
    "missing-page": "Missing Page",
    confirm: "Confirm",
    suggestion: "Suggestion",
  }
  return labels[type] ?? type
}

async function executeAction(
  projectPath: string,
  item: ReviewItem,
  action: string,
): Promise<boolean> {
  const wikiDir = join(projectPath, "wiki")

  if (action === "dismiss") return true

  if (action === "research" || action.startsWith("research:")) {
    const topic = action.includes(":") ? action.slice(action.indexOf(":") + 1) : item.title
    await researchCommand({ topic, projectPath, noIngest: false })
    return true
  }

  if (action === "re-ingest" && item.sourcePath) {
    await ingestCommand({ files: [item.sourcePath], projectPath })
    return true
  }

  if (action === "create-page") {
    const pageName = await input({ message: "New page name:" })
    const config = loadConfig()
    const content = await chatCompletion(config, [
      { role: "system", content: "Generate a wiki page in markdown with frontmatter (type, title, tags)." },
      { role: "user", content: `Create a wiki page about: ${pageName}\n\nContext: ${item.description}` },
    ])
    const entitiesDir = join(wikiDir, "entities")
    if (!existsSync(entitiesDir)) mkdirSync(entitiesDir, { recursive: true })
    const slug = pageName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")
    writeFileSync(join(entitiesDir, `${slug}.md`), content)
    console.log(chalk.green(`Created wiki/entities/${slug}.md`))
    return true
  }

  if (action === "remove-link" && item.affectedPages?.[0]) {
    const pageRel = item.affectedPages[0]
    const pagePath = join(wikiDir, pageRel)
    if (!existsSync(pagePath)) return false
    let content = readFileSync(pagePath, "utf-8")
    const brokenMatch = item.description.match(/\[\[([^\]]+)\]\]/)
    if (brokenMatch) {
      const link = brokenMatch[1]
      content = content.replace(new RegExp(`\\[\\[${escapeRegex(link)}(?:\\|[^\\]]+)?\\]\\]`, "g"), link)
      writeFileSync(pagePath, content)
      console.log(chalk.green(`Removed broken link [[${link}]] from ${pageRel}`))
      return true
    }
  }

  if (action.startsWith("merge:")) {
    console.log(chalk.yellow("Use 'llm-wiki maintenance --merge' for duplicate merges."))
    return true
  }

  console.log(chalk.yellow(`Unknown action: ${action}`))
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function reviewCommand(options: ReviewOptions) {
  const projectPath = options.projectPath || process.cwd()
  const items = loadReviews(projectPath)

  if (options.clear) {
    const resolved = items.filter((i) => i.resolved)
    if (resolved.length === 0) {
      console.log(chalk.yellow("No resolved items to clear."))
      return
    }
    const ok = await confirm({
      message: `Clear ${resolved.length} resolved review item(s)?`,
      default: false,
    })
    if (!ok) return
    saveReviews(projectPath, items.filter((i) => !i.resolved))
    console.log(chalk.green(`Cleared ${resolved.length} resolved item(s).`))
    return
  }

  if (options.resolve) {
    const item = items.find((i) => i.id === options.resolve)
    if (!item) {
      console.log(chalk.red(`Review item not found: ${options.resolve}`))
      return
    }
    if (item.resolved) {
      console.log(chalk.yellow("Item already resolved."))
      return
    }

    let action = options.action
    if (!action) {
      if (item.options.length === 0) {
        action = "dismiss"
      } else {
        action = await select({
          message: `Resolve: ${item.title}`,
          choices: [
            ...item.options.map((o) => ({ name: o.label, value: o.action })),
            { name: "Dismiss", value: "dismiss" },
          ],
        })
      }
    }

    await executeAction(projectPath, item, action!)
    item.resolved = true
    item.resolvedAction = action
    saveReviews(projectPath, items)
    console.log(chalk.green(`Resolved "${item.title}" with action: ${action}`))
    return
  }

  const pending = items.filter((i) => !i.resolved)
  const resolved = items.filter((i) => i.resolved)

  console.log(chalk.bold("\nReview Queue\n"))
  console.log(`Pending: ${chalk.cyan(pending.length)}  Resolved: ${chalk.dim(resolved.length)}\n`)

  if (pending.length === 0) {
    console.log(chalk.green("No pending review items."))
    return
  }

  for (const item of pending) {
    console.log(`${chalk.yellow(`[${formatType(item.type)}]`)} ${chalk.bold(item.title)} ${chalk.dim(`(${item.id})`)}`)
    console.log(`  ${item.description}`)
    if (item.affectedPages?.length) {
      console.log(chalk.dim(`  Pages: ${item.affectedPages.join(", ")}`))
    }
    if (item.searchQueries?.length) {
      console.log(chalk.dim(`  Search: ${item.searchQueries.join(" | ")}`))
    }
    if (item.options.length > 0) {
      console.log(chalk.dim(`  Actions: ${item.options.map((o) => o.label).join(", ")}`))
    }
    console.log()
  }

  if (options.interactive && pending.length > 0) {
    const id = await select({
      message: "Resolve an item:",
      choices: [
        ...pending.map((i) => ({ name: i.title, value: i.id })),
        { name: "(Skip)", value: "" },
      ],
    })
    if (id) {
      await reviewCommand({ ...options, resolve: id, interactive: false })
    }
  } else {
    console.log(chalk.dim("Resolve with: llm-wiki review --resolve <id> [--action <action>]"))
    console.log(chalk.dim("Interactive:  llm-wiki review --interactive"))
    console.log(chalk.dim("Clear resolved: llm-wiki review --clear"))
  }
}
