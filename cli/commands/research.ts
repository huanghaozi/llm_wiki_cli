import { input, confirm } from "@inquirer/prompts"
import chalk from "chalk"
import ora from "ora"
import { join } from "node:path"
import { writeFileSync, mkdirSync } from "node:fs"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"
import { readTextFile, fileExists } from "../lib/fs-adapter.js"
import { webSearch, hasConfiguredSearch } from "../lib/web-search.js"
import { buildLanguageDirective } from "../lib/output-language.js"
import { appendToLog } from "../lib/project-utils.js"
import { ingestCommand } from "./ingest.js"
import { makeQueryFileName } from "../lib/wiki-filename.js"

interface ResearchOptions {
  topic?: string
  projectPath?: string
  noIngest?: boolean
}

export async function researchCommand(options: ResearchOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()

  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  let topic = options.topic
  if (!topic) {
    topic = await input({ message: "Research topic:" })
  }

  console.log(chalk.bold(`\nDeep Research: ${topic}\n`))

  let webResults: Array<{ title: string; url: string; snippet: string; source: string }> = []

  if (hasConfiguredSearch(config)) {
    const searchSpinner = ora("Searching the web...").start()
    try {
      webResults = await webSearch(topic, config, 8)
      searchSpinner.succeed(`Found ${webResults.length} web result(s)`)
    } catch (err) {
      searchSpinner.warn(`Web search failed: ${err instanceof Error ? err.message : String(err)}`)
      const proceed = await confirm({ message: "Continue with LLM-only research?", default: true })
      if (!proceed) return
    }
  } else {
    console.log(chalk.yellow("Web search not configured — using LLM knowledge only."))
    console.log(chalk.dim("Run 'llm-wiki config --web-search' to enable web search.\n"))
  }

  const spinner = ora("Generating research report...").start()

  const searchContext = webResults.length > 0
    ? webResults.map((r, i) => `[${i + 1}] **${r.title}** (${r.source})\n${r.snippet}\nURL: ${r.url}`).join("\n\n")
    : "(No web results — synthesize from your knowledge.)"

  let wikiIndex = ""
  const indexPath = join(projectPath, "wiki", "index.md")
  if (fileExists(indexPath)) {
    wikiIndex = readTextFile(indexPath)
  }

  const systemPrompt = [
    "You are a research assistant. Synthesize results into a comprehensive wiki page.",
    buildLanguageDirective(config, topic),
    "",
    "## Cross-referencing",
    "- Use [[wikilink]] syntax when mentioning entities that exist in the wiki index.",
    "- Cite web sources using [N] notation.",
    "",
    wikiIndex ? `## Existing Wiki Index\n${wikiIndex.slice(0, 4000)}\n` : "",
  ].join("\n")

  let report = ""
  await streamChat(
    config,
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Research topic: **${topic}**\n\n## Web Search Results\n\n${searchContext}\n\nSynthesize into a wiki page with clear sections.`,
      },
    ],
    {
      onToken: (token) => { report += token },
      onDone: () => {},
      onError: (err) => { throw err },
    },
  )

  spinner.succeed("Report generated")

  const { fileName, date } = makeQueryFileName(`research-${topic}`)
  const queriesDir = join(projectPath, "wiki", "queries")
  if (!fileExists(queriesDir)) mkdirSync(queriesDir, { recursive: true })

  const references = webResults
    .map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.source}`)
    .join("\n")

  const cleaned = report
    .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
    .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
    .trimStart()

  const pageContent = [
    "---",
    `type: query`,
    `title: "Research: ${topic.replace(/"/g, '\\"')}"`,
    `created: ${date}`,
    `origin: deep-research`,
    `tags: [research]`,
    "---",
    "",
    `# Research: ${topic}`,
    "",
    cleaned,
    "",
    references ? "## References\n\n" + references + "\n" : "",
  ].join("\n")

  const savedPath = join(queriesDir, fileName)
  writeFileSync(savedPath, pageContent)
  appendToLog(projectPath, `Deep research saved: ${topic}`)

  console.log(chalk.green(`\nSaved to wiki/queries/${fileName}`))
  console.log("\n" + cleaned)

  if (!options.noIngest) {
    const doIngest = await confirm({
      message: "Auto-ingest research page to extract entities and cross-references?",
      default: true,
    })
    if (doIngest) {
      await ingestCommand({ files: [savedPath], projectPath })
    }
  }
}
