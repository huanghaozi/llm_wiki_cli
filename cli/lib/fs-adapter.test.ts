import { describe, it, expect } from "vitest"
import {
  readTextFile,
  writeTextFile,
  fileExists,
  listDirectory,
  readDirRecursive,
  ensureDir,
} from "./fs-adapter.js"
import { join } from "node:path"
import { createTempDir } from "../test-helpers/setup.js"

describe("fs-adapter", () => {
  it("reads and writes text files", () => {
    const root = createTempDir()
    const file = join(root, "nested", "test.txt")
    writeTextFile(file, "content")
    expect(readTextFile(file)).toBe("content")
    expect(fileExists(file)).toBe(true)
  })

  it("lists directory entries", () => {
    const root = createTempDir()
    writeTextFile(join(root, "a.txt"), "a")
    ensureDir(join(root, "sub"))
    const entries = listDirectory(root)
    expect(entries.some((e) => e.name === "a.txt" && !e.is_dir)).toBe(true)
    expect(entries.some((e) => e.name === "sub" && e.is_dir)).toBe(true)
  })

  it("returns empty list for missing directory", () => {
    expect(listDirectory("/nonexistent/path/xyz")).toEqual([])
  })

  it("reads directory tree recursively", () => {
    const root = createTempDir()
    writeTextFile(join(root, "sub", "b.txt"), "b")
    const tree = readDirRecursive(root)
    const sub = tree.find((n) => n.name === "sub")
    expect(sub?.is_dir).toBe(true)
    expect(sub?.children?.some((c) => c.name === "b.txt")).toBe(true)
  })

  it("ensureDir creates missing directories", () => {
    const root = createTempDir()
    const dir = join(root, "a", "b")
    ensureDir(dir)
    expect(fileExists(dir)).toBe(true)
  })
})
