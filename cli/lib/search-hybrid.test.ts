import { describe, it, expect, vi, beforeEach } from "vitest"
import { hybridSearchWikiPages } from "./search-engine.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import * as embedding from "./embedding.js"

describe("hybrid search", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns keyword mode when embedding disabled", async () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const { mode, results } = await hybridSearchWikiPages(root, "Alpha", 10)
    expect(mode).toBe("keyword")
    expect(results.length).toBeGreaterThan(0)
  })

  it("merges keyword and vector results when embedding hits exist", async () => {
    const root = createTempDir()
    createMinimalWikiProject(root)

    vi.spyOn(embedding, "searchByEmbedding").mockResolvedValue([
      {
        id: "alpha-entity",
        score: 0.9,
        matchedChunks: [{ text: "vector chunk", headingPath: "", score: 0.9 }],
      },
    ])

    const { mode, results } = await hybridSearchWikiPages(root, "Alpha", 10, {
      enabled: true,
      endpoint: "http://localhost",
      apiKey: "k",
      model: "m",
    })
    expect(mode).toBe("hybrid")
    expect(results.length).toBeGreaterThan(0)
  })

  it("returns vector-only results when keyword misses", async () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    vi.spyOn(embedding, "searchByEmbedding").mockResolvedValue([
      {
        id: "alpha-entity",
        score: 0.8,
        matchedChunks: [{ text: "vector only", headingPath: "", score: 0.8 }],
      },
    ])
    const { mode, results } = await hybridSearchWikiPages(root, "zzzznonexistent", 10, {
      enabled: true,
      endpoint: "http://localhost",
      apiKey: "k",
      model: "m",
    })
    expect(mode).toBe("vector")
    expect(results.length).toBeGreaterThan(0)
  })
})
