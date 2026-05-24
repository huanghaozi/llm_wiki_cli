import chalk from "chalk"
import { join } from "node:path"
import { fileExists } from "../lib/fs-adapter.js"
import { buildWikiGraph } from "../lib/wiki-graph.js"
import {
  findSurprisingConnections,
  detectKnowledgeGaps,
} from "../lib/graph-insights.js"

interface GraphOptions {
  projectPath?: string
  format?: "text" | "json"
  insights?: boolean
  research?: boolean
}

export async function graphCommand(options: GraphOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!fileExists(wikiDir)) {
    console.log(chalk.red("No wiki found. Run 'llm-wiki init' first."))
    return
  }

  const { nodes, edges, communities } = buildWikiGraph(projectPath)

  if (nodes.length === 0) {
    console.log(chalk.yellow("No wiki pages found."))
    return
  }

  if (options.format === "json") {
    const payload = {
      nodes,
      edges,
      communities,
      ...(options.insights ? {
        surprising: findSurprisingConnections(nodes, edges, communities),
        gaps: detectKnowledgeGaps(nodes, edges, communities),
      } : {}),
    }
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(chalk.bold("\nKnowledge Graph (4-signal weighted)\n"))
  console.log(`Pages: ${chalk.cyan(nodes.length)}`)
  console.log(`Edges: ${chalk.cyan(edges.length)}`)
  console.log(`Communities: ${chalk.cyan(communities.length)}\n`)

  if (options.insights) {
    printFullInsights(nodes, edges, communities, options.research)
    return
  }

  console.log(chalk.bold("Top connected pages:\n"))
  const sorted = [...nodes].sort((a, b) => b.linkCount - a.linkCount)
  for (const node of sorted.slice(0, 15)) {
    console.log(`  ${chalk.cyan(node.label)} ${chalk.dim(`(${node.type}, ${node.linkCount} links, cluster ${node.community})`)}`)
  }

  console.log(chalk.dim("\nUse --insights for communities, surprising links, and knowledge gaps."))
  console.log(chalk.dim("Use --insights --research to suggest research topics from gaps."))
}

function printFullInsights(
  nodes: ReturnType<typeof buildWikiGraph>["nodes"],
  edges: ReturnType<typeof buildWikiGraph>["edges"],
  communities: ReturnType<typeof buildWikiGraph>["communities"],
  suggestResearch?: boolean,
) {
  console.log(chalk.bold("Communities (Louvain):\n"))
  for (const comm of communities.slice(0, 8)) {
    const warn = comm.cohesion < 0.15 && comm.nodeCount >= 3 ? chalk.yellow(" [sparse]") : ""
    console.log(`  Cluster ${comm.id}: ${comm.nodeCount} pages, cohesion ${comm.cohesion.toFixed(2)}${warn}`)
    console.log(chalk.dim(`    ${comm.topNodes.join(", ")}`))
  }
  console.log()

  const surprising = findSurprisingConnections(nodes, edges, communities, 8)
  if (surprising.length > 0) {
    console.log(chalk.magenta.bold("Surprising Connections:\n"))
    for (const s of surprising) {
      console.log(`  ${s.source.label} ↔ ${s.target.label} ${chalk.dim(`(score ${s.score})`)}`)
      console.log(chalk.dim(`    ${s.reasons.join("; ")}`))
    }
    console.log()
  }

  const gaps = detectKnowledgeGaps(nodes, edges, communities)
  if (gaps.length > 0) {
    console.log(chalk.yellow.bold("Knowledge Gaps:\n"))
    for (const gap of gaps) {
      console.log(`  ${chalk.bold(gap.title)} ${chalk.dim(`[${gap.type}]`)}`)
      console.log(`    ${gap.description}`)
      console.log(chalk.dim(`    → ${gap.suggestion}`))
    }
    console.log()
  }

  if (suggestResearch && gaps.length > 0) {
    const topics = gaps
      .filter((g) => g.type === "isolated-node" || g.type === "sparse-community")
      .slice(0, 3)
      .map((g) => g.title.replace(/^Sparse cluster: /, "").replace(/\d+ isolated pages?/, "wiki connectivity"))
    if (topics.length > 0) {
      console.log(chalk.cyan.bold("Suggested research topics:\n"))
      for (const t of topics) {
        console.log(`  llm-wiki research "${t}" -p <project>`)
      }
      console.log()
    }
  }
}
