import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname, isAbsolute } from "node:path"
import { createHash } from "node:crypto"

/**
 * SHA256-based ingest cache.
 * Stores hash of source file content → skips re-ingest if unchanged.
 * Cache file: .llm-wiki/ingest-cache.json
 *
 * IMPORTANT: a cache hit is only returned if every previously-written
 * file still exists on disk. Otherwise we treat the cache as stale and
 * fall through to a full re-ingest, so a manually-deleted wiki page
 * doesn't permanently disappear from re-ingest.
 */

interface CacheEntry {
  hash: string
  timestamp: number
  filesWritten: string[]
}

interface CacheData {
  entries: Record<string, CacheEntry>
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

function cachePath(projectPath: string): string {
  return join(projectPath, ".llm-wiki", "ingest-cache.json")
}

function loadCache(projectPath: string): CacheData {
  try {
    const raw = readFileSync(cachePath(projectPath), "utf-8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && "entries" in parsed) {
      return parsed as CacheData
    }
    return { entries: {} }
  } catch {
    return { entries: {} }
  }
}

function saveCache(projectPath: string, cache: CacheData): void {
  try {
    const p = cachePath(projectPath)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(cache, null, 2))
  } catch {
    // non-critical
  }
}

export function checkIngestCache(
  projectPath: string,
  sourceFileName: string,
  sourceContent: string,
): string[] | null {
  const cache = loadCache(projectPath)
  const entry = cache.entries[sourceFileName]
  if (!entry) return null

  const currentHash = sha256(sourceContent)
  if (entry.hash !== currentHash) return null

  for (const filePath of entry.filesWritten) {
    const fullPath = isAbsolute(filePath) ? filePath : join(projectPath, filePath)
    if (!existsSync(fullPath)) return null
  }

  return entry.filesWritten
}

export function saveIngestCache(
  projectPath: string,
  sourceFileName: string,
  sourceContent: string,
  filesWritten: string[],
): void {
  const cache = loadCache(projectPath)
  const hash = sha256(sourceContent)
  cache.entries[sourceFileName] = {
    hash,
    timestamp: Date.now(),
    filesWritten,
  }
  saveCache(projectPath, cache)
}

export function removeFromIngestCache(
  projectPath: string,
  sourceFileName: string,
): void {
  const cache = loadCache(projectPath)
  delete cache.entries[sourceFileName]
  saveCache(projectPath, cache)
}
