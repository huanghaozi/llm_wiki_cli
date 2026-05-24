import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"

interface WikiDeleteOptions {
  pages: string[]
  projectPath?: string
  yes?: boolean
}

function listMdFiles(dir: string): Array<{ path: string; relPath: string }> {
  const files: Array<{ path: string; relPath: string }> = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = entry.name
    if (entry.isDirectory()) {
      const subFiles = listMdFiles(fullPath)
      for (const sf of subFiles) {
        files.push({ path: sf.path, relPath: `${relPath}/${sf.relPath}` })
      }
    } else if (entry.name.endsWith(".md")) {
      files.push({ path: fullPath, relPath })
    }
  }
  return files
}

function extractFrontmatterTitle(content: string): string {
  const m = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  return m ? m[1].trim() : ""
}

function normalizeWikiRefKey(s: string): string {
  const leaf = s.replace(/\\/g, "/").split("/").pop() ?? s
  const withoutMd = leaf.toLowerCase().endsWith(".md") ? leaf.slice(0, -3) : leaf
  return withoutMd.toLowerCase().replace(/[\s\-_]+/g, "")
}

function buildDeletedKeys(slugs: string[], titles: string[]): Set<string> {
  const keys = new Set<string>()
  for (const s of slugs) if (s) keys.add(normalizeWikiRefKey(s))
  for (const t of titles) if (t) keys.add(normalizeWikiRefKey(t))
  return keys
}

function stripDeletedWikilinks(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (match, target: string, display: string | undefined) => {
    const key = normalizeWikiRefKey(target.trim())
    if (!deletedKeys.has(key)) return match
    return display ?? target
  })
}

function parseFrontmatterArray(content: string, key: string): string[] {
  const regex = new RegExp(`^${key}:\\s*\\[(.*?)\\]\\s*$`, "m")
  const m = content.match(regex)
  if (!m) return []
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}

function writeFrontmatterArray(content: string, key: string, values: string[]): string {
  const regex = new RegExp(`^(${key}:\\s*\\[).*?(\\]\\s*)$`, "m")
  const newLine = `${key}: [${values.map((v) => `"${v}"`).join(", ")}]`
  if (regex.test(content)) {
    return content.replace(regex, `${newLine}$2`)
  }
  return content
}

export async function wikiDeleteCommand(options: WikiDeleteOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found."))
    return
  }

  const allFiles = listMdFiles(wikiDir)
  const toDelete: Array<{ path: string; slug: string; title: string }> = []

  for (const pageName of options.pages) {
    // Find matching file
    let match = allFiles.find((f) =>
      f.relPath.toLowerCase() === pageName.toLowerCase() ||
      f.relPath.toLowerCase() === pageName.toLowerCase() + ".md" ||
      basename(f.path).toLowerCase() === pageName.toLowerCase() + ".md"
    )

    if (!match) {
      console.log(chalk.yellow(`Page not found: ${pageName}`))
      continue
    }

    let title = ""
    try {
      const content = readFileSync(match.path, "utf-8")
      title = extractFrontmatterTitle(content)
    } catch {
      // ignore
    }

    toDelete.push({
      path: match.path,
      slug: match.relPath.replace(/\.md$/, ""),
      title,
    })
  }

  if (toDelete.length === 0) {
    console.log(chalk.yellow("No pages to delete."))
    return
  }

  console.log(chalk.bold("\nPages to delete:\n"))
  for (const p of toDelete) {
    console.log(`  ${chalk.red(p.slug)} ${p.title ? chalk.dim(`(${p.title})`) : ""}`)
  }

  if (!options.yes) {
    const confirmed = await confirm({
      message: `Delete ${toDelete.length} page(s)? This will also clean up references.`,
      default: false,
    })
    if (!confirmed) {
      console.log(chalk.yellow("Aborted."))
      return
    }
  }

  const spinner = ora("Deleting pages and cleaning up references...").start()

  const deletedSlugs = toDelete.map((p) => p.slug)
  const deletedTitles = toDelete.map((p) => p.title)
  const deletedKeys = buildDeletedKeys(deletedSlugs, deletedTitles)
  let deletedCount = 0
  let rewrittenCount = 0

  // Delete target files
  for (const p of toDelete) {
    try {
      unlinkSync(p.path)
      deletedCount++
    } catch (err) {
      spinner.warn(`Failed to delete ${p.slug}`)
    }
  }

  // Clean up references in surviving files
  const survivingFiles = allFiles.filter((f) => !toDelete.some((d) => d.path === f.path))

  for (const file of survivingFiles) {
    try {
      let content = readFileSync(file.path, "utf-8")
      let updated = content

      // Strip deleted wikilinks
      updated = stripDeletedWikilinks(updated, deletedKeys)

      // Clean related frontmatter
      const related = parseFrontmatterArray(updated, "related")
      if (related.length > 0) {
        const filtered = related.filter((s) => !deletedKeys.has(normalizeWikiRefKey(s)))
        if (filtered.length !== related.length) {
          updated = writeFrontmatterArray(updated, "related", filtered)
        }
      }

      if (updated !== content) {
        writeFileSync(file.path, updated)
        rewrittenCount++
      }
    } catch {
      // skip
    }
  }

  spinner.succeed(`Deleted ${deletedCount} page(s), cleaned up ${rewrittenCount} file(s).`)
}
