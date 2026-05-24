import { readFileSync } from "node:fs"
import { basename } from "node:path"
import {
  listWikiMdFiles,
  extractWikilinks,
  buildSlugMap,
} from "./wiki-files.js"

export interface LintResult {
  type: "orphan" | "broken-link" | "no-outlinks" | "semantic"
  severity: "warning" | "info"
  page: string
  detail: string
  affectedPages?: string[]
}

export function runStructuralLint(wikiDir: string): LintResult[] {
  const files = listWikiMdFiles(wikiDir)
  const contentFiles = files.filter(
    (f) => basename(f.path) !== "index.md" && basename(f.path) !== "log.md",
  )

  const slugMap = buildSlugMap(contentFiles)

  interface PageData {
    relPath: string
    slug: string
    outlinks: string[]
  }

  const pages: PageData[] = []
  for (const f of contentFiles) {
    try {
      const content = readFileSync(f.path, "utf-8")
      pages.push({
        relPath: f.relPath,
        slug: f.relPath.replace(/\.md$/, ""),
        outlinks: extractWikilinks(content),
      })
    } catch {
      // skip
    }
  }

  const inboundCounts = new Map<string, number>()
  for (const p of pages) {
    for (const link of p.outlinks) {
      const lookup = link.toLowerCase()
      const basenameLookup = basename(link).replace(/\.md$/, "").toLowerCase()
      const targetPath = slugMap.get(lookup) ?? slugMap.get(basenameLookup)
      const target = targetPath
        ? contentFiles.find((f) => f.path === targetPath)?.relPath.replace(/\.md$/, "").toLowerCase() ?? lookup
        : lookup
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1)
    }
  }

  const results: LintResult[] = []

  for (const p of pages) {
    const inbound = inboundCounts.get(p.slug.toLowerCase()) ?? 0
    if (inbound === 0) {
      results.push({
        type: "orphan",
        severity: "info",
        page: p.relPath,
        detail: "No other pages link to this page.",
      })
    }

    if (p.outlinks.length === 0) {
      results.push({
        type: "no-outlinks",
        severity: "info",
        page: p.relPath,
        detail: "This page has no [[wikilink]] references to other pages.",
      })
    }

    for (const link of p.outlinks) {
      const lookup = link.toLowerCase()
      const basenameLookup = basename(link).replace(/\.md$/, "").toLowerCase()
      const exists = slugMap.has(lookup) || slugMap.has(basenameLookup)
      if (!exists) {
        results.push({
          type: "broken-link",
          severity: "warning",
          page: p.relPath,
          detail: `Broken link: [[${link}]] - target page not found.`,
        })
      }
    }
  }

  return results
}

export function applyOrphanFix(indexContent: string, pageRelPath: string): string {
  const pageName = pageRelPath.replace(".md", "").split("/").pop() ?? pageRelPath
  const entry = `- [[${pageName}]]`
  if (indexContent.includes(entry)) return indexContent
  return indexContent.trimEnd() + "\n" + entry + "\n"
}

export function removeBrokenLink(content: string, link: string): string {
  const escaped = link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return content.replace(new RegExp(`\\[\\[${escaped}(?:\\|[^\\]]+)?\\]\\]`, "g"), link)
}
