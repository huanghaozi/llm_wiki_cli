import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import {
  vectorUpsertChunks,
  vectorSearchChunks,
  vectorCountChunks,
  vectorDeletePage,
} from "../lib/vector-store.js"

describe("vector-store integration", () => {
  it("upserts and searches chunks via LanceDB", async () => {
    const root = createTempDir()
    createMinimalWikiProject(root)

    await vectorUpsertChunks(root, "alpha", [
      {
        chunkIndex: 0,
        chunkText: "Alpha entity content about machine learning",
        headingPath: "## Intro",
        embedding: [1, 0, 0],
      },
      {
        chunkIndex: 1,
        chunkText: "Secondary chunk about neural networks",
        headingPath: "## Details",
        embedding: [0.9, 0.1, 0],
      },
    ])

    expect(await vectorCountChunks(root)).toBe(2)

    const hits = await vectorSearchChunks(root, [1, 0, 0], 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].page_id).toBe("alpha")

    await vectorUpsertChunks(root, "alpha", [
      {
        chunkIndex: 0,
        chunkText: "Updated alpha content",
        headingPath: "",
        embedding: [1, 0, 0],
      },
    ])
    expect(await vectorCountChunks(root)).toBe(1)

    await vectorDeletePage(root, "alpha")
    expect(await vectorCountChunks(root)).toBe(0)
  }, 30_000)
})
