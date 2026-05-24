import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"
import {
  runStructuralLint,
  applyOrphanFix,
  type LintResult,
} from "../lib/lint-engine.js"
import {
  listWikiMdFiles,
} from "../lib/wiki-files.js"
import { addReviewItem } from "../lib/project-utils.js"

interface LintOptions {
  projectPath?: string
  semantic?: boolean
  fix?: boolean
}

const LINT_BLOCK_REGEX =
  /---LINT:\s*([^\n|]+?)\s*\|\s*([^\n|]+?)\s*\|\s*([^\n-]+?)\s*---\n([\s\S]*?)---END LINT---/g

async function runSemanticLint(wikiDir: string): Promise<LintResult[]> {
  const config = loadConfig()
  const files = listWikiMdFiles(wikiDir).filter((f) => basename(f.path) !== "log.md")

  const summaries: string[] = []
  for (const f of files) {
    try {
      const content = readFileSync(f.path, "utf-8")
      const preview = content.slice(0, 500) + (content.length > 500 ? "..." : "")
      summaries.push(`### ${f.relPath}\n${preview}`)
    } catch {
      // skip
    }
  }

  if (summaries.length === 0) return []

  const prompt = [
    "You are a wiki quality analyst. Review the following wiki page summaries and identify issues.",
    "",
    "For each issue, output exactly this format:",
    "",
    "---LINT: type | severity | Short title---",
    "Description of the issue.",
    "PAGES: page1.md, page2.md",
    "---END LINT---",
    "",
    "Types: contradiction, stale, missing-page, suggestion",
    "Severities: warning, info",
    "",
    "Only report genuine issues. Output ONLY the ---LINT--- blocks.",
    "",
    "## Wiki Pages",
    "",
    summaries.join("\n\n"),
  ].join("\n")

  let raw = ""
  let hadError = false

  await streamChat(
    config,
    [{ role: "user", content: prompt }],
    {
      onToken: (token) => { raw += token },
      onDone: () => {},
      onError: () => { hadError = true },
    },
  )

  if (hadError) return []

  const results: LintResult[] = []
  for (const match of raw.matchAll(LINT_BLOCK_REGEX)) {
    const rawType = match[1].trim().toLowerCase()
    const severity = match[2].trim().toLowerCase()
    const title = match[3].trim()
    const body = match[4].trim()
    const pagesMatch = body.match(/^PAGES:\s*(.+)$/m)
    const affectedPages = pagesMatch
      ? pagesMatch[1].split(",").map((p) => p.trim())
      : undefined
    const detail = body.replace(/^PAGES:.*$/m, "").trim()

    results.push({
      type: "semantic",
      severity: severity === "warning" ? "warning" : "info",
      page: title,
      detail: `[${rawType}] ${detail}`,
      affectedPages,
    })
  }

  return results
}

async function applyFixes(projectPath: string, results: LintResult[]): Promise<number> {
  let fixed = 0
  const wikiDir = join(projectPath, "wiki")
  const indexPath = join(wikiDir, "index.md")

  for (const result of results) {
    if (result.type === "orphan") {
      let indexContent = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "# Wiki Index\n"
      const updated = applyOrphanFix(indexContent, result.page)
      if (updated !== indexContent) {
        writeFileSync(indexPath, updated)
        fixed++
        console.log(chalk.green(`  Fixed orphan: added ${result.page} to index.md`))
      }
    } else if (result.type === "broken-link") {
      addReviewItem(projectPath, {
        type: "confirm",
        title: `Broken link in ${result.page}`,
        description: result.detail,
        affectedPages: [result.page],
        options: [
          { label: "Remove broken link", action: "remove-link" },
          { label: "Create missing page", action: "create-page" },
        ],
      })
      fixed++
      console.log(chalk.yellow(`  Queued broken link for review: ${result.page}`))
    }
  }

  return fixed
}

