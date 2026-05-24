import { describe, it, expect } from "vitest"
import { buildRetrievalGraph, getRelatedNodes } from "./retrieval-graph.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"

describe("retrieval-graph", () => {
  it("builds graph with links", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const graph = buildRetrievalGraph(root)
    expect(graph.nodes.size).toBeGreaterThan(0)
    const alpha = [...graph.nodes.values()].find((n) => n.id.includes("alpha"))
    expect(alpha?.outLinks.size).toBeGreaterThan(0)
  })

  it("finds two-hop related nodes", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const graph = buildRetrievalGraph(root)
    const beta = [...graph.nodes.keys()].find((k) => k.includes("beta-concept"))
    if (!beta) throw new Error("beta missing")
    const related = getRelatedNodes(beta, graph, 5)
    expect(related.some((r) => r.node.id.includes("alpha"))).toBe(true)
  })
})
