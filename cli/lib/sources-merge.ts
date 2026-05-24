/**
 * Frontmatter array-field merging during ingest.
 *
 * Unions `sources` / `tags` / `related` across re-ingests so a
 * second-source contribution doesn't clobber the historical
 * sources list and silently cascade into source-delete wiping the
 * whole page.
 *
 * Also exposes inline + block form `key: [...]` / `key:\n  - a`
 * parsing — used by both delete commands and the canonicalizer.
 */

/**
 * Extract a frontmatter array field by name. Handles both:
 *   inline form:    `name: ["a", "b"]` or `name: [a, b]`
 *   block form:     `name:\n  - a\n  - b`
 * Strips quotes (single or double) from items. Returns `[]` for
 * missing field or content with no frontmatter.
 */
export function parseFrontmatterArray(content: string, fieldName: string): string[] {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return []
  const fm = fmMatch[1]
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const blockRe = new RegExp(
    `^${escapedName}:\\s*\\n((?:[ \\t]+-\\s+.+\\n?)+)`,
    "m",
  )
  const block = fm.match(blockRe)
  if (block) {
    const out: string[] = []
    for (const line of block[1].split("\n")) {
      const m = line.match(/^\s+-\s+["']?(.+?)["']?\s*$/)
      if (m && m[1]) out.push(m[1].trim())
    }
    return out
  }

  const inlineRe = new RegExp(`^${escapedName}:\\s*\\[([^\\]]*)\\]`, "m")
  const inline = fm.match(inlineRe)
  if (!inline) return []
  const body = inline[1].trim()
  if (body === "") return []
  return body
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0)
}

/**
 * Rewrite (or insert) a frontmatter array field. Returns content
 * unchanged if the input has no frontmatter at all (don't manufacture
 * frontmatter for unconventional pages).
 *
 * Always emits the inline form `name: ["a", "b"]` so downstream
 * parsers see a consistent shape regardless of the original.
 */
export function writeFrontmatterArray(
  content: string,
  fieldName: string,
  values: string[],
): string {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!fmMatch) return content

  const [, openDelim, fmBody, closeDelim] = fmMatch
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const serialized = values.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(", ")
  const newLine = `${fieldName}: [${serialized}]`

  const inlineRe = new RegExp(`^${escapedName}:\\s*\\[[^\\]]*\\]`, "m")
  if (inlineRe.test(fmBody)) {
    const rewritten = fmBody.replace(inlineRe, newLine)
    return `${openDelim}${rewritten}${closeDelim}${content.slice(fmMatch[0].length)}`
  }

  const blockRe = new RegExp(
    `^${escapedName}:\\s*\\n((?:[ \\t]+-\\s+.+\\n?)+)`,
    "m",
  )
  if (blockRe.test(fmBody)) {
    const rewritten = fmBody.replace(blockRe, newLine)
    return `${openDelim}${rewritten}${closeDelim}${content.slice(fmMatch[0].length)}`
  }

  const rewritten = `${fmBody}\n${newLine}`
  return `${openDelim}${rewritten}${closeDelim}${content.slice(fmMatch[0].length)}`
}

/**
 * Union-merge two array values. Case-insensitive dedup. First-seen
 * casing wins so user-typed filename casing stays stable.
 */
function mergeLists(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...existing, ...incoming]) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/**
 * Multi-field merge entry point. For each requested field, union the
 * existing-on-disk value with the LLM-emitted new value, and rewrite
 * the new content's frontmatter with the merged values.
 */
export function mergeArrayFieldsIntoContent(
  newContent: string,
  existingContent: string | null,
  fields: readonly string[],
): string {
  if (!existingContent) return newContent
  if (!/^---\r?\n/.test(existingContent)) return newContent

  let result = newContent
  let changed = false
  for (const field of fields) {
    const oldValues = parseFrontmatterArray(existingContent, field)
    if (oldValues.length === 0) continue
    const newValues = parseFrontmatterArray(result, field)
    const merged = mergeLists(oldValues, newValues)
    if (
      merged.length === newValues.length &&
      merged.every((s, i) => s === newValues[i])
    ) {
      continue
    }
    result = writeFrontmatterArray(result, field, merged)
    changed = true
  }
  return changed ? result : newContent
}

export function parseSources(content: string): string[] {
  return parseFrontmatterArray(content, "sources")
}

export function writeSources(content: string, sources: string[]): string {
  return writeFrontmatterArray(content, "sources", sources)
}

export function mergeSourcesLists(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  return mergeLists(existing, incoming)
}

export function mergeSourcesIntoContent(
  newContent: string,
  existingContent: string | null,
): string {
  return mergeArrayFieldsIntoContent(newContent, existingContent, ["sources"])
}
