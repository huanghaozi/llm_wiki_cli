import type { RetrievalGraph, RetrievalNode } from "./retrieval-graph.js"

const WEIGHTS = {
  directLink: 3.0,
  // Two pages drawing on the same source(s) are very likely to be
  // discussed together. This is the heaviest signal in the GUI's
  // relevance model and the CLI was missing it entirely.
  sourceOverlap: 4.0,
  commonNeighbor: 1.5,
  typeAffinity: 1.0,
} as const

const TYPE_AFFINITY: Record<string, Record<string, number>> = {
  entity: { concept: 1.2, entity: 0.8, source: 1.0, synthesis: 1.0, query: 0.8 },
  concept: { entity: 1.2, concept: 0.8, source: 1.0, synthesis: 1.2, query: 1.0 },
  source: { entity: 1.0, concept: 1.0, source: 0.5, query: 0.8, synthesis: 1.0 },
  query: { concept: 1.0, entity: 0.8, synthesis: 1.0, source: 0.8, query: 0.5 },
  synthesis: { concept: 1.2, entity: 1.0, source: 1.0, query: 1.0, synthesis: 0.8 },
}

function getNeighbors(node: RetrievalNode): Set<string> {
  return new Set([...node.outLinks, ...node.inLinks])
}

function getNodeDegree(node: RetrievalNode): number {
  return node.outLinks.size + node.inLinks.size
}

export function calculateRelevance(
  nodeA: RetrievalNode,
  nodeB: RetrievalNode,
  graph: RetrievalGraph,
): number {
  if (nodeA.id === nodeB.id) return 0

  const forwardLinks = nodeA.outLinks.has(nodeB.id) ? 1 : 0
  const backwardLinks = nodeB.outLinks.has(nodeA.id) ? 1 : 0
  const directLinkScore = (forwardLinks + backwardLinks) * WEIGHTS.directLink

  const neighborsA = getNeighbors(nodeA)
  const neighborsB = getNeighbors(nodeB)
  let adamicAdar = 0
  for (const neighborId of neighborsA) {
    if (neighborsB.has(neighborId)) {
      const neighbor = graph.nodes.get(neighborId)
      if (neighbor) {
        adamicAdar += 1 / Math.log(Math.max(getNodeDegree(neighbor), 2))
      }
    }
  }
  const commonNeighborScore = adamicAdar * WEIGHTS.commonNeighbor

  let sourceOverlapScore = 0
  if (nodeA.sources.length > 0 && nodeB.sources.length > 0) {
    const setA = new Set(nodeA.sources)
    let shared = 0
    for (const s of nodeB.sources) {
      if (setA.has(s)) shared++
    }
    sourceOverlapScore = shared * WEIGHTS.sourceOverlap
  }

  const affinityMap = TYPE_AFFINITY[nodeA.type]
  const typeAffinityScore = (affinityMap?.[nodeB.type] ?? 0.5) * WEIGHTS.typeAffinity

  return directLinkScore + sourceOverlapScore + commonNeighborScore + typeAffinityScore
}
