import { describe, it, expect, beforeEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { checkIngestCache, saveIngestCache, removeFromIngestCache } from "./ingest-cache.js"
import { createTempDir } from "../test-helpers/setup.js"

describe("ingest-cache", () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  it("returns null on miss", () => {
    expect(checkIngestCache(root, "foo.pdf", "content")).toBeNull()
  })

  it("hits when hash matches and all files exist", () => {
    mkdirSync(join(root, "wiki"), { recursive: true })
    writeFileSync(join(root, "wiki", "alpha.md"), "x")
    saveIngestCache(root, "foo.pdf", "content", ["wiki/alpha.md"])
    expect(checkIngestCache(root, "foo.pdf", "content")).toEqual(["wiki/alpha.md"])
  })

  it("misses when hash differs", () => {
    saveIngestCache(root, "foo.pdf", "v1", [])
    expect(checkIngestCache(root, "foo.pdf", "v2")).toBeNull()
  })

  it("misses when a previously-written file is gone", () => {
    saveIngestCache(root, "foo.pdf", "content", ["wiki/missing.md"])
    expect(checkIngestCache(root, "foo.pdf", "content")).toBeNull()
  })

  it("removeFromIngestCache drops the entry", () => {
    saveIngestCache(root, "foo.pdf", "content", [])
    expect(checkIngestCache(root, "foo.pdf", "content")).not.toBeNull()
    removeFromIngestCache(root, "foo.pdf")
    expect(checkIngestCache(root, "foo.pdf", "content")).toBeNull()
  })

  it("survives a corrupt cache file", () => {
    mkdirSync(join(root, ".llm-wiki"), { recursive: true })
    writeFileSync(join(root, ".llm-wiki", "ingest-cache.json"), "not json")
    expect(checkIngestCache(root, "foo.pdf", "content")).toBeNull()
    saveIngestCache(root, "foo.pdf", "content", [])
    expect(existsSync(join(root, ".llm-wiki", "ingest-cache.json"))).toBe(true)
  })
})
