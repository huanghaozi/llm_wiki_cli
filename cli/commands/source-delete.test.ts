import { describe, it, expect, beforeEach, vi } from "vitest"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { sourceDeleteCommand } from "./source-delete.js"
import { createTempDir } from "../test-helpers/setup.js"
import * as vectorStore from "../lib/vector-store.js"
import { saveIngestCache, checkIngestCache } from "../lib/ingest-cache.js"

function setupProject(root: string, fileName: string, sources: string[][]) {
  mkdirSync(join(root, "raw", "sources"), { recursive: true })
  mkdirSync(join(root, "wiki", "sources"), { recursive: true })
  mkdirSync(join(root, "wiki", "entities"), { recursive: true })
  mkdirSync(join(root, ".llm-wiki"), { recursive: true })
  writeFileSync(join(root, "raw", "sources", fileName), "content")

  for (let i = 0; i < sources.length; i++) {
    const list = sources[i]
    writeFileSync(
      join(root, "wiki", "entities", `page-${i}.md`),
      `---\ntype: entity\ntitle: Page ${i}\nsources: ${JSON.stringify(list)}\n---\n# Page ${i}\n\nSee [[Page 0]] and [[Page 1]].`,
    )
  }
  writeFileSync(
    join(root, "wiki", "index.md"),
    "# Index\n\n- [[page-0]] page 0\n- [[Page 1]] entry\n",
  )
}

describe("sourceDeleteCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(vectorStore, "vectorDeletePage").mockResolvedValue(undefined)
  })

  it("removes raw source file and updates page sources lists", async () => {
    const root = createTempDir()
    setupProject(root, "foo.pdf", [
      ["foo.pdf", "bar.pdf"], // page-0 multi-source — should survive trimmed
      ["foo.pdf"],            // page-1 single-source — should be deleted
    ])

    await sourceDeleteCommand({
      files: ["foo.pdf"],
      projectPath: root,
      yes: true,
    })

    expect(existsSync(join(root, "raw", "sources", "foo.pdf"))).toBe(false)
    const survivor = readFileSync(join(root, "wiki", "entities", "page-0.md"), "utf-8")
    expect(survivor).toContain('sources: ["bar.pdf"]')
    expect(existsSync(join(root, "wiki", "entities", "page-1.md"))).toBe(false)
  })

  it("cleans references in index.md when deleting cascades", async () => {
    const root = createTempDir()
    setupProject(root, "foo.pdf", [["foo.pdf"], ["foo.pdf"]])
    await sourceDeleteCommand({ files: ["foo.pdf"], projectPath: root, yes: true })

    const index = readFileSync(join(root, "wiki", "index.md"), "utf-8")
    expect(index).not.toContain("[[page-0]]")
    expect(index).not.toContain("[[Page 1]]")
  })

  it("invalidates ingest cache for the deleted source", async () => {
    const root = createTempDir()
    setupProject(root, "foo.pdf", [["foo.pdf"]])
    saveIngestCache(root, "foo.pdf", "content", ["wiki/entities/page-0.md"])

    await sourceDeleteCommand({ files: ["foo.pdf"], projectPath: root, yes: true })
    expect(checkIngestCache(root, "foo.pdf", "content")).toBeNull()
  })

  it("does not cross-match same basename in different folders", async () => {
    const root = createTempDir()
    mkdirSync(join(root, "raw", "sources", "papers-a"), { recursive: true })
    mkdirSync(join(root, "raw", "sources", "papers-b"), { recursive: true })
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    writeFileSync(join(root, "raw", "sources", "papers-a", "intro.pdf"), "A")
    writeFileSync(join(root, "raw", "sources", "papers-b", "intro.pdf"), "B")
    writeFileSync(
      join(root, "wiki", "entities", "a.md"),
      `---\ntype: entity\ntitle: A\nsources: ["papers-b/intro.pdf"]\n---\n# A`,
    )

    await sourceDeleteCommand({
      files: [join(root, "raw", "sources", "papers-a", "intro.pdf")],
      projectPath: root,
      yes: true,
    })

    // Page A references papers-b/intro.pdf — should be untouched.
    expect(existsSync(join(root, "wiki", "entities", "a.md"))).toBe(true)
    const content = readFileSync(join(root, "wiki", "entities", "a.md"), "utf-8")
    expect(content).toContain("papers-b/intro.pdf")
  })

  it("calls vectorDeletePage when cascading delete removes a page", async () => {
    const root = createTempDir()
    setupProject(root, "foo.pdf", [["foo.pdf"], ["foo.pdf"]])
    const spy = vi.spyOn(vectorStore, "vectorDeletePage").mockResolvedValue(undefined)

    await sourceDeleteCommand({ files: ["foo.pdf"], projectPath: root, yes: true })

    expect(spy).toHaveBeenCalled()
  })
})
