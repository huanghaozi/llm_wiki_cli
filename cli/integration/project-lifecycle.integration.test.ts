import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import { runStructuralLint } from "../lib/lint-engine.js"
import { searchWikiPages } from "../lib/search-engine.js"
import { buildRetrievalGraph } from "../lib/retrieval-graph.js"
import { listWikiMdFiles } from "../lib/wiki-files.js"

describe("CLI integration — demo project", () => {
  it("runs full read-only pipeline on fixture project", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)

    const pages = listWikiMdFiles(join(root, "wiki"))
    expect(pages.length).toBeGreaterThanOrEqual(3)

    const search = searchWikiPages(root, "Alpha")
    expect(search.length).toBeGreaterThan(0)

    const graph = buildRetrievalGraph(root)
    expect(graph.nodes.size).toBeGreaterThan(0)

    const lint = runStructuralLint(join(root, "wiki"))
    expect(lint.some((r) => r.type === "orphan")).toBe(true)

    const purpose = readFileSync(join(root, "purpose.md"), "utf-8")
    expect(purpose).toContain("demo")
  })
})
