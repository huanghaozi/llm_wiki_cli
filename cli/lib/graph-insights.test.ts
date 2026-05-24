import { describe, it, expect } from "vitest"
import { findSurprisingConnections, detectKnowledgeGaps } from "./graph-insights.js"
import type { GraphNode, GraphEdge, CommunityInfo } from "./wiki-graph.js"

function node(over: Partial<GraphNode>): GraphNode {
  return {
    id: over.id ?? "n",
    label: over.label ?? "Node",
    type: over.type ?? "entity",
    path: over.path ?? "",
    relPath: over.relPath ?? "",
    linkCount: over.linkCount ?? 1,
    community: over.community ?? 0,
  }
}

describe("findSurprisingConnections", () => {
  it("returns empty array when no edges qualify", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" })]
    const edges: GraphEdge[] = []
    expect(findSurprisingConnections(nodes, edges, [])).toEqual([])
  })

  it("scores cross-community edges higher", () => {
    const nodes = [
      node({ id: "a", linkCount: 5, community: 0, type: "concept" }),
      node({ id: "b", linkCount: 1, community: 1, type: "source" }),
    ]
    const edges: GraphEdge[] = [{ source: "a", target: "b", weight: 1 }]
    const results = findSurprisingConnections(nodes, edges, [])
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].reasons.join(" ")).toMatch(/community boundary/)
  })

  it("excludes structural pages (index/log/overview)", () => {
    const nodes = [
      node({ id: "index", community: 0 }),
      node({ id: "a", community: 1 }),
    ]
    const edges: GraphEdge[] = [{ source: "index", target: "a", weight: 1 }]
    expect(findSurprisingConnections(nodes, edges, [])).toHaveLength(0)
  })

  it("honors the limit", () => {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    for (let i = 0; i < 10; i++) {
      nodes.push(node({ id: `c${i}`, linkCount: 5, community: 0, type: "concept" }))
      nodes.push(node({ id: `s${i}`, linkCount: 1, community: 1, type: "source" }))
      edges.push({ source: `c${i}`, target: `s${i}`, weight: 1 })
    }
    const limit = 3
    const results = findSurprisingConnections(nodes, edges, [], limit)
    expect(results.length).toBeLessThanOrEqual(limit)
  })
})

describe("detectKnowledgeGaps", () => {
  it("flags isolated nodes", () => {
    const nodes = [
      node({ id: "a", linkCount: 0 }),
      node({ id: "b", linkCount: 5 }),
    ]
    const gaps = detectKnowledgeGaps(nodes, [], [])
    expect(gaps.some((g) => g.type === "isolated-node")).toBe(true)
  })

  it("flags sparse communities", () => {
    const nodes = Array.from({ length: 4 }, (_, i) =>
      node({ id: `n${i}`, community: 0 }),
    )
    const communities: CommunityInfo[] = [
      { id: 0, nodeCount: 4, cohesion: 0.05, topNodes: ["n0"] },
    ]
    const gaps = detectKnowledgeGaps(nodes, [], communities)
    expect(gaps.some((g) => g.type === "sparse-community")).toBe(true)
  })

  it("flags bridge nodes connecting >= 3 communities", () => {
    const nodes = [
      node({ id: "hub", linkCount: 4, community: 0 }),
      node({ id: "x", community: 1 }),
      node({ id: "y", community: 2 }),
      node({ id: "z", community: 3 }),
    ]
    const edges: GraphEdge[] = [
      { source: "hub", target: "x", weight: 1 },
      { source: "hub", target: "y", weight: 1 },
      { source: "hub", target: "z", weight: 1 },
    ]
    const gaps = detectKnowledgeGaps(nodes, edges, [])
    expect(gaps.some((g) => g.type === "bridge-node")).toBe(true)
  })

  it("respects the limit", () => {
    const isolatedNodes: GraphNode[] = []
    for (let i = 0; i < 20; i++) {
      isolatedNodes.push(node({ id: `iso${i}`, linkCount: 0 }))
    }
    const gaps = detectKnowledgeGaps(isolatedNodes, [], [], 2)
    expect(gaps.length).toBeLessThanOrEqual(2)
  })
})
