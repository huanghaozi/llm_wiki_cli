import { existsSync, readFileSync, unlinkSync, writeFileSync, rmSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"
import { listWikiMdFiles, type WikiPageFile } from "../lib/wiki-files.js"
import { extractFrontmatterTitle } from "../lib/frontmatter.js"
import {
  parseFrontmatterArray,
  writeFrontmatterArray,
} from "../lib/sources-merge.js"
import {
  buildDeletedKeys,
  cleanIndexListing,
  normalizeWikiRefKey,
  stripDeletedWikilinks,
} from "../lib/wiki-cleanup.js"
import { vectorDeletePage } from "../lib/vector-store.js"
import { appendToLog } from "../lib/project-utils.js"

interface WikiDeleteOptions {
  pages: string[]
  projectPath?: string
  yes?: boolean
}

function findMatchingPage(allFiles: WikiPageFile[], pageName: string): WikiPageFile | undefined {
  const needle = pageName.toLowerCase().replace(/\\/g, "/")
  const needleMd = needle.endsWith(".md") ? needle : `${needle}.md`
  const needleBase = basename(needle).replace(/\.md$/, "")

  // 1) Exact path match
  let m = allFiles.find((f) => f.relPath.toLowerCase() === needleMd)
  if (m) return m
  // 2) Basename match
  m = allFiles.find((f) => basename(f.path).toLowerCase() === needleMd)
  if (m) return m
  // 3) Slug match (case-insensitive, hyphen/space agnostic)
  const normalizedNeedle = needleBase.replace(/[\s\-_]+/g, "").toLowerCase()
  m = allFiles.find((f) => {
    const stem = basename(f.path).replace(/\.md$/, "").toLowerCase()
    return stem.replace(/[\s\-_]+/g, "") === normalizedNeedle
  })
  if (m) return m
  // 4) Title match
  return allFiles.find((f) => {
    try {
      const content = readFileSync(f.path, "utf-8")
      const t = extractFrontmatterTitle(content)
      return t && t.toLowerCase() === needle
    } catch {
      return false
    }
  })
}

export async function wikiDeleteCommand(options: WikiDeleteOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found."))
    return
  }

  const allFiles = listWikiMdFiles(wikiDir)
  const toDelete: Array<{ path: string; relPath: string; slug: string; title: string }> = []

  for (const pageName of options.pages) {
    const match = findMatchingPage(allFiles, pageName)
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
      relPath: match.relPath,
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
    console.log(`  ${chalk.red(p.relPath)} ${p.title ? chalk.dim(`(${p.title})`) : ""}`)
  }

  if (!options.yes) {
    const confirmed = await confirm({
      message: `Delete ${toDelete.length} page(s)? Cross-references will be cleaned up too.`,
      default: false,
    })
    if (!confirmed) {
      console.log(chalk.yellow("Aborted."))
      return
    }
  }

  const spinner = ora("Deleting pages and cleaning references...").start()

  const deletedKeys = buildDeletedKeys(
    toDelete.map((p) => ({ slug: p.slug, title: p.title })),
  )

  let deletedCount = 0
  for (const p of toDelete) {
    try {
      unlinkSync(p.path)
      deletedCount++
    } catch {
      spinner.warn(`Failed to delete ${p.slug}`)
      continue
    }
    // Drop embedding chunks
    try {
      await vectorDeletePage(projectPath, basename(p.slug))
    } catch {
      // best-effort
    }
    // Drop the media folder if any
    try {
      const mediaDir = join(wikiDir, "media", basename(p.slug))
      if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }

  const survivingFiles = allFiles.filter((f) => !toDelete.some((d) => d.path === f.path))
  let rewrittenCount = 0

  for (const file of survivingFiles) {
    let content: string
    try {
      content = readFileSync(file.path, "utf-8")
    } catch {
      continue
    }
    let updated = content

    const isIndex = /(^|\/)index\.md$/.test(file.relPath)
    if (isIndex) {
      updated = cleanIndexListing(updated, deletedKeys)
    }

    updated = stripDeletedWikilinks(updated, deletedKeys)

    const related = parseFrontmatterArray(updated, "related")
    if (related.length > 0) {
      const filtered = related.filter((s) => !deletedKeys.has(normalizeWikiRefKey(s)))
      if (filtered.length !== related.length) {
        updated = writeFrontmatterArray(updated, "related", filtered)
      }
    }

    if (updated !== content) {
      try {
        writeFileSync(file.path, updated)
        rewrittenCount++
      } catch {
        // skip
      }
    }
  }

  appendToLog(
    projectPath,
    `Deleted ${deletedCount} wiki page(s); cleaned references in ${rewrittenCount} file(s).`,
  )

  spinner.succeed(
    `Deleted ${deletedCount} page(s), cleaned up references in ${rewrittenCount} file(s).`,
  )
}
