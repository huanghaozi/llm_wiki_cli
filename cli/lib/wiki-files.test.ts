import { describe, it, expect } from "vitest"
import {
  listWikiMdFiles,
  extractFrontmatterTitle,
  extractBody,
  extractWikilinks,
  normalizeWikiRefKey,
  buildSlugMap,
  readPageTitle,
} from "./wiki-files.js"
import { createTempDir } from "../test-helpers/setup.js"
import { createMinimalWikiProject } from "../test-helpers/fixtures.js"
import { join } from "node:path"
import { writeFileSync, mkdirSync } from "node:fs"

describe("wiki-files", () => {
  it("lists markdown files recursively", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const files = listWikiMdFiles(join(root, "wiki"))
    expect(files.some((f) => f.relPath === "entities/alpha-entity.md")).toBe(true)
    expect(files.some((f) => f.relPath === "orphan-page.md")).toBe(true)
  })

  it("extracts frontmatter title and body", () => {
    const content = "---\ntitle: Hello World\n---\n\n# Body\n"
    expect(extractFrontmatterTitle(content)).toBe("Hello World")
    expect(extractBody(content)).toContain("# Body")
  })

  it("extracts wikilinks", () => {
    expect(extractWikilinks("See [[Alpha]] and [[Beta|display]]")).toEqual(["Alpha", "Beta"])
  })

  it("normalizes wiki ref keys", () => {
    expect(normalizeWikiRefKey("entities/Foo-Bar.md")).toBe("foobar")
  })

  it("builds slug map with basename fallback", () => {
    const root = createTempDir()
    createMinimalWikiProject(root)
    const files = listWikiMdFiles(join(root, "wiki"))
    const map = buildSlugMap(files)
    expect(map.get("alpha-entity")).toBeTruthy()
    expect(map.get("entities/alpha-entity")).toBeTruthy()
  })

  it("handles pages without frontmatter title", () => {
    const root = createTempDir()
    const wiki = join(root, "wiki")
    mkdirSync(wiki, { recursive: true })
    writeFileSync(join(wiki, "plain.md"), "# Plain\n")
    const files = listWikiMdFiles(wiki)
    expect(files).toHaveLength(1)
    expect(readPageTitle(files[0])).toBe("plain")
  })

  it("readPageTitle falls back when file unreadable", () => {
    const root = createTempDir()
    const wiki = join(root, "wiki")
    mkdirSync(wiki, { recursive: true })
    const ghost = join(wiki, "ghost.md")
    writeFileSync(ghost, "x")
    const files = listWikiMdFiles(wiki)
    const page = files[0]
    writeFileSync(ghost, "") // ensure exists first
    // simulate missing file by pointing to bad path
    expect(readPageTitle({ ...page, path: join(wiki, "missing.md") })).toBe("ghost")
  })
})
