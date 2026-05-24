import { describe, it, expect } from "vitest"
import { runStructuralLint, applyOrphanFix, removeBrokenLink } from "./lint-engine.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import { join } from "node:path"
import { writeFileSync, readFileSync } from "node:fs"

describe("lint-engine", () => {
  it("detects orphans and broken links", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    writeFileSync(
      join(root, "wiki", "broken.md"),
      "# Broken\n\nSee [[Missing Page]].\n",
    )
    const results = runStructuralLint(join(root, "wiki"))
    expect(results.some((r) => r.type === "orphan")).toBe(true)
    expect(results.some((r) => r.type === "broken-link")).toBe(true)
  })

  it("fixes orphan in index", () => {
    const fixed = applyOrphanFix("# Wiki Index\n", "entities/new.md")
    expect(fixed).toContain("[[new]]")
  })

  it("removes broken wikilink markup", () => {
    const out = removeBrokenLink("Text [[Missing]] end", "Missing")
    expect(out).toBe("Text Missing end")
  })
})
