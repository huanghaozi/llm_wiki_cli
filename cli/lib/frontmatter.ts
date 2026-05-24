import yaml from "js-yaml"

export type FrontmatterValue = string | string[]

export interface FrontmatterParseResult {
  frontmatter: Record<string, FrontmatterValue> | null
  body: string
  /**
   * The literal frontmatter block (opening `---`, YAML payload,
   * closing `---`, plus the newlines that separate it from the
   * body) as it appears in the input. Empty string when there is
   * no frontmatter. Callers that edit only the body write back
   * `rawBlock + body` so user-managed YAML survives untouched.
   */
  rawBlock: string
}

const FM_BLOCK_STRICT_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const FM_BLOCK_ANYWHERE_RE = /\n---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const MAX_PREFIX_LINES_BEFORE_FRONTMATTER = 6

export function parseFrontmatter(content: string): FrontmatterParseResult {
  const located = locateFrontmatterBlock(content)
  if (!located) return { frontmatter: null, body: content, rawBlock: "" }

  const { yamlPayload, rawBlock, body } = located

  let parsed: unknown
  try {
    parsed = yaml.load(yamlPayload, { schema: yaml.JSON_SCHEMA })
  } catch {
    try {
      parsed = yaml.load(repairWikilinkLists(yamlPayload), { schema: yaml.JSON_SCHEMA })
    } catch {
      return { frontmatter: null, body, rawBlock }
    }
  }

  return {
    frontmatter: normalize(parsed),
    body,
    rawBlock,
  }
}

/**
 * Extract the frontmatter `title:` value with proper anchoring inside
 * the frontmatter block. Unlike a naive `^title:` regex against the
 * whole file, this won't match a body paragraph that happens to start
 * with the word `title:`.
 */
export function extractFrontmatterTitle(content: string): string {
  const parsed = parseFrontmatter(content)
  const title = parsed.frontmatter?.title
  if (typeof title === "string" && title.trim()) return title.trim()

  // Fallback only when YAML parse failed for the frontmatter block.
  // We scope the title regex to characters BEFORE the closing `---`
  // of the frontmatter, never the body.
  if (!parsed.rawBlock) return ""
  const m = parsed.rawBlock.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  return m ? m[1].trim() : ""
}

/**
 * Strip the leading frontmatter block from a markdown document.
 * Handles both LF and CRLF line endings. Returns the original content
 * when no frontmatter is detected.
 */
export function stripFrontmatter(content: string): string {
  const parsed = parseFrontmatter(content)
  return parsed.rawBlock ? parsed.body : content
}

function locateFrontmatterBlock(
  content: string,
): { yamlPayload: string; rawBlock: string; body: string } | null {
  const strict = content.match(FM_BLOCK_STRICT_RE)
  if (strict) {
    return {
      yamlPayload: strict[1],
      rawBlock: strict[0],
      body: content.slice(strict[0].length),
    }
  }

  const fallback = content.match(FM_BLOCK_ANYWHERE_RE)
  if (!fallback || fallback.index === undefined) return null

  const openIdx = fallback.index + 1
  if (lineNumberAt(content, openIdx) > MAX_PREFIX_LINES_BEFORE_FRONTMATTER) {
    return null
  }

  const rawBlock = content.slice(openIdx, openIdx + fallback[0].length - 1)
  const bodyAfterFm = content.slice(openIdx + rawBlock.length)

  const prefix = content.slice(0, openIdx)
  const prefixIsYamlFence = /^\s*```(?:yaml|yml)?\s*\r?\n$/i.test(prefix)
  if (prefixIsYamlFence) {
    const stripped = bodyAfterFm.replace(/^\s*```\s*(?:\r?\n|$)/, "")
    return {
      yamlPayload: fallback[1],
      rawBlock,
      body: stripped,
    }
  }

  return {
    yamlPayload: fallback[1],
    rawBlock,
    body: bodyAfterFm,
  }
}

function lineNumberAt(s: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < s.length; i++) {
    if (s.charCodeAt(i) === 10) line++
  }
  return line
}

function repairWikilinkLists(payload: string): string {
  return payload
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/)
      if (!m) return line
      const prefix = m[1]
      const items = m[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `"${s}"`)
        .join(", ")
      return `${prefix}[${items}]`
    })
    .join("\n")
}

function normalize(parsed: unknown): Record<string, FrontmatterValue> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const out: Record<string, FrontmatterValue> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[key] = value.map((v) => stringifyScalar(v))
      continue
    }
    out[key] = stringifyScalar(value)
  }
  return out
}

function stringifyScalar(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
