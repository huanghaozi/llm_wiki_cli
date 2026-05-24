import { describe, it, expect } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildWikiGraph } from "./wiki-graph.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"

describe("buildWikiGraph", () => {
  it("returns empty arrays for an empty project", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    const graph = buildWikiGraph(root)
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
    expect(graph.communities).toHaveLength(0)
  })

  it("includes entity/concept nodes but drops queries", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    mkdirSync(join(root, "wiki", "queries"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "entities", "alpha.md"),
      `---\ntype: entity\ntitle: Alpha\n---\n# Alpha\nLinks to [[beta]].`,
    )
    writeFileSync(
      join(root, "wiki", "entities", "beta.md"),
      `---\ntype: entity\ntitle: Beta\n---\n# Beta`,
    )
    writeFileSync(
      join(root, "wiki", "queries", "old-question.md"),
      `---\ntype: query\ntitle: Old Question\n---\n# Q\nMentions [[alpha]].`,
    )

    const graph = buildWikiGraph(root)
    const ids = graph.nodes.map((n) => n.id)
    expect(ids).toContain("alpha")
    expect(ids).toContain("beta")
    expect(ids).not.toContain("old-question")
  })

  it("produces edges with weights >= 1", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const graph = buildWikiGraph(root)
    if (graph.edges.length > 0) {
      for (const edge of graph.edges) expect(edge.weight).toBeGreaterThan(0)
    }
  })

  it("dedupes mirrored A->B / B->A links", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "a.md"),
      `---\ntype: entity\ntitle: A\n---\n# A\nSee [[b]].`,
    )
    writeFileSync(
      join(root, "wiki", "b.md"),
      `---\ntype: entity\ntitle: B\n---\n# B\nSee [[a]].`,
    )
    const graph = buildWikiGraph(root)
    expect(graph.edges.length).toBe(1)
  })

  it("resolves wikilinks across different naming styles", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "alpha-entity.md"),
      `---\ntype: entity\ntitle: "Alpha Entity"\n---\n# Alpha\nSee [[Alpha Entity]] and [[alpha-entity]].`,
    )
    writeFileSync(
      join(root, "wiki", "other.md"),
      `---\ntype: entity\ntitle: Other\n---\nLinks to [[Alpha Entity]].`,
    )
    const graph = buildWikiGraph(root)
    const other = graph.nodes.find((n) => n.id === "other")
    expect(other).toBeDefined()
    expect(other?.linkCount).toBeGreaterThan(0)
  })
})
