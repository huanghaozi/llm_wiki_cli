import { describe, it, expect } from "vitest"
import { tokenizeQuery, searchWikiPages } from "./search-engine.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import { join } from "node:path"

describe("search-engine", () => {
  it("tokenizes English and CJK queries", () => {
    const en = tokenizeQuery("hello world test")
    expect(en).toContain("hello")
    const zh = tokenizeQuery("机器学习")
    expect(zh.length).toBeGreaterThan(0)
  })

  it("finds pages by title and body", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const results = searchWikiPages(root, "Alpha Entity")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].titleMatch).toBe(true)
  })

  it("returns empty for non-matching query", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    expect(searchWikiPages(root, "zzzznonexistent")).toHaveLength(0)
  })
})
