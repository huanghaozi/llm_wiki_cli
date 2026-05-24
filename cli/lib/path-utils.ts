/**
 * Cross-platform path helpers used by the CLI.
 *
 * Why this duplicates `node:path`: the wiki stores references with
 * forward slashes regardless of host OS, and many comparison /
 * normalization passes treat backslashes and forward slashes as
 * equivalent. Keeping these helpers tiny and dependency-free also
 * lets the test suite import them without touching `process.platform`.
 */

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, "/"))
    .join("/")
    .replace(/\/+/g, "/")
}

export function getFileName(p: string): string {
  const normalized = p.replace(/\\/g, "/")
  return normalized.split("/").pop() ?? p
}

export function getFileStem(p: string): string {
  const name = getFileName(p)
  const lastDot = name.lastIndexOf(".")
  return lastDot > 0 ? name.slice(0, lastDot) : name
}

export function getRelativePath(fullPath: string, basePath: string): string {
  const normalFull = normalizePath(fullPath)
  const normalBase = normalizePath(basePath).replace(/\/$/, "")
  if (normalFull.startsWith(normalBase + "/")) {
    return normalFull.slice(normalBase.length + 1)
  }
  return normalFull
}

/**
 * Cross-platform absolute-path detection.
 *
 * Unix:     "/foo/bar"
 * Windows:  "C:\foo", "C:/foo", "\\server\share", "//server/share"
 */
export function isAbsolutePath(p: string): boolean {
  if (!p) return false
  if (p.startsWith("/")) return true
  if (/^[A-Za-z]:[\\/]/.test(p)) return true
  if (p.startsWith("\\\\") || p.startsWith("//")) return true
  return false
}
