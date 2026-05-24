import { describe, it, expect, beforeEach, vi } from "vitest"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { wikiDeleteCommand } from "./wiki-delete.js"
import { createTempDir } from "../test-helpers/setup.js"
import * as vectorStore from "../lib/vector-store.js"

describe("wikiDeleteCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(vectorStore, "vectorDeletePage").mockResolvedValue(undefined)
  })

  it("deletes the page and cleans wikilinks in survivors", async () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki", "entities"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "entities", "foo.md"),
      `---\ntype: entity\ntitle: Foo\n---\n# Foo\n`,
    )
    writeFileSync(
      join(root, "wiki", "entities", "bar.md"),
      `---\ntype: entity\ntitle: Bar\nrelated: [foo]\n---\n# Bar\n\nSee [[Foo]] and [[Baz]].\n`,
    )
    writeFileSync(
      join(root, "wiki", "index.md"),
      "# Index\n\n- [[foo]] description\n- [[bar]]\n",
    )

    await wikiDeleteCommand({ pages: ["foo"], projectPath: root, yes: true })

    expect(existsSync(join(root, "wiki", "entities", "foo.md"))).toBe(false)
    const bar = readFileSync(join(root, "wiki", "entities", "bar.md"), "utf-8")
    expect(bar).toContain("See Foo and [[Baz]].")
    expect(bar).toContain('related: []')

    const index = readFileSync(join(root, "wiki", "index.md"), "utf-8")
    expect(index).not.toContain("[[foo]]")
    expect(index).toContain("[[bar]]")
  })

  it("calls vectorDeletePage for cascade cleanup", async () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "foo.md"),
      `---\ntype: entity\ntitle: Foo\n---\n# Foo\n`,
    )
    const spy = vi.spyOn(vectorStore, "vectorDeletePage").mockResolvedValue(undefined)
    await wikiDeleteCommand({ pages: ["foo"], projectPath: root, yes: true })
    expect(spy).toHaveBeenCalledWith(root, "foo")
  })

  it("matches by title when no slug match", async () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "alpha.md"),
      `---\ntype: entity\ntitle: My Special Page\n---\n# x\n`,
    )
    await wikiDeleteCommand({ pages: ["my special page"], projectPath: root, yes: true })
    expect(existsSync(join(root, "wiki", "alpha.md"))).toBe(false)
  })

  it("substring-collision does NOT remove innocent wikilinks", async () => {
    const root = createTempDir()
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(
      join(root, "wiki", "ai.md"),
      `---\ntype: concept\ntitle: AI\n---\n# AI\n`,
    )
    writeFileSync(
      join(root, "wiki", "other.md"),
      `---\ntype: entity\ntitle: Other\n---\nSee [[OpenAI]] and [[AI Safety]].\n`,
    )
    await wikiDeleteCommand({ pages: ["ai"], projectPath: root, yes: true })
    const other = readFileSync(join(root, "wiki", "other.md"), "utf-8")
    expect(other).toContain("[[OpenAI]]")
    expect(other).toContain("[[AI Safety]]")
  })
})
