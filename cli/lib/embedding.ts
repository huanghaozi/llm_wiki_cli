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

export async function fetchEmbedding(text: string, cfg: EmbeddingConfig): Promise<number[] | null> {
  if (!cfg.enabled || !cfg.endpoint || !cfg.model) return null

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  let endpoint = cfg.endpoint
  let body: unknown

  if (isGoogleEndpoint(cfg.endpoint)) {
    if (cfg.apiKey) headers["x-goog-api-key"] = cfg.apiKey
    const model = cfg.model.startsWith("models/") ? cfg.model : `models/${cfg.model}`
    endpoint = cfg.endpoint.includes(":embedContent")
      ? cfg.endpoint
      : `${cfg.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(model.replace(/^models\//, "models/"))}:embedContent`
    body = {
      model,
      content: { parts: [{ text }] },
      ...(cfg.outputDimensionality ? { output_dimensionality: cfg.outputDimensionality } : {}),
    }
  } else {
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
    body = { model: cfg.model, input: text }
  }

  let current = text
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(isGoogleEndpoint(cfg.endpoint) ? body : { model: cfg.model, input: current }),
      })
      if (!resp.ok) {
        const errText = await resp.text()
        if (current.length > 64 && /too long|context|token|exceeds/i.test(errText)) {
          current = current.slice(0, Math.floor(current.length / 2))
          continue
        }
        lastEmbeddingError = `Embedding API ${resp.status}: ${errText.slice(0, 200)}`
        return null
      }
      const data = await resp.json()
      const embedding = isGoogleEndpoint(cfg.endpoint)
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
