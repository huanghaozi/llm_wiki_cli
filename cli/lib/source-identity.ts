import { getFileName, normalizePath } from "./path-utils.js"

const RAW_SOURCES_PREFIX = "raw/sources/"
const RAW_SOURCES_MARKER = "/raw/sources/"
const MAX_SOURCE_SUMMARY_SLUG_LENGTH = 120

/**
 * Convert any absolute / relative source path to a project-relative
 * identity rooted at `raw/sources/`. This is the canonical key used
 * by sources lists and the ingest cache so same-name files in
 * different subfolders don't collide.
 */
export function sourceIdentityForPath(projectPath: string, sourcePath: string): string {
  const pp = normalizePath(projectPath).replace(/\/+$/, "")
  const sp = normalizePath(sourcePath)
  const projectRawSourcesPrefix = `${pp}/${RAW_SOURCES_PREFIX}`
  const spKey = sp.toLowerCase()
  if (spKey.startsWith(projectRawSourcesPrefix.toLowerCase())) {
    return sp.slice(projectRawSourcesPrefix.length)
  }
  if (spKey.startsWith(RAW_SOURCES_PREFIX)) {
    return sp.slice(RAW_SOURCES_PREFIX.length)
  }
  const markerIndex = spKey.indexOf(RAW_SOURCES_MARKER)
  if (markerIndex >= 0) {
    return sp.slice(markerIndex + RAW_SOURCES_MARKER.length)
  }
  return getFileName(sp)
}

/**
 * Normalize a wiki-frontmatter `sources:` reference to the same
 * canonical identity form used by `sourceIdentityForPath`. Lets
 * source-delete match `raw/sources/papers/intro.pdf` against a
 * stored `papers/intro.pdf` reference without colliding with an
 * unrelated `intro.pdf` in a different subfolder.
 */
export function sourceReferenceIdentity(sourceReference: string): string {
  const ref = normalizePath(sourceReference)
  const refKey = ref.toLowerCase()
  if (refKey.startsWith(RAW_SOURCES_PREFIX)) {
    return ref.slice(RAW_SOURCES_PREFIX.length)
  }
  const markerIndex = refKey.indexOf(RAW_SOURCES_MARKER)
  if (markerIndex >= 0) {
    return ref.slice(markerIndex + RAW_SOURCES_MARKER.length)
  }
  return ref
}

/**
 * Identity-aware match: returns true when ANY entry in `references`
 * resolves to the same identity as `targetIdentity`.
 *
 * Refuses basename-only fallback when both the reference and the
 * target contain a path separator — that way deleting
 * `papers-a/intro.pdf` won't strip references to `papers-b/intro.pdf`.
 */
export function sourceNameMatchesAny(targetIdentity: string, references: string[]): boolean {
  const targetIdLower = targetIdentity.toLowerCase()
  const targetBaseLower = getFileName(targetIdentity).toLowerCase()
  for (const raw of references) {
    const refIdentity = sourceReferenceIdentity(raw).toLowerCase()
    if (refIdentity === targetIdLower) return true
    // Basename-only fallback ONLY when neither side has path segments.
    if (!refIdentity.includes("/") && !targetIdLower.includes("/")) {
      if (refIdentity === targetBaseLower) return true
    }
    // If the wiki ref is path-prefixed but matches the same path tail,
    // accept it. e.g. ref = "papers-a/intro.pdf", target = "papers-a/intro.pdf"
    if (refIdentity.includes("/") && refIdentity === targetIdLower) return true
  }
  return false
}

export function sourceSummarySlugFromIdentity(sourceIdentity: string): string {
  const withoutExt = sourceIdentity.replace(/\.[^/.]+$/, "")
  const parts = withoutExt
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) {
    return parts[0] || "source"
  }

  const hash = stableSlugHash(sourceIdentity)
  const slug = parts
    .map((part) => {
      const encoded = encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      )
      return `${encoded.length}-${encoded}`
    })
    .join("--")
  const fullSlug = `${slug}--${hash}`
  if (fullSlug.length <= MAX_SOURCE_SUMMARY_SLUG_LENGTH) {
    return fullSlug
  }

  const readableLimit = MAX_SOURCE_SUMMARY_SLUG_LENGTH - hash.length - 2
  const readablePrefix = trimIncompletePercentEncoding(slug.slice(0, readableLimit))
    .replace(/-+$/, "")
    .replace(/%$/, "")
  return `${readablePrefix || "source"}--${hash}`
}

function trimIncompletePercentEncoding(value: string): string {
  return value.replace(/%(?:[0-9A-F])?$/i, "")
}

function stableSlugHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
