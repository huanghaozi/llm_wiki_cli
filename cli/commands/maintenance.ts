import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm, select } from "@inquirer/prompts"
import { loadConfig } from "../lib/config-store.js"
import { chatCompletion } from "../lib/llm-client.js"
import {
  listWikiMdFiles,
  extractFrontmatterTitle,
  extractBody,
} from "../lib/wiki-files.js"
import { appendToLog } from "../lib/project-utils.js"

interface MaintenanceOptions {
  projectPath?: string
  detect?: boolean
  merge?: boolean
}

interface EntitySummary {
  slug: string
  path: string
  relPath: string
  type: string
  title: string
  description: string
  tags: string[]
}

interface DuplicateGroup {
  slugs: string[]
  reason: string
  confidence: "high" | "medium" | "low"
}

export async function maintenanceCommand(options: MaintenanceOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found. Run 'llm-wiki init' first."))
    return
  }

  const config = loadConfig()
  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  const summaries = extractEntitySummaries(wikiDir)
  if (summaries.length < 2) {
    console.log(chalk.yellow("Not enough entity/concept pages for duplicate detection."))
    return
  }

  console.log(chalk.bold(`\nMaintenance: scanning ${summaries.length} entity/concept pages\n`))

  const spinner = ora("Detecting duplicate pages with LLM...").start()
  const groups = await detectDuplicateGroups(summaries, config)
  spinner.stop()

  if (groups.length === 0) {
    console.log(chalk.green("No duplicate groups detected."))
    return
  }

  console.log(chalk.yellow(`Found ${groups.length} potential duplicate group(s):\n`))
  for (const g of groups) {
    console.log(`  ${chalk.bold(g.slugs.join(", "))} ${chalk.dim(`(${g.confidence})`)}`)
    console.log(chalk.dim(`    ${g.reason}`))
  }
  console.log()

  if (!options.merge) {
    console.log(chalk.dim("Merge with: llm-wiki maintenance --merge"))
    return
  }

  const group = await select({
    message: "Select a group to merge:",
    choices: groups.map((g, i) => ({
      name: `${g.slugs.join(" + ")} (${g.confidence})`,
      value: i,
    })),
  })

  const selected = groups[group]
  const canonicalSlug = await select({
    message: "Keep which page as canonical?",
    choices: selected.slugs.map((s) => ({ name: s, value: s })),
  })

  const mergeSpinner = ora("Merging pages...").start()
  try {
    await mergeDuplicateGroup(projectPath, wikiDir, selected, canonicalSlug, config)
    mergeSpinner.succeed(`Merged into ${canonicalSlug}`)
    appendToLog(projectPath, `Merged duplicates: ${selected.slugs.join(", ")} → ${canonicalSlug}`)
  } catch (err) {
    mergeSpinner.fail(err instanceof Error ? err.message : String(err))
  }
}

function extractEntitySummaries(wikiDir: string): EntitySummary[] {
  const summaries: EntitySummary[] = []
  for (const sub of ["entities", "concepts"]) {
    const subDir = join(wikiDir, sub)
    if (!existsSync(subDir)) continue
    for (const f of listWikiMdFiles(subDir, sub)) {
      try {
        const content = readFileSync(f.path, "utf-8")
        const title = extractFrontmatterTitle(content) || basename(f.path, ".md")
        const body = extractBody(content)
        const desc = body.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.slice(0, 200) ?? ""
        const tagsMatch = content.match(/^tags:\s*\[(.+?)\]/m)
        const tags = tagsMatch ? tagsMatch[1].split(",").map((t) => t.trim().replace(/["']/g, "")) : []
        summaries.push({
          slug: basename(f.path, ".md"),
          path: f.path,
          relPath: f.relPath,
          type: sub === "entities" ? "entity" : "concept",
          title,
          description: desc,
          tags,
        })
      } catch {
        // skip
      }
    }
  }
  return summaries
}

async function detectDuplicateGroups(
  summaries: EntitySummary[],
  config: ReturnType<typeof loadConfig>,
): Promise<DuplicateGroup[]> {
  const lines = summaries.map((s) =>
    `- type=${s.type}, slug=${s.slug}, title=${JSON.stringify(s.title)}${s.description ? ` — ${s.description}` : ""}`,
  )

  const response = await chatCompletion(config, [
    {
      role: "system",
      content: `You are a wiki maintenance assistant. Identify groups of pages that likely describe the same entity or concept under different names. Return JSON only: {"groups":[{"slugs":["a","b"],"reason":"...","confidence":"high|medium|low"}]}`,
    },
    {
      role: "user",
      content: `## Wiki pages (${summaries.length})\n\n${lines.join("\n")}\n\nReturn duplicate groups as JSON only.`,
    },
  ])

  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { groups?: DuplicateGroup[] }
    const validSlugs = new Set(summaries.map((s) => s.slug))
    return (parsed.groups ?? [])
      .map((g) => ({ ...g, slugs: g.slugs.filter((s) => validSlugs.has(s)) }))
      .filter((g) => g.slugs.length >= 2)
  } catch {
    return []
  }
}

async function mergeDuplicateGroup(
  projectPath: string,
  wikiDir: string,
  group: DuplicateGroup,
  canonicalSlug: string,
  config: ReturnType<typeof loadConfig>,
) {
  const pages = group.slugs.map((slug) => {
    for (const sub of ["entities", "concepts"]) {
      const path = join(wikiDir, sub, `${slug}.md`)
      if (existsSync(path)) return { slug, path, content: readFileSync(path, "utf-8") }
    }
    throw new Error(`Page not found: ${slug}`)
  })

  const merged = await chatCompletion(config, [
    {
      role: "system",
      content: "Merge the given wiki pages into one coherent page. Output complete markdown with frontmatter. First character must be '-'.",
    },
    {
      role: "user",
      content: pages.map((p) => `## ${p.slug}\n${p.content}`).join("\n\n---\n\n"),
    },
  ])

  const canonical = pages.find((p) => p.slug === canonicalSlug)!
  writeFileSync(canonical.path, merged)

  for (const page of pages) {
    if (page.slug === canonicalSlug) continue
    rewriteCrossReferences(wikiDir, page.slug, canonicalSlug)
    unlinkSync(page.path)
  }
}

function rewriteCrossReferences(wikiDir: string, oldSlug: string, newSlug: string) {
  for (const f of listWikiMdFiles(wikiDir)) {
    let content = readFileSync(f.path, "utf-8")
    const updated = content
      .replace(new RegExp(`\\[\\[${escapeRegex(oldSlug)}(?:\\|[^\\]]+)?\\]\\]`, "gi"), `[[${newSlug}]]`)
      .replace(new RegExp(`(-\\s+)${escapeRegex(oldSlug)}`, "g"), `$1${newSlug}`)
    if (updated !== content) writeFileSync(f.path, updated)
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
