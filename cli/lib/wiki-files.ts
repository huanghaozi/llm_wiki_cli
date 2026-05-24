import { readFileSync, readdirSync } from "node:fs"
import { join, basename } from "node:path"
import {
  extractFrontmatterTitle as extractFmTitle,
  stripFrontmatter,
} from "./frontmatter.js"

export interface WikiPageFile {
  path: string
  relPath: string
  name: string
}

export function listWikiMdFiles(wikiDir: string, prefix = ""): WikiPageFile[] {
  const files: WikiPageFile[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(wikiDir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const fullPath = join(wikiDir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...listWikiMdFiles(fullPath, relPath))
    } else if (entry.name.endsWith(".md")) {
      files.push({ path: fullPath, relPath, name: entry.name })
    }
  }
  return files
}

/**
 * Anchored frontmatter title extractor — uses the YAML parser to
 * avoid matching `title:` lines that appear in the body.
 */
export function extractFrontmatterTitle(content: string): string {
  return extractFmTitle(content)
}

/**
 * Strip the leading frontmatter block. Handles CRLF, fenced-yaml
 * prefixes, and missing-close cases via the shared parser.
 */
export function extractBody(content: string): string {
  return stripFrontmatter(content)
}

export function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

export function normalizeWikiRefKey(s: string): string {
  const normalized = s.trim().replace(/\\/g, "/")
  const leaf = normalized.split("/").pop() ?? normalized
  const withoutMd = leaf.toLowerCase().endsWith(".md") ? leaf.slice(0, -3) : leaf
  return withoutMd.toLowerCase().replace(/[\s\-_]+/g, "")
}

export function buildSlugMap(files: WikiPageFile[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of files) {
    const slug = f.relPath.replace(/\.md$/, "")
    map.set(slug.toLowerCase(), f.path)
    map.set(basename(f.path).replace(/\.md$/, "").toLowerCase(), f.path)
  }
  return map
}

export function readPageTitle(page: WikiPageFile): string {
  try {
    const content = readFileSync(page.path, "utf-8")
    const title = extractFrontmatterTitle(content)
    return title || page.name.replace(/\.md$/, "")
  } catch {
    return page.name.replace(/\.md$/, "")
  }
}
