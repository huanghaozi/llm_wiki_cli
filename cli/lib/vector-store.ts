import { join } from "node:path"
import * as lancedb from "@lancedb/lancedb"

const TABLE_V2 = "wiki_chunks_v2"

export interface ChunkUpsertInput {
  chunkIndex: number
  chunkText: string
  headingPath: string
  embedding: number[]
}

export interface ChunkSearchResult {
  chunk_id: string
  page_id: string
  chunk_index: number
  chunk_text: string
  heading_path: string
  score: number
}

function dbPath(projectPath: string): string {
  return join(projectPath, ".llm-wiki", "lancedb").replace(/\\/g, "/")
}

function validatePageId(pageId: string): void {
  if (!pageId || pageId.length > 256) throw new Error("Invalid page_id")
  if (!/^[a-zA-Z0-9._-]+$/.test(pageId)) throw new Error(`Invalid page_id: ${pageId}`)
}

export async function vectorUpsertChunks(
  projectPath: string,
  pageId: string,
  chunks: ChunkUpsertInput[],
): Promise<void> {
  validatePageId(pageId)
  if (chunks.length === 0) return

  const dim = chunks[0].embedding.length
  const db = await lancedb.connect(dbPath(projectPath))
  const rows = chunks.map((c) => ({
    chunk_id: `${pageId}#${c.chunkIndex}`,
    page_id: pageId,
    chunk_index: c.chunkIndex,
    chunk_text: c.chunkText,
    heading_path: c.headingPath,
    vector: c.embedding.map((v) => Math.fround(v)),
  }))

  const tables = await db.tableNames()
  if (tables.includes(TABLE_V2)) {
    const table = await db.openTable(TABLE_V2)
    await table.delete(`page_id = '${pageId.replace(/'/g, "''")}'`)
    await table.add(rows)
  } else {
    await db.createTable(TABLE_V2, rows)
  }
}

export async function vectorSearchChunks(
  projectPath: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ChunkSearchResult[]> {
  const db = await lancedb.connect(dbPath(projectPath))
  const tables = await db.tableNames()
  if (!tables.includes(TABLE_V2)) return []

  const table = await db.openTable(TABLE_V2)
  const results = await table
    .vectorSearch(queryEmbedding.map((v) => Math.fround(v)))
    .limit(topK)
    .toArray()

  return results.map((row) => {
    const distance = typeof row._distance === "number" ? row._distance : 0
    return {
      chunk_id: String(row.chunk_id),
      page_id: String(row.page_id),
      chunk_index: Number(row.chunk_index),
      chunk_text: String(row.chunk_text),
      heading_path: String(row.heading_path ?? ""),
      score: 1 / (1 + distance),
    }
  })
}

export async function vectorDeletePage(projectPath: string, pageId: string): Promise<void> {
  validatePageId(pageId)
  const db = await lancedb.connect(dbPath(projectPath))
  const tables = await db.tableNames()
  if (!tables.includes(TABLE_V2)) return
  const table = await db.openTable(TABLE_V2)
  await table.delete(`page_id = '${pageId.replace(/'/g, "''")}'`)
}

export async function vectorCountChunks(projectPath: string): Promise<number> {
  try {
    const db = await lancedb.connect(dbPath(projectPath))
    const tables = await db.tableNames()
    if (!tables.includes(TABLE_V2)) return 0
    const table = await db.openTable(TABLE_V2)
    return await table.countRows()
  } catch {
    return 0
  }
}
