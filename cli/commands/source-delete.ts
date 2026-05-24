import { existsSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join, basename } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { confirm } from "@inquirer/prompts"
import {
  listWikiMdFiles,
  buildSlugMap,
} from "../lib/wiki-files.js"
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
import {
  sourceIdentityForPath,
  sourceNameMatchesAny,
  sourceSummarySlugFromIdentity,
} from "../lib/source-identity.js"
import { removeFromIngestCache } from "../lib/ingest-cache.js"
import { vectorDeletePage } from "../lib/vector-store.js"
import { loadConfig } from "../lib/config-store.js"
import { appendToLog } from "../lib/project-utils.js"

interface SourceDeleteOptions {
  files: string[]
  projectPath?: string
  yes?: boolean
  keepWiki?: boolean
}

function findSourceFile(sourcesDir: string, name: string): string | null {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(sourcesDir, { withFileTypes: true })
  } catch {
    return null
  }
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

interface PendingDelete {
  path: string
  identity: string
  cacheKey: string
}

export async function sourceDeleteCommand(options: SourceDeleteOptions) {
  const projectPath = options.projectPath || process.cwd()
  const sourcesDir = join(projectPath, "raw", "sources")
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(sourcesDir)) {
    console.log(chalk.red("No sources directory found."))
    return
  }

  const toDelete: PendingDelete[] = []

  for (const fileName of options.files) {
    let fullPath = fileName
    if (!existsSync(fullPath)) {
      fullPath = join(sourcesDir, fileName)
    }
    if (!existsSync(fullPath)) {
      const found = findSourceFile(sourcesDir, fileName)
      if (found) fullPath = found
    }

    if (!fullPath || !existsSync(fullPath)) {
      console.log(chalk.yellow(`Source not found: ${fileName}`))
      continue
    }

    const identity = sourceIdentityForPath(projectPath, fullPath)
    toDelete.push({
      path: fullPath,
      identity,
      cacheKey: identity,
    })
  }

  if (toDelete.length === 0) {
    console.log(chalk.yellow("No sources to delete."))
    return
  }

  console.log(chalk.bold("\nSources to delete:\n"))
  for (const s of toDelete) {
    console.log(`  ${chalk.red(s.identity)}`)
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
  let updatedCount = 0
  const config = loadConfig()

  for (const source of toDelete) {
    try {
      unlinkSync(source.path)
      deletedCount++
    } catch {
      spinner.warn(`Failed to delete ${source.identity}`)
      continue
    }

    // Invalidate ingest cache for both identity and basename — old
    // caches may have used either key shape.
    removeFromIngestCache(projectPath, source.identity)
    removeFromIngestCache(projectPath, basename(source.identity))

    // Drop the pre-extracted text cache, if any.
    try {
      const cacheTxt = join(projectPath, "raw", "sources", ".cache", `${basename(source.identity)}.txt`)
      if (existsSync(cacheTxt)) rmSync(cacheTxt, { force: true })
    } catch {
      // non-critical
    }

    if (options.keepWiki || !existsSync(wikiDir)) continue

    const wikiFiles = listWikiMdFiles(wikiDir)
    const deletedInfos: Array<{ slug: string; title: string; path: string }> = []

    for (const file of wikiFiles) {
      let content: string
      try {
        content = readFileSync(file.path, "utf-8")
      } catch {
        continue
      }
      const sources = parseFrontmatterArray(content, "sources")
      if (sources.length === 0) continue
      if (!sourceNameMatchesAny(source.identity, sources)) continue

      const survivors = sources.filter((s) => !sourceNameMatchesAny(source.identity, [s]))

      if (survivors.length > 0) {
        // Page still has other contributing sources — just trim the entry.
        const updated = writeFrontmatterArray(content, "sources", survivors)
        if (updated !== content) {
          try {
            writeFileSync(file.path, updated)
            updatedCount++
          } catch {
            // skip
          }
        }
      } else {
        // Last source removed → page is no longer attributable; delete it.
        const slug = file.relPath.replace(/\.md$/, "")
        const title = extractFrontmatterTitle(content)
        deletedInfos.push({ slug, title, path: file.path })
      }
    }

    // Apply the cascade: delete pages, then clean up references in survivors.
    if (deletedInfos.length > 0) {
      const deletedKeys = buildDeletedKeys(
        deletedInfos.map((d) => ({ slug: d.slug, title: d.title })),
      )

      for (const d of deletedInfos) {
        try {
          unlinkSync(d.path)
          cleanedWikiCount++
        } catch {
          // skip
        }
        // Drop embedding chunks for the deleted page (filename-only id
        // matches the embedPage / search-engine convention).
        const pageId = basename(d.slug)
        try {
          await vectorDeletePage(projectPath, pageId)
        } catch {
          // embedding cleanup is best-effort
        }
        // Drop the media folder if any (for source-summary pages we use
        // sourceSummarySlugFromIdentity, but we also fallback to basename).
        try {
          const mediaDir = join(wikiDir, "media", pageId)
          if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true, force: true })
        } catch {
          // skip
        }
      }

      const survivingFiles = listWikiMdFiles(wikiDir)
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
            updatedCount++
          } catch {
            // skip
          }
        }
      }
    }

    // Also drop the canonical source-summary page derived from the
    // identity, even if it didn't show up via sources-list matching
    // (e.g. when its frontmatter `sources:` was lost).
    const summarySlug = sourceSummarySlugFromIdentity(source.identity)
    const summaryPath = join(wikiDir, "sources", `${summarySlug}.md`)
    if (existsSync(summaryPath)) {
      try {
        unlinkSync(summaryPath)
        cleanedWikiCount++
        await vectorDeletePage(projectPath, summarySlug).catch(() => {})
        const mediaDir = join(wikiDir, "media", summarySlug)
        if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true, force: true })
      } catch {
        // skip
      }
    }
  }

  appendToLog(
    projectPath,
    `Deleted ${deletedCount} source(s); removed ${cleanedWikiCount} wiki page(s); updated ${updatedCount} cross-reference(s).`,
  )

  spinner.succeed(
    `Deleted ${deletedCount} source(s), removed ${cleanedWikiCount} wiki page(s), updated ${updatedCount} cross-reference(s).`,
  )

  // Suppress unused-variable warning if `buildSlugMap` and `config`
  // become useful for future cascade refinements; keep imports stable.
  void buildSlugMap
  void config
  void statSync
}
