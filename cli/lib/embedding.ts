import type { EmbeddingConfig } from "../types/cli.js"
import { chunkMarkdown, type Chunk } from "./text-chunker.js"
import {
  vectorUpsertChunks,
  vectorSearchChunks,
  vectorDeletePage,
  vectorCountChunks,
} from "./vector-store.js"
import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { listWikiMdFiles, extractFrontmatterTitle } from "./wiki-files.js"

let lastEmbeddingError: string | null = null

export function getLastEmbeddingError(): string | null {
  return lastEmbeddingError
}

function isGoogleEndpoint(endpoint: string): boolean {
  const lower = endpoint.toLowerCase()
  return lower.includes("generativelanguage.googleapis.com") || /:embedcontent/i.test(endpoint)
}

/**
 * Build the canonical Google embedding URL.
 *
 * Accepts any of the user-pasted shapes:
 *   - base host (`.../v1beta`)
 *   - `.../models/<model>:embedContent`
 *   - `.../models/<model>:batchEmbedContents`  (we coerce to :embedContent)
 *
 * Critical: we encode ONLY the bare model id, not the slash. The
 * previous implementation called `encodeURIComponent` on the whole
 * `models/<id>` segment which turned `/` into `%2F` and Google
 * rejected the URL.
 */
export function googleEmbeddingEndpoint(endpoint: string, model: string): string {
  if (/:batchEmbedContents/i.test(endpoint)) {
    return endpoint.replace(/:batchEmbedContents/i, ":embedContent")
  }
  if (/:embedContent/i.test(endpoint)) {
    return endpoint
  }
  const base = endpoint.replace(/\/+$/, "")
  const bareModel = model.replace(/^models\//, "")
  if (/\/models\/[^/]+$/i.test(base)) {
    return `${base}:embedContent`
  }
  return `${base}/models/${encodeURIComponent(bareModel)}:embedContent`
}

function googleEmbeddingBody(
  model: string,
  text: string,
  outputDimensionality?: number,
): Record<string, unknown> {
  const fullModel = model.startsWith("models/") ? model : `models/${model}`
  return {
    model: fullModel,
    content: { parts: [{ text }] },
    ...(outputDimensionality ? { output_dimensionality: outputDimensionality } : {}),
  }
}

/**
 * Strip the `?key=` query param from a user-pasted Google endpoint.
 * Auth flows through the `x-goog-api-key` header — leaving the key
 * in the URL would log it in tracing / proxies.
 */
function stripGoogleApiKeyQuery(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    url.searchParams.delete("key")
    return url.toString()
  } catch {
    return endpoint
  }
}

export async function fetchEmbedding(text: string, cfg: EmbeddingConfig): Promise<number[] | null> {
  if (!cfg.enabled || !cfg.endpoint || !cfg.model) return null

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const isGoogle = isGoogleEndpoint(cfg.endpoint)
  let endpoint = cfg.endpoint

  if (isGoogle) {
    if (cfg.apiKey) headers["x-goog-api-key"] = cfg.apiKey
    endpoint = stripGoogleApiKeyQuery(googleEmbeddingEndpoint(cfg.endpoint, cfg.model))
  } else {
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  }

  let current = text
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      // Rebuild the body each attempt so the halve-retry actually
      // shrinks what we send (previous impl captured the original
      // text once for the Google branch and never used `current`).
      const body = isGoogle
        ? googleEmbeddingBody(cfg.model, current, cfg.outputDimensionality)
        : { model: cfg.model, input: current }

      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const errText = await resp.text()
        if (current.length > 64 && /too long|context|token|exceeds|maximum|limit/i.test(errText)) {
          current = current.slice(0, Math.floor(current.length / 2))
          continue
        }
        lastEmbeddingError = `Embedding API ${resp.status}: ${errText.slice(0, 200)}`
        return null
      }
      const data = await resp.json()
      const embedding = isGoogle
        ? data?.embedding?.values
        : data?.data?.[0]?.embedding
      if (Array.isArray(embedding) && embedding.length > 0) {
        lastEmbeddingError = null
        return embedding
      }
      lastEmbeddingError = "Embedding response missing vector"
      return null
    } catch (err) {
      lastEmbeddingError = err instanceof Error ? err.message : String(err)
      return null
    }
  }
  return null
}

