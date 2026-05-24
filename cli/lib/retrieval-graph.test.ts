import { describe, it, expect } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildRetrievalGraph, getRelatedNodes } from "./retrieval-graph.js"
import { calculateRelevance } from "./graph-relevance.js"
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

  it("reads sources from frontmatter for sourceOverlap signal", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "entities", "a.md"),
      `---
type: entity
title: A
sources: ["papers/intro.pdf"]
---
A page.`,
    )
    writeFileSync(
      join(root, "wiki", "entities", "b.md"),
      `---
type: entity
title: B
sources:
  - "papers/intro.pdf"
---
B page.`,
    )
    const graph = buildRetrievalGraph(root)
    const a = graph.nodes.get("entities/a")
    const b = graph.nodes.get("entities/b")
    expect(a?.sources).toContain("papers/intro.pdf")
    expect(b?.sources).toContain("papers/intro.pdf")
    if (a && b) {
      const rel = calculateRelevance(a, b, graph)
      // sourceOverlap weight (4) + type affinity (entity/entity = 0.8 → 0.8*1)
      // = 4 + 0.8 = 4.8, plus there is no direct link → ~4.8
      expect(rel).toBeGreaterThan(4)
    }
  })

  it("sourceOverlap signal boosts related ranking", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    mkdirSync(join(root, "wiki", "concepts"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "entities", "shared-a.md"),
      `---\ntype: entity\ntitle: A\nsources: ["paper.pdf"]\n---\n`,
    )
    writeFileSync(
      join(root, "wiki", "entities", "shared-b.md"),
      `---\ntype: entity\ntitle: B\nsources: ["paper.pdf"]\n---\n`,
    )
    writeFileSync(
      join(root, "wiki", "concepts", "unrelated.md"),
      `---\ntype: concept\ntitle: U\nsources: ["other.pdf"]\n---\n`,
    )
    const graph = buildRetrievalGraph(root)
    const related = getRelatedNodes("entities/shared-a", graph, 5)
    expect(related.length).toBeGreaterThan(0)
    expect(related[0].node.id).toBe("entities/shared-b")
  })
})
