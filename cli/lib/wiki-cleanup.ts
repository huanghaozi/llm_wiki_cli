/**
 * Pure string-level helpers for cleaning up wiki files when pages get
 * deleted. Anchored to wikilink structure (not fuzzy substring) so
 * deleting `ai.md` doesn't wipe `[[OpenAI]]`, `[[Constitutional AI]]`.
 */

export interface DeletedPageInfo {
  slug: string
  title: string
}

/**
 * Canonicalize a label so lookups are insensitive to case and the
 * space/hyphen/underscore boundary between display title and file
 * slug. Trims whitespace so `[[ foo ]]` matches `foo`.
 */
export function normalizeWikiRefKey(s: string): string {
  const normalized = s.trim().replace(/\\/g, "/")
  const leaf = normalized.split("/").pop() ?? normalized
  const withoutMd = leaf.toLowerCase().endsWith(".md") ? leaf.slice(0, -3) : leaf
  return withoutMd.toLowerCase().replace(/[\s\-_]+/g, "")
}

export function buildDeletedKeys(infos: DeletedPageInfo[]): Set<string> {
  const keys = new Set<string>()
  for (const info of infos) {
    if (info.slug) keys.add(normalizeWikiRefKey(info.slug))
    if (info.title) keys.add(normalizeWikiRefKey(info.title))
  }
  return keys
}

const INDEX_ENTRY_RE = /^\s*[-*]\s*\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/

/**
 * Drop list-item lines from an index-style file when their primary
 * wikilink targets a deleted page. Every other line (headers, prose,
 * frontmatter, blank lines, list items with non-deleted primaries) is
 * preserved verbatim.
 */
export function cleanIndexListing(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text
  return text
    .split("\n")
    .filter((line) => {
      const m = line.match(INDEX_ENTRY_RE)
      if (!m) return true
      return !deletedKeys.has(normalizeWikiRefKey(m[1].trim()))
    })
    .join("\n")
}

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g

/**
 * Replace wikilinks pointing to deleted pages with plain text, leaving
 * wikilinks to surviving pages alone.
 */
export function stripDeletedWikilinks(text: string, deletedKeys: Set<string>): string {
  if (deletedKeys.size === 0) return text
  return text.replace(WIKILINK_RE, (match, target: string, display: string | undefined) => {
    const key = normalizeWikiRefKey(target.trim())
    if (!deletedKeys.has(key)) return match
    return display ?? target
  })
}