function enrichChunkForEmbedding(pageTitle: string, chunk: Chunk): string {
  const parts: string[] = []
  if (pageTitle.trim()) parts.push(pageTitle.trim())
  if (chunk.headingPath.trim()) parts.push(chunk.headingPath.trim())
  parts.push(chunk.text.trim())
  return parts.join("\n\n")
}

export async function embedPage(
  projectPath: string,
  pageId: string,
  title: string,
  content: string,
  cfg: EmbeddingConfig,
): Promise<void> {
  if (!cfg.enabled || !cfg.model) return

  const chunks = chunkMarkdown(content, {
    targetChars: cfg.maxChunkChars ?? 1000,
    overlapChars: cfg.overlapChunkChars ?? 200,
  })
  if (chunks.length === 0) return

  const rows: Array<{
    chunkIndex: number
    chunkText: string
    headingPath: string
    embedding: number[]
  }> = []

  for (const chunk of chunks) {
    const vec = await fetchEmbedding(enrichChunkForEmbedding(title, chunk), cfg)
    if (vec) {
      rows.push({
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        headingPath: chunk.headingPath,
        embedding: vec,
      })
    }
  }

  if (rows.length > 0) {
    await vectorUpsertChunks(projectPath, pageId, rows)
  }
}

export async function embedAllPages(
  projectPath: string,
  cfg: EmbeddingConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!cfg.enabled || !cfg.model) return 0

  const wikiDir = join(projectPath, "wiki")
  const files = listWikiMdFiles(wikiDir).filter((f) => {
    const name = basename(f.path, ".md")
    return !["index", "log", "overview", "purpose", "schema"].includes(name)
  })

  let done = 0
  for (const file of files) {
    try {
      const content = readFileSync(file.path, "utf-8")
      const title = extractFrontmatterTitle(content) || basename(file.path, ".md")
      const pageId = basename(file.path, ".md")
      await embedPage(projectPath, pageId, title, content, cfg)
    } catch {
      // skip
    }
    done++
    onProgress?.(done, files.length)
  }
  return done
}

export interface PageSearchResult {
  id: string
  score: number
  matchedChunks?: Array<{ text: string; headingPath: string; score: number }>
}

export async function searchByEmbedding(
  projectPath: string,
  query: string,
  cfg: EmbeddingConfig,
  topK = 10,
): Promise<PageSearchResult[]> {
  if (!cfg.enabled || !cfg.model) return []

  const queryEmb = await fetchEmbedding(query, cfg)
  if (!queryEmb) return []

  const rawChunks = await vectorSearchChunks(projectPath, queryEmb, Math.max(topK * 3, 30))
  if (rawChunks.length === 0) return []

  const byPage = new Map<string, typeof rawChunks>()
  for (const c of rawChunks) {
    const bucket = byPage.get(c.page_id) ?? []
    bucket.push(c)
    byPage.set(c.page_id, bucket)
  }

  const ranked: PageSearchResult[] = []
  for (const [pageId, chunks] of byPage) {
    chunks.sort((a, b) => b.score - a.score)
    const top = chunks[0].score
    const tail = chunks.slice(1).reduce((sum, c) => sum + c.score, 0)
    ranked.push({
      id: pageId,
      score: top + Math.min(tail * 0.3, Math.max(0, 1 - top)),
      matchedChunks: chunks.slice(0, 3).map((c) => ({
        text: c.chunk_text,
        headingPath: c.heading_path,
        score: c.score,
      })),
    })
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, topK)
}

export { vectorDeletePage, vectorCountChunks }
