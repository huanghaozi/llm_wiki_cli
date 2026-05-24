import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  fetchEmbedding,
  getLastEmbeddingError,
  embedPage,
  embedAllPages,
  searchByEmbedding,
} from "./embedding.js"
import type { EmbeddingConfig } from "../types/cli.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import * as vectorStore from "./vector-store.js"

const openAiCfg: EmbeddingConfig = {
  enabled: true,
  endpoint: "https://api.openai.com/v1/embeddings",
  apiKey: "key",
  model: "text-embedding-3-small",
  maxChunkChars: 500,
  overlapChunkChars: 50,
}

describe("embedding", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns null when disabled", async () => {
    expect(await fetchEmbedding("hello", { ...openAiCfg, enabled: false })).toBeNull()
    expect(await fetchEmbedding("hello", { ...openAiCfg, model: "" })).toBeNull()
  })

  it("parses OpenAI embedding response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    }))
    expect(await fetchEmbedding("hello", openAiCfg)).toEqual([0.1, 0.2, 0.3])
    expect(getLastEmbeddingError()).toBeNull()
  })

  it("parses Google embedding response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.5, 0.6] } }),
    }))
    const vec = await fetchEmbedding("hello", {
      ...openAiCfg,
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      model: "text-embedding-004",
      outputDimensionality: 768,
    })
    expect(vec).toEqual([0.5, 0.6])
  })

  it("retries with shorter text on token limit errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "input too long exceeds token limit",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: [1] }] }),
      })
    vi.stubGlobal("fetch", fetchMock)
    const longText = "word ".repeat(200)
    expect(await fetchEmbedding(longText, openAiCfg)).toEqual([1])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("records error on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }))
    expect(await fetchEmbedding("hello", openAiCfg)).toBeNull()
    expect(getLastEmbeddingError()).toContain("401")
  })

  it("embedPage upserts chunks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    }))
    const upsert = vi.spyOn(vectorStore, "vectorUpsertChunks").mockResolvedValue(undefined)
    const root = createTempDir()
    await embedPage(root, "alpha-entity", "Alpha", "# Alpha\n\nBody text here.", openAiCfg)
    expect(upsert).toHaveBeenCalled()
  })

  it("embedAllPages iterates wiki files", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1] }] }),
    }))
    vi.spyOn(vectorStore, "vectorUpsertChunks").mockResolvedValue(undefined)
    const root = createTempDir()
    createMinimalWikiProject(root)
    const progress: number[] = []
    const count = await embedAllPages(root, openAiCfg, (done, total) => progress.push(done / total))
    expect(count).toBeGreaterThan(0)
    expect(progress.length).toBeGreaterThan(0)
  })

  it("searchByEmbedding ranks pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    }))
    vi.spyOn(vectorStore, "vectorSearchChunks").mockResolvedValue([
      { page_id: "alpha-entity", chunk_index: 0, chunk_text: "t", heading_path: "", score: 0.9 },
      { page_id: "beta-concept", chunk_index: 0, chunk_text: "t2", heading_path: "", score: 0.5 },
    ])
    const root = createTempDir()
    const hits = await searchByEmbedding(root, "alpha", openAiCfg, 5)
    expect(hits[0].id).toBe("alpha-entity")
    expect(hits[0].matchedChunks?.length).toBeGreaterThan(0)
  })

  it("searchByEmbedding returns empty when query embedding fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" }))
    const root = createTempDir()
    expect(await searchByEmbedding(root, "q", openAiCfg)).toEqual([])
  })
})
