import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import {
  listWikiMdFiles,
  extractFrontmatterTitle,
  extractBody,
  type WikiPageFile,
} from "./wiki-files.js"

const STOP_WORDS = new Set([
  "的", "是", "了", "什么", "在", "有", "和", "与", "对", "从",
  "the", "is", "a", "an", "what", "how", "are", "was", "were",
  "do", "does", "did", "be", "been", "being", "have", "has", "had",
  "it", "its", "in", "on", "at", "to", "for", "of", "with", "by",
  "this", "that", "these", "those",
])

export interface SearchResult {
  path: string
  relPath: string
  title: string
  snippet: string
  titleMatch: boolean
  score: number
  vectorScore?: number
  mode?: "keyword" | "vector" | "hybrid"
}

const RRF_K = 60

function buildPageIdMap(wikiDir: string): Map<string, WikiPageFile> {
  const map = new Map<string, WikiPageFile>()
  for (const page of listWikiMdFiles(wikiDir)) {
    const id = basename(page.path, ".md").toLowerCase()
    if (!map.has(id)) map.set(id, page)
  }
  return map
}

export async function hybridSearchWikiPages(
  projectPath: string,
  query: string,
  topK = 20,
  embeddingCfg?: import("../types/cli.js").EmbeddingConfig,
): Promise<{ mode: "keyword" | "vector" | "hybrid"; results: SearchResult[] }> {
  const keywordResults = searchWikiPages(projectPath, query, topK)

  let vectorResults: SearchResult[] = []
  if (embeddingCfg?.enabled && embeddingCfg.model) {
    const { searchByEmbedding } = await import("./embedding.js")
    const wikiDir = join(projectPath, "wiki")
    const pageMap = buildPageIdMap(wikiDir)
    const vectorHits = await searchByEmbedding(projectPath, query, embeddingCfg, topK)

    for (const hit of vectorHits) {
      const page = pageMap.get(hit.id.toLowerCase())
      if (!page) continue
      try {
        const content = readFileSync(page.path, "utf-8")
        const title = extractFrontmatterTitle(content) || basename(page.path, ".md")
        const body = extractBody(content)
        const chunkPreview = hit.matchedChunks?.[0]?.text ?? body
        vectorResults.push({
          path: page.path,
          relPath: page.relPath,
          title,
          snippet: chunkPreview.slice(0, 200).replace(/\n/g, " "),
          titleMatch: false,
          score: hit.score * 100,
          vectorScore: hit.score,
        })
      } catch {
        // skip
      }
    }
  }

  if (vectorResults.length === 0) {
    return { mode: "keyword", results: keywordResults }
  }
  if (keywordResults.length === 0) {
    return { mode: "vector", results: vectorResults.slice(0, topK) }
  }

  const fused = new Map<string, SearchResult & { rrf: number }>()
  keywordResults.forEach((r, rank) => {
    fused.set(r.path, { ...r, rrf: 1 / (RRF_K + rank + 1), mode: "hybrid" })
  })
  vectorResults.forEach((r, rank) => {
    const existing = fused.get(r.path)
    const vectorRrf = 1 / (RRF_K + rank + 1)
    if (existing) {
      existing.rrf += vectorRrf
      existing.vectorScore = r.vectorScore
      existing.mode = "hybrid"
    } else {
      fused.set(r.path, { ...r, rrf: vectorRrf, mode: "hybrid" })
    }
  })

  const merged = [...fused.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .map(({ rrf, ...r }) => ({ ...r, score: rrf * 1000 }))
    .slice(0, topK)

  return { mode: "hybrid", results: merged }
}


export function tokenizeQuery(query: string): string[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !STOP_WORDS.has(t))

  const tokens: string[] = []
  for (const token of rawTokens) {
    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(token)
    if (hasCJK && token.length > 2) {
      const chars = [...token]
      for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1])
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) tokens.push(ch)
      }
      tokens.push(token)
    } else {
      tokens.push(token)
    }
  }
  return [...new Set(tokens)]
}

function trimQueryPunctuation(query: string): string {
  return query.replace(/^[\s"'「」『』]+|[\s"'「」『』.,，。！？!?]+$/g, "").trim()
}

function buildSnippet(body: string, queryPhrase: string, tokens: string[]): string {
  const lower = body.toLowerCase()
  let idx = queryPhrase ? lower.indexOf(queryPhrase.toLowerCase()) : -1
  if (idx < 0 && tokens.length > 0) {
    for (const t of tokens) {
      idx = lower.indexOf(t)
      if (idx >= 0) break
    }
  }
  if (idx < 0) return body.slice(0, 160).replace(/\n/g, " ")
  const start = Math.max(0, idx - 60)
  return body.slice(start, start + 200).replace(/\n/g, " ")
}

function scorePage(
  page: WikiPageFile,
  content: string,
  title: string,
  tokens: string[],
  queryPhrase: string,
): SearchResult | null {
  const body = extractBody(content)
  const titleLower = title.toLowerCase()
  const bodyLower = body.toLowerCase()
  const fileStem = basename(page.path).replace(/\.md$/, "").toLowerCase()

  let score = 0
  let titleMatch = false

  if (queryPhrase && titleLower.includes(queryPhrase.toLowerCase())) {
    score += 200
    titleMatch = true
  }
  if (queryPhrase && fileStem.includes(queryPhrase.toLowerCase().replace(/\s+/g, "-"))) {
    score += 150
    titleMatch = true
  }

  for (const token of tokens) {
    const titleHits = (titleLower.match(new RegExp(escapeRegex(token), "g")) || []).length
    const bodyHits = (bodyLower.match(new RegExp(escapeRegex(token), "g")) || []).length
    if (titleHits > 0) titleMatch = true
    score += titleHits * 10 + bodyHits * 2
  }

  if (queryPhrase) {
    const phraseInTitle = titleLower.includes(queryPhrase.toLowerCase())
    const phraseInBody = bodyLower.includes(queryPhrase.toLowerCase())
    if (phraseInTitle) score += 50
    if (phraseInBody) {
      const occ = Math.min(10, (bodyLower.match(new RegExp(escapeRegex(queryPhrase.toLowerCase()), "g")) || []).length)
      score += occ * 20
    }
  }

  if (score <= 0) return null

  return {
    path: page.path,
    relPath: page.relPath,
    title,
    snippet: buildSnippet(body, queryPhrase, tokens),
    titleMatch,
    score,
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function searchWikiPages(projectPath: string, query: string, topK = 20): SearchResult[] {
  const wikiDir = join(projectPath, "wiki")
  const pages = listWikiMdFiles(wikiDir)
  const tokens = tokenizeQuery(query)
  const queryPhrase = trimQueryPunctuation(query.toLowerCase())
  const effectiveTokens = tokens.length > 0 ? tokens : [query.trim().toLowerCase()].filter(Boolean)

  const results: SearchResult[] = []
  for (const page of pages) {
    try {
      const content = readFileSync(page.path, "utf-8")
      const title = extractFrontmatterTitle(content) || page.name.replace(/\.md$/, "")
      const result = scorePage(page, content, title, effectiveTokens, queryPhrase)
      if (result) results.push(result)
    } catch {
      // skip unreadable
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}
