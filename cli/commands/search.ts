import chalk from "chalk"
import { join } from "node:path"
import { fileExists } from "../lib/fs-adapter.js"
import { hybridSearchWikiPages } from "../lib/search-engine.js"
import { loadConfig } from "../lib/config-store.js"

interface SearchOptions {
  query: string
  projectPath?: string
  limit?: number
}

export async function searchCommand(options: SearchOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!fileExists(wikiDir)) {
    console.log(chalk.red("No wiki found. Run 'llm-wiki init' first."))
    return
  }

  const config = loadConfig()
  const { mode, results } = await hybridSearchWikiPages(
    projectPath,
    options.query,
    options.limit ?? 20,
    config.embedding,
  )

  if (results.length === 0) {
    console.log(chalk.yellow(`No results found for "${options.query}"`))
    return
  }

  console.log(chalk.bold(`\n${results.length} result(s) for "${options.query}" [${mode}]:\n`))

  for (const result of results) {
    const matchBadge = result.titleMatch ? chalk.green(" [title]") : ""
    const vectorBadge = result.vectorScore ? chalk.magenta(` [vec:${result.vectorScore.toFixed(2)}]`) : ""
    console.log(`${chalk.cyan(result.title)}${matchBadge}${vectorBadge}`)
    console.log(chalk.dim(`  ${result.relPath}  (score: ${result.score.toFixed(1)})`))
    console.log(chalk.dim(`  ${result.snippet}...`))
    console.log()
  }
}
