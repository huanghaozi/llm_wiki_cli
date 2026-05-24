import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { ReviewItem } from "../types/cli.js"

function reviewFilePath(projectPath: string): string {
  return join(projectPath, ".llm-wiki", "review.json")
}

export function loadReviews(projectPath: string): ReviewItem[] {
  const path = reviewFilePath(projectPath)
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ReviewItem[]
  } catch {
    return []
  }
}

export function saveReviews(projectPath: string, items: ReviewItem[]) {
  const dir = join(projectPath, ".llm-wiki")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(reviewFilePath(projectPath), JSON.stringify(items, null, 2))
}

export function addReviewItem(
  projectPath: string,
  item: Omit<ReviewItem, "id" | "resolved" | "createdAt">,
): string {
  const items = loadReviews(projectPath)
  const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  items.push({
    ...item,
    id,
    resolved: false,
    createdAt: Date.now(),
  })
  saveReviews(projectPath, items)
  return id
}

export function appendToIndex(projectPath: string, pageRelPath: string, title?: string) {
  const indexPath = join(projectPath, "wiki", "index.md")
  let content = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "# Wiki Index\n"
  const linkName = title ?? pageRelPath.replace(/\.md$/, "").split("/").pop() ?? pageRelPath
  const entry = `- [[${linkName}]]`
  if (!content.includes(entry)) {
    content = content.trimEnd() + "\n" + entry + "\n"
    writeFileSync(indexPath, content)
  }
}

export function appendToLog(projectPath: string, message: string) {
  const logPath = join(projectPath, "wiki", "log.md")
  const date = new Date().toISOString().slice(0, 10)
  const line = `- ${date}: ${message}\n`
  let content = existsSync(logPath) ? readFileSync(logPath, "utf-8") : "# Wiki Log\n"
  content = content.trimEnd() + "\n" + line
  writeFileSync(logPath, content)
}
