import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"

interface EnrichOptions {
  projectPath?: string
  page?: string
  dryRun?: boolean
}

function listMdFiles(dir: string): Array<{ path: string; relPath: string; content: string }> {
  const files: Array<{ path: string; relPath: string; content: string }> = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const subFiles = listMdFiles(fullPath)
      for (const sf of subFiles) {
        files.push({
          path: sf.path,
          relPath: `${entry.name}/${sf.relPath}`,
          content: sf.content,
        })
      }
    } else if (entry.name.endsWith(".md")) {
      try {
        const content = readFileSync(fullPath, "utf-8")
        files.push({ path: fullPath, relPath: entry.name, content })
      } catch {
        // skip
      }
    }
  }
  return files
}

function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g
  let match
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

export async function enrichCommand(options: EnrichOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found."))
    return
  }

  const spinner = ora("Loading wiki pages...").start()
  const files = listMdFiles(wikiDir)

  if (files.length === 0) {
    spinner.fail("No wiki pages found.")
    return
  }

  // Build page list
  const pageList = files.map((f) => {
    const title = f.content.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() || f.relPath.replace(/\.md$/, "")
    return { path: f.path, relPath: f.relPath, title, content: f.content }
  })

  const existingSlugs = new Set(pageList.map((p) => p.relPath.replace(/\.md$/, "").toLowerCase()))

  let targetPages = pageList
  if (options.page) {
    targetPages = pageList.filter((p) =>
      p.relPath.toLowerCase().includes(options.page!.toLowerCase()) ||
      p.title.toLowerCase().includes(options.page!.toLowerCase())
    )
    if (targetPages.length === 0) {
      spinner.fail(`Page not found: ${options.page}`)
      return
    }
  }

  spinner.text = `Analyzing ${targetPages.length} page(s) for enrichment opportunities...`

  for (const page of targetPages) {
    const existingLinks = extractWikilinks(page.content)
    const linkSlugs = new Set(existingLinks.map((l) => l.toLowerCase()))

    // Build context: all other pages
    const otherPages = pageList
      .filter((p) => p.path !== page.path)
      .map((p) => `- ${p.title} (${p.relPath})`)
      .slice(0, 50)
      .join("\n")

    const prompt = `You are a wiki curator. Analyze this wiki page and suggest missing wikilinks.

Page: ${page.title}
Content:
${page.content.slice(0, 3000)}

Other pages in the wiki:
${otherPages}

Current wikilinks: ${existingLinks.join(", ") || "none"}

Suggest 3-5 missing wikilinks that would improve cross-referencing. Only suggest links to pages that actually exist in the wiki (listed above).

Output ONLY as a JSON array:
[
  { "target": "page-slug", "reason": "why this link makes sense" }
]`

    let rawResponse = ""
    await streamChat(
      config,
      [
        { role: "system", content: "You are a wiki enrichment assistant. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      {
        onToken: (token) => { rawResponse += token },
        onDone: () => {},
        onError: (err) => {
          spinner.fail(`LLM error: ${err.message}`)
        },
      },
    )

    // Extract JSON from response
    let suggestions: Array<{ target: string; reason: string }> = []
    try {
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      }
    } catch {
      // ignore parse errors
    }

    // Filter to only existing pages and not already linked
    const validSuggestions = suggestions.filter((s) => {
      const targetLower = s.target.toLowerCase()
      return existingSlugs.has(targetLower) && !linkSlugs.has(targetLower)
    })

    if (validSuggestions.length === 0) {
      continue
    }

    spinner.stop()
    console.log(chalk.bold(`\n${page.title}\n`))

    for (const s of validSuggestions) {
      console.log(`  ${chalk.green(`[[${s.target}]]`)}`)
      console.log(`    ${chalk.dim(s.reason)}`)
    }

    if (!options.dryRun) {
      const apply = await confirm({
        message: "Apply these suggestions?",
        default: false,
      })

      if (apply) {
        // Find a good place to add links (end of first section or end of file)
        let updatedContent = page.content
        const linkBlock = "\n\n## Related\n\n" + validSuggestions.map((s) => `- [[${s.target}]]`).join("\n")

        if (!updatedContent.includes("## Related")) {
          updatedContent += linkBlock
        } else {
          const idx = updatedContent.indexOf("## Related")
          const endOfSection = updatedContent.indexOf("\n## ", idx + 1)
          const insertPoint = endOfSection > 0 ? endOfSection : updatedContent.length
          updatedContent = updatedContent.slice(0, insertPoint) + "\n" + validSuggestions.map((s) => `- [[${s.target}]]`).join("\n") + updatedContent.slice(insertPoint)
        }

        writeFileSync(page.path, updatedContent)
        console.log(chalk.green("  Applied!"))
      }
    }

    spinner.start()
  }

  spinner.stop()
  console.log(chalk.green("\nEnrichment complete!"))
}
