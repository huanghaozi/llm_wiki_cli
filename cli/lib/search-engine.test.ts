import { describe, it, expect } from "vitest"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tokenizeQuery, searchWikiPages } from "./search-engine.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"

describe("tokenizeQuery", () => {
  it("tokenizes English with stop-word filtering", () => {
    const t = tokenizeQuery("the quick brown fox is fast")
    expect(t).toContain("quick")
    expect(t).toContain("brown")
    expect(t).not.toContain("the")
    expect(t).not.toContain("is")
  })

  it("emits CJK bigrams plus the original term", () => {
    const t = tokenizeQuery("默会知识")
    expect(t).toContain("默会")
    expect(t).toContain("会知")
    expect(t).toContain("知识")
    expect(t).toContain("默会知识")
  })
})

describe("searchWikiPages", () => {
  it("finds pages by title", () => {
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

  it("filename-exact bonus requires === match, not substring", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "entities", "foo.md"),
      `---\ntype: entity\ntitle: Foo\n---\nBody.`,
    )
    writeFileSync(
      join(root, "wiki", "entities", "foobar.md"),
      `---\ntype: entity\ntitle: Foobar\n---\nBody.`,
    )
    const results = searchWikiPages(root, "foo")
    const foo = results.find((r) => r.relPath.endsWith("foo.md"))
    const foobar = results.find((r) => r.relPath.endsWith("foobar.md"))
    expect(foo).toBeDefined()
    expect(foobar).toBeDefined()
    // Foo gets the 200-pt filename-exact bonus; foobar does not.
    expect((foo?.score ?? 0)).toBeGreaterThan((foobar?.score ?? 0))
  })

  it("phrase-in-body occurrence is capped at 10", () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    const body = Array(20).fill("widget").join(" ")
    writeFileSync(
      join(root, "wiki", "many-widgets.md"),
      `---\ntype: concept\ntitle: Many\n---\n${body}`,
    )
    const results = searchWikiPages(root, "widget")
    expect(results[0].score).toBeLessThan(20 * 5 + 10 * 20 + 200) // tokens*5 + occ*20 capped at 10
  })
})
