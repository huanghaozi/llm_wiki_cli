import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  loadReviews,
  saveReviews,
  addReviewItem,
  appendToIndex,
  appendToLog,
} from "./project-utils.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"

describe("project-utils", () => {
  it("persists review queue", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const id = addReviewItem(root, {
      type: "confirm",
      title: "Test",
      description: "desc",
      options: [],
    })
    const items = loadReviews(root)
    expect(items.find((i) => i.id === id)).toBeTruthy()
    saveReviews(root, [])
    expect(loadReviews(root)).toHaveLength(0)
  })

  it("appends index and log entries", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    appendToIndex(root, "entities/new-page.md", "New Page")
    const index = readFileSync(join(root, "wiki", "index.md"), "utf-8")
    expect(index).toContain("[[New Page]]")
    appendToLog(root, "Test event")
    const log = readFileSync(join(root, "wiki", "log.md"), "utf-8")
    expect(log).toContain("Test event")
  })

  it("creates review file directory if missing", () => {
    const root = createTempDir()
    addReviewItem(root, { type: "suggestion", title: "T", description: "d", options: [] })
    expect(existsSync(join(root, ".llm-wiki", "review.json"))).toBe(true)
  })
})
