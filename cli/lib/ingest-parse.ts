/**
 * Parse the LLM stage-2 generation into FILE / REVIEW blocks.
 *
 * Why the parser is line-based instead of a single regex: the naive
 * `---FILE:...---END FILE---` regex walks into several hazards seen
 * in real-LLM streams — CRLF line endings, stream truncation,
 * marker whitespace/case variants, literal closer inside a fenced
 * code block (e.g. when the LLM is writing a page about our own
 * format), and empty paths. The parser below surfaces drops as
 * warnings instead of silently swallowing pages.
 */

const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/
const REVIEW_BLOCK_REGEX = /---REVIEW:\s*(\w[\w-]*)\s*\|\s*(.+?)\s*---\r?\n([\s\S]*?)---END REVIEW---/g

export interface ParsedFileBlock {
  path: string
  content: string
}

export interface ParseFileBlocksResult {
  blocks: ParsedFileBlock[]
  warnings: string[]
}

export interface ParsedReviewBlock {
  type: "contradiction" | "duplicate" | "missing-page" | "suggestion" | "confirm"
  title: string
  description: string
  options: Array<{ label: string; action: string }>
  affectedPages?: string[]
  searchQueries?: string[]
}

/**
 * Reject any path that isn't safe to write under the project root.
 * Specifically: absolute paths, drive letters, UNC, `..` segments,
 * control bytes, Windows-invalid filename chars, reserved Windows
 * filenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), and
 * any path that escapes `wiki/`.
 */
export function isSafeIngestPath(p: string): boolean {
  if (typeof p !== "string" || p.trim().length === 0) return false
  if (/[\x00-\x1f]/.test(p)) return false
  if (p.startsWith("/") || p.startsWith("\\")) return false
  if (/^[a-zA-Z]:/.test(p)) return false
  const normalized = p.replace(/\\/g, "/")
  const segments = normalized.split("/")
  if (segments.some((seg) => seg === "..")) return false
  if (segments.some((seg) => !isWindowsSafePathSegment(seg))) return false
  if (!normalized.startsWith("wiki/")) return false
  return true
}

function isWindowsSafePathSegment(segment: string): boolean {
  if (segment.length === 0) return false
  if (/[<>:"|?*]/.test(segment)) return false
  if (/[ .]$/.test(segment)) return false
  const stem = segment.split(".")[0]?.toUpperCase()
  if (!stem) return false
  if (
    stem === "CON" || stem === "PRN" || stem === "AUX" || stem === "NUL" ||
    /^COM[1-9]$/.test(stem) || /^LPT[1-9]$/.test(stem)
  ) {
    return false
  }
  return true
}

/**
 * Parse a stage-2 generation into FILE blocks. Drops blocks that:
 *  - are not closed before end of stream (truncation)
 *  - have an empty path
 *  - have an unsafe path (see `isSafeIngestPath`)
 * Each drop is surfaced as a warning string for the caller to log
 * or push into a review item.
 */
export function parseFileBlocks(text: string): ParseFileBlocksResult {
  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")

  const blocks: ParsedFileBlock[] = []
  const warnings: string[] = []

  let i = 0
  while (i < lines.length) {
    const openerMatch = OPENER_LINE.exec(lines[i])
    if (!openerMatch) {
      i++
      continue
    }
    const path = openerMatch[1].trim()
    i++

    const contentLines: string[] = []
    let fenceMarker: string | null = null
    let fenceLen = 0
    let closed = false

    while (i < lines.length) {
      const line = lines[i]

      const fenceMatch = FENCE_LINE.exec(line)
      if (fenceMatch) {
        const run = fenceMatch[1]
        const char = run[0]
        const len = run.length
        if (fenceMarker === null) {
          fenceMarker = char
          fenceLen = len
        } else if (char === fenceMarker && len >= fenceLen) {
          fenceMarker = null
          fenceLen = 0
        }
        contentLines.push(line)
        i++
        continue
      }

      if (fenceMarker === null && CLOSER_LINE.test(line)) {
        closed = true
        i++
        break
      }

      contentLines.push(line)
      i++
    }

    if (!closed) {
      const pathLabel = path || "(unnamed)"
      warnings.push(
        `FILE block "${pathLabel}" was not closed before end of stream — likely truncation. Block dropped.`,
      )
      continue
    }

    if (!path) {
      warnings.push("FILE block with empty path skipped.")
      continue
    }

    if (!isSafeIngestPath(path)) {
      warnings.push(
        `FILE block with unsafe path "${path}" rejected (must be under wiki/, no .., no absolute paths, no reserved Windows names).`,
      )
      continue
    }

    blocks.push({ path, content: contentLines.join("\n") })
  }

  return { blocks, warnings }
}

/**
 * Parse REVIEW blocks. The LLM emits these alongside FILE blocks to
 * flag contradictions, duplicates, missing pages, suggestions, or
 * deep-research opportunities. See the generation-prompt scaffold in
 * the ingest command for the expected shape.
 */
export function parseReviewBlocks(text: string): ParsedReviewBlock[] {
  const items: ParsedReviewBlock[] = []
  const matches = text.matchAll(REVIEW_BLOCK_REGEX)

  for (const match of matches) {
    const rawType = match[1].trim().toLowerCase()
    const title = match[2].trim()
    const body = match[3].trim()

    const type = (
      ["contradiction", "duplicate", "missing-page", "suggestion"].includes(rawType)
        ? rawType
        : "confirm"
    ) as ParsedReviewBlock["type"]

    const optionsMatch = body.match(/^OPTIONS:\s*(.+)$/m)
    const options = optionsMatch
      ? optionsMatch[1].split("|").map((o) => {
          const label = o.trim()
          return { label, action: label }
        })
      : [
          { label: "Approve", action: "Approve" },
          { label: "Skip", action: "Skip" },
        ]

    const pagesMatch = body.match(/^PAGES:\s*(.+)$/m)
    const affectedPages = pagesMatch
      ? pagesMatch[1].split(",").map((p) => p.trim()).filter(Boolean)
      : undefined

    const searchMatch = body.match(/^SEARCH:\s*(.+)$/m)
    const searchQueries = searchMatch
      ? searchMatch[1].split("|").map((q) => q.trim()).filter((q) => q.length > 0)
      : undefined

    const description = body
      .replace(/^OPTIONS:.*$/m, "")
      .replace(/^PAGES:.*$/m, "")
      .replace(/^SEARCH:.*$/m, "")
      .trim()

    items.push({
      type,
      title,
      description,
      options,
      affectedPages,
      searchQueries,
    })
  }

  return items
}

/**
 * Should the block be appended (log.md) rather than overwritten or
 * merged? Log files grow append-only.
 */
export function isLogPath(p: string): boolean {
  const normalized = p.replace(/\\/g, "/")
  return normalized === "wiki/log.md" || normalized.endsWith("/log.md")
}

/**
 * Should the block be index-style (overwritten)? The index page is
 * the authoritative TOC; the LLM emits a full new copy each time.
 */
export function isIndexPath(p: string): boolean {
  const normalized = p.replace(/\\/g, "/")
  return normalized === "wiki/index.md" || normalized.endsWith("/index.md")
}