function printResults(results: LintResult[], semantic: boolean) {
  const orphans = results.filter((r) => r.type === "orphan")
  const broken = results.filter((r) => r.type === "broken-link")
  const noOutlinks = results.filter((r) => r.type === "no-outlinks")
  const semanticResults = results.filter((r) => r.type === "semantic")

  console.log(chalk.bold("\nWiki Health Report\n"))
  if (!semantic) {
    console.log(`Orphaned: ${orphans.length > 0 ? chalk.yellow(orphans.length) : chalk.green(0)}`)
    console.log(`Broken links: ${broken.length > 0 ? chalk.red(broken.length) : chalk.green(0)}`)
    console.log(`No outlinks: ${noOutlinks.length > 0 ? chalk.yellow(noOutlinks.length) : chalk.green(0)}`)
  }
  if (semanticResults.length > 0) {
    console.log(`Semantic issues: ${semanticResults.length > 0 ? chalk.yellow(semanticResults.length) : chalk.green(0)}`)
  }
  console.log()

  if (broken.length > 0) {
    console.log(chalk.red.bold("Broken Links:\n"))
    for (const r of broken) {
      console.log(`  ${chalk.yellow(r.page)}`)
      console.log(`    ${r.detail}`)
    }
    console.log()
  }

  if (orphans.length > 0) {
    console.log(chalk.yellow.bold("Orphaned Pages:\n"))
    for (const r of orphans) {
      console.log(`  ${chalk.dim(r.page)}`)
    }
    console.log()
  }

  if (noOutlinks.length > 0) {
    console.log(chalk.yellow.bold("Pages Without Outlinks:\n"))
    for (const r of noOutlinks) {
      console.log(`  ${chalk.dim(r.page)}`)
    }
    console.log()
  }

  if (semanticResults.length > 0) {
    console.log(chalk.magenta.bold("Semantic Issues:\n"))
    for (const r of semanticResults) {
      console.log(`  ${chalk.bold(r.page)} ${chalk.dim(`(${r.severity})`)}`)
      console.log(`    ${r.detail}`)
      if (r.affectedPages?.length) {
        console.log(chalk.dim(`    Pages: ${r.affectedPages.join(", ")}`))
      }
    }
    console.log()
  }

  if (results.length === 0) {
    console.log(chalk.green("All clear! No issues found."))
  }
}

export async function lintCommand(options: LintOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found. Run 'llm-wiki init' first."))
    return
  }

  const spinner = ora("Analyzing wiki structure...").start()
  const structural = options.semantic ? [] : runStructuralLint(wikiDir)
  spinner.stop()

  let semantic: LintResult[] = []
  if (options.semantic) {
    const config = loadConfig()
    if (!config.apiKey && config.provider !== "ollama") {
      console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
      return
    }
    const semSpinner = ora("Running semantic analysis with LLM...").start()
    semantic = await runSemanticLint(wikiDir)
    semSpinner.stop()
  }

  const files = listWikiMdFiles(wikiDir).filter(
    (f) => basename(f.path) !== "index.md" && basename(f.path) !== "log.md",
  )
  console.log(`Total pages: ${chalk.cyan(files.length)}`)

  const allResults = [...structural, ...semantic]
  printResults(allResults, !!options.semantic)

  if (options.fix && structural.length > 0) {
    const fixable = structural.filter((r) => r.type === "orphan" || r.type === "broken-link")
    if (fixable.length === 0) {
      console.log(chalk.dim("No auto-fixable structural issues."))
      return
    }
    const ok = await confirm({
      message: `Apply auto-fixes for ${fixable.length} issue(s)? (orphans → index.md, broken links → review queue)`,
      default: true,
    })
    if (ok) {
      const count = await applyFixes(projectPath, fixable)
      console.log(chalk.green(`\nApplied ${count} fix(es). Run 'llm-wiki review' to handle broken links.`))
    }
  }
}
