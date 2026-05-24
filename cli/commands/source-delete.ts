import { existsSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"

interface SourceDeleteOptions {
  files: string[]
  projectPath?: string
  yes?: boolean
  keepWiki?: boolean
}

function findSourceFile(sourcesDir: string, name: string): string | null {
  const entries = readdirSync(sourcesDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(sourcesDir, entry.name)
    if (entry.isDirectory()) {
      const found = findSourceFile(fullPath, name)
      if (found) return found
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return fullPath
    }
  }
  return null
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

export async function sourceDeleteCommand(options: SourceDeleteOptions) {
  const projectPath = options.projectPath || process.cwd()
  const sourcesDir = join(projectPath, "raw", "sources")
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(sourcesDir)) {
    console.log(chalk.red("No sources directory found."))
    return
  }

  const toDelete: Array<{ path: string; name: string }> = []

  for (const fileName of options.files) {
    // Check if it's a full path
    let fullPath = fileName
    if (!existsSync(fullPath)) {
      // Try relative to sources dir
      fullPath = join(sourcesDir, fileName)
    }
    if (!existsSync(fullPath)) {
      // Try finding by name
      fullPath = findSourceFile(sourcesDir, fileName) || ""
    }

    if (!fullPath || !existsSync(fullPath)) {
      console.log(chalk.yellow(`Source not found: ${fileName}`))
      continue
    }

    toDelete.push({ path: fullPath, name: fileName })
  }

  if (toDelete.length === 0) {
    console.log(chalk.yellow("No sources to delete."))
    return
  }

  console.log(chalk.bold("\nSources to delete:\n"))
  for (const s of toDelete) {
    const relPath = s.path.replace(sourcesDir + "/", "").replace(sourcesDir + "\\", "")
    console.log(`  ${chalk.red(relPath)}`)
  }

  if (!options.yes) {
    const confirmed = await confirm({
      message: `Delete ${toDelete.length} source(s)?`,
      default: false,
    })
    if (!confirmed) {
      console.log(chalk.yellow("Aborted."))
      return
    }
  }

  const spinner = ora("Deleting sources...").start()
  let deletedCount = 0
  let cleanedWikiCount = 0

  for (const source of toDelete) {
    try {
      unlinkSync(source.path)
      deletedCount++

      // Try to find and optionally delete associated wiki pages
      if (!options.keepWiki && existsSync(wikiDir)) {
        const sourceName = source.name.replace(/\\/g, "/").split("/").pop() ?? source.name
        const wikiSourcesDir = join(wikiDir, "sources")

        if (existsSync(wikiSourcesDir)) {
          const wikiEntries = readdirSync(wikiSourcesDir, { withFileTypes: true })
          for (const entry of wikiEntries) {
            if (!entry.name.endsWith(".md")) continue
            const wikiPath = join(wikiSourcesDir, entry.name)
            try {
              const content = readFileSync(wikiPath, "utf-8")
              const sources = parseFrontmatterArray(content, "sources")

              const inList = sources.some((s) => s.toLowerCase() === sourceName.toLowerCase())
              if (!inList) continue

              const survivors = sources.filter((s) => s.toLowerCase() !== sourceName.toLowerCase())

              if (survivors.length > 0) {
                // Keep page, update sources
                const updated = writeFrontmatterArray(content, "sources", survivors)
                writeFileSync(wikiPath, updated)
              } else {
                // Delete wiki page and clean up references
                const slug = entry.name.replace(/\.md$/, "")
                const title = extractFrontmatterTitle(content)
                const deletedKeys = new Set<string>()
                deletedKeys.add(normalizeWikiRefKey(slug))
                if (title) deletedKeys.add(normalizeWikiRefKey(title))

                unlinkSync(wikiPath)
                cleanedWikiCount++

                // Clean references in other wiki files
                const allWikiFiles = findAllMdFiles(wikiDir)
                for (const wf of allWikiFiles) {
                  if (wf === wikiPath) continue
                  try {
                    let wc = readFileSync(wf, "utf-8")
                    let updated = stripDeletedWikilinks(wc, deletedKeys)
                    const related = parseFrontmatterArray(updated, "related")
                    if (related.length > 0) {
                      const filtered = related.filter((r) => !deletedKeys.has(normalizeWikiRefKey(r)))
                      if (filtered.length !== related.length) {
                        updated = writeFrontmatterArray(updated, "related", filtered)
                      }
                    }
                    if (updated !== wc) {
                      writeFileSync(wf, updated)
                    }
                  } catch {
                    // skip
                  }
                }
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      spinner.warn(`Failed to delete ${source.name}`)
    }
  }

  spinner.succeed(`Deleted ${deletedCount} source(s), cleaned up ${cleanedWikiCount} wiki page(s).`)
}

function findAllMdFiles(dir: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findAllMdFiles(fullPath))
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath)
    }
  }
  return files
}
