import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import Graph from "graphology"
import louvain from "graphology-communities-louvain"
import { listWikiMdFiles, extractFrontmatterTitle, extractWikilinks } from "./wiki-files.js"
import { buildRetrievalGraph } from "./retrieval-graph.js"
import { calculateRelevance } from "./graph-relevance.js"

export interface GraphNode {
  id: string
  label: string
  type: string
  path: string
  relPath: string
  linkCount: number
  community: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

export interface CommunityInfo {
  id: number
  nodeCount: number
  cohesion: number
  topNodes: string[]
}

function extractType(content: string): string {
  const m = content.match(/^type:\s*["']?(.+?)["']?\s*$/m)
  return m ? m[1].trim().toLowerCase() : "other"
}

function extractTitle(content: string, fileName: string): string {
  return extractFrontmatterTitle(content) || fileName.replace(/\.md$/, "").replace(/-/g, " ")
}

function fileNameToId(fileName: string): string {
  return basename(fileName, ".md")
}

function resolveTarget(raw: string, nodeMap: Map<string, { id: string }>): string | null {
  if (nodeMap.has(raw)) return raw
  const normalized = raw.toLowerCase().replace(/\s+/g, "-")
  for (const id of nodeMap.keys()) {
    if (id.toLowerCase() === normalized) return id
    if (id.toLowerCase() === raw.toLowerCase()) return id
    if (id.toLowerCase().replace(/\s+/g, "-") === normalized) return id
    if (basename(id).toLowerCase() === normalized) return id
  }
  return null
}

function detectCommunities(
  nodes: { id: string; label: string; linkCount: number }[],
  edges: GraphEdge[],
): { assignments: Map<string, number>; communities: CommunityInfo[] } {
  if (nodes.length === 0) return { assignments: new Map(), communities: [] }

  const g = new Graph({ type: "undirected" })
  for (const node of nodes) g.addNode(node.id)
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      const key = `${edge.source}->${edge.target}`
      if (!g.hasEdge(key) && !g.hasEdge(`${edge.target}->${edge.source}`)) {
        g.addEdgeWithKey(key, edge.source, edge.target, { weight: edge.weight })
      }
    }
  }

  const communityMap: Record<string, number> = louvain(g, { resolution: 1 })
  const assignments = new Map(Object.entries(communityMap).map(([k, v]) => [k, v as number]))

  const groups = new Map<number, string[]>()
  for (const [nodeId, commId] of assignments) {
    const list = groups.get(commId) ?? []
    list.push(nodeId)
    groups.set(commId, list)
  }

  const edgeSet = new Set<string>()
  for (const edge of edges) {
    edgeSet.add(`${edge.source}:::${edge.target}`)
    edgeSet.add(`${edge.target}:::${edge.source}`)
  }

  const nodeInfo = new Map(nodes.map((n) => [n.id, { label: n.label, linkCount: n.linkCount }]))
  const communities: CommunityInfo[] = []

  for (const [commId, memberIds] of groups) {
    let intraEdges = 0
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        if (edgeSet.has(`${memberIds[i]}:::${memberIds[j]}`)) intraEdges++
      }
    }
    const n = memberIds.length
    const possibleEdges = n > 1 ? (n * (n - 1)) / 2 : 1
    const cohesion = intraEdges / possibleEdges
    const sorted = [...memberIds].sort(
      (a, b) => (nodeInfo.get(b)?.linkCount ?? 0) - (nodeInfo.get(a)?.linkCount ?? 0),
    )
    communities.push({
      id: commId,
      nodeCount: n,
      cohesion,
      topNodes: sorted.slice(0, 5).map((id) => nodeInfo.get(id)?.label ?? id),
    })
  }

  communities.sort((a, b) => b.nodeCount - a.nodeCount)
  const idRemap = new Map<number, number>()
  communities.forEach((c, idx) => {
    idRemap.set(c.id, idx)
    c.id = idx
  })
  for (const [nodeId, oldId] of assignments) {
    assignments.set(nodeId, idRemap.get(oldId) ?? 0)
  }

  return { assignments, communities }
}

export function buildWikiGraph(projectPath: string): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities: CommunityInfo[]
} {
  const wikiDir = join(projectPath, "wiki")
  const mdFiles = listWikiMdFiles(wikiDir)
  if (mdFiles.length === 0) return { nodes: [], edges: [], communities: [] }

  const nodeMap = new Map<string, {
    id: string
    label: string
    type: string
    path: string
    relPath: string
    links: string[]
  }>()

  for (const file of mdFiles) {
    const id = file.relPath.replace(/\.md$/, "").split("/").pop() ?? fileNameToId(file.name)
    try {
      const content = readFileSync(file.path, "utf-8")
      nodeMap.set(id, {
        id,
        label: extractTitle(content, file.name),
        type: extractType(content),
        path: file.path,
        relPath: file.relPath,
        links: extractWikilinks(content),
      })
    } catch {
      // skip
    }
  }

  for (const [id, node] of nodeMap) {
    if (node.type === "query") nodeMap.delete(id)
  }

  const linkCounts = new Map<string, number>()
  for (const id of nodeMap.keys()) linkCounts.set(id, 0)

  const rawEdges: GraphEdge[] = []
  for (const [sourceId, nodeData] of nodeMap) {
    for (const targetRaw of nodeData.links) {
      const targetId = resolveTarget(targetRaw, nodeMap)
      if (!targetId || targetId === sourceId) continue
      rawEdges.push({ source: sourceId, target: targetId, weight: 1 })
      linkCounts.set(sourceId, (linkCounts.get(sourceId) ?? 0) + 1)
      linkCounts.set(targetId, (linkCounts.get(targetId) ?? 0) + 1)
    }
  }

  const seenEdges = new Set<string>()
  const dedupedEdges: { source: string; target: string }[] = []
  for (const edge of rawEdges) {
    const key = `${edge.source}:::${edge.target}`
    const reverseKey = `${edge.target}:::${edge.source}`
    if (!seenEdges.has(key) && !seenEdges.has(reverseKey)) {
      seenEdges.add(key)
      dedupedEdges.push(edge)
    }
  }

  const retrievalGraph = buildRetrievalGraph(projectPath)
  const edges: GraphEdge[] = dedupedEdges.map((e) => {
    let weight = 1
    const nodeA = retrievalGraph.nodes.get(e.source)
    const nodeB = retrievalGraph.nodes.get(e.target)
    if (nodeA && nodeB) weight = calculateRelevance(nodeA, nodeB, retrievalGraph)
    return { source: e.source, target: e.target, weight }
  })

  const prelimNodes = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    linkCount: linkCounts.get(n.id) ?? 0,
  }))

  const { assignments, communities } = detectCommunities(prelimNodes, edges)

  const nodes: GraphNode[] = Array.from(nodeMap.values()).map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    path: n.path,
    relPath: n.relPath,
    linkCount: linkCounts.get(n.id) ?? 0,
    community: assignments.get(n.id) ?? 0,
  }))

  return { nodes, edges, communities }
}
