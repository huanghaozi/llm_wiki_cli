import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import {
  listWikiMdFiles,
  extractFrontmatterTitle,
  extractWikilinks,
} from "./wiki-files.js"

export interface RetrievalNode {
  id: string
  title: string
  type: string
  path: string
  relPath: string
  outLinks: Set<string>
  inLinks: Set<string>
}

export interface RetrievalGraph {
  nodes: Map<string, RetrievalNode>
}

const TYPE_AFFINITY: Record<string, Record<string, number>> = {
  entity: { concept: 1.2, entity: 0.8, source: 1.0, synthesis: 1.0, query: 0.8 },
  concept: { entity: 1.2, concept: 0.8, source: 1.0, synthesis: 1.2, query: 1.0 },
  source: { entity: 1.0, concept: 1.0, source: 0.5, query: 0.8, synthesis: 1.0 },
  query: { concept: 1.0, entity: 0.8, synthesis: 1.0, source: 0.8, query: 0.5 },
  synthesis: { concept: 1.2, entity: 1.0, source: 1.0, query: 1.0, synthesis: 0.8 },
}

function extractFrontmatterType(content: string): string {
  const m = content.match(/^type:\s*["']?(.+?)["']?\s*$/m)
  return m ? m[1].trim() : "unknown"
}

function resolveLinkToId(link: string, slugToId: Map<string, string>): string | null {
  const key = link.toLowerCase()
  const basenameKey = basename(link).replace(/\.md$/, "").toLowerCase()
  return slugToId.get(key) ?? slugToId.get(basenameKey) ?? null
}

export function buildRetrievalGraph(projectPath: string): RetrievalGraph {
  const wikiDir = join(projectPath, "wiki")
  const files = listWikiMdFiles(wikiDir)
  const slugToId = new Map<string, string>()

  for (const f of files) {
    const id = f.relPath.replace(/\.md$/, "")
    slugToId.set(id.toLowerCase(), id)
    slugToId.set(basename(f.path).replace(/\.md$/, "").toLowerCase(), id)
  }

  const nodes = new Map<string, RetrievalNode>()

  for (const f of files) {
    const id = f.relPath.replace(/\.md$/, "")
    try {
      const content = readFileSync(f.path, "utf-8")
      nodes.set(id, {
        id,
        title: extractFrontmatterTitle(content) || basename(f.path).replace(/\.md$/, ""),
        type: extractFrontmatterType(content),
        path: f.path,
        relPath: f.relPath,
        outLinks: new Set(),
        inLinks: new Set(),
      })
    } catch {
      // skip
    }
  }

  for (const f of files) {
    const id = f.relPath.replace(/\.md$/, "")
    const node = nodes.get(id)
    if (!node) continue
    try {
      const content = readFileSync(f.path, "utf-8")
      for (const link of extractWikilinks(content)) {
        const targetId = resolveLinkToId(link, slugToId)
        if (!targetId || targetId === id) continue
        node.outLinks.add(targetId)
        const target = nodes.get(targetId)
        if (target) target.inLinks.add(id)
      }
    } catch {
      // skip
    }
  }

  return { nodes }
}

export function getRelatedNodes(
  nodeId: string,
  graph: RetrievalGraph,
  limit = 5,
): Array<{ node: RetrievalNode; relevance: number }> {
  const source = graph.nodes.get(nodeId)
  if (!source) return []

  const scores = new Map<string, number>()

  for (const outId of source.outLinks) {
    scores.set(outId, (scores.get(outId) ?? 0) + 3.0)
  }
  for (const inId of source.inLinks) {
    scores.set(inId, (scores.get(inId) ?? 0) + 3.0)
  }

  for (const neighborId of [...source.outLinks, ...source.inLinks]) {
    const neighbor = graph.nodes.get(neighborId)
    if (!neighbor) continue
    for (const n2 of neighbor.outLinks) {
      if (n2 !== nodeId) scores.set(n2, (scores.get(n2) ?? 0) + 1.5)
    }
    for (const n2 of neighbor.inLinks) {
      if (n2 !== nodeId) scores.set(n2, (scores.get(n2) ?? 0) + 1.5)
    }
  }

  for (const [id, base] of scores) {
    const target = graph.nodes.get(id)
    if (!target) continue
    const affinity = TYPE_AFFINITY[source.type]?.[target.type] ?? 1.0
    scores.set(id, base * affinity)
  }

  const ranked: Array<{ node: RetrievalNode; relevance: number }> = []
  for (const [id, relevance] of scores) {
    const node = graph.nodes.get(id)
    if (node) ranked.push({ node, relevance })
  }
  ranked.sort((a, b) => b.relevance - a.relevance)
  return ranked.slice(0, limit)
}
