import { describe, it, expect } from "vitest"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { extractDocumentText, isSupportedSource, sourceBasename } from "./document-extract.js"
import { createTempDir } from "../test-helpers/setup.js"

describe("document-extract", () => {
  it("reads markdown and text files", async () => {
    const root = createTempDir()
    const md = join(root, "a.md")
    writeFileSync(md, "# Hello\n")
    expect(await extractDocumentText(md)).toContain("Hello")
    expect(isSupportedSource(md)).toBe(true)

    const txt = join(root, "b.txt")
    writeFileSync(txt, "plain text")
    expect(await extractDocumentText(txt)).toBe("plain text")
  })

  it("returns null for unsupported extension", async () => {
    const root = createTempDir()
    const bin = join(root, "a.bin")
    writeFileSync(bin, "data")
    expect(isSupportedSource(bin)).toBe(false)
    expect(await extractDocumentText(bin)).toBeNull()
  })

  it("returns null for missing pdf parse", async () => {
    const root = createTempDir()
    const pdf = join(root, "fake.pdf")
    writeFileSync(pdf, "not a real pdf")
    expect(await extractDocumentText(pdf)).toBeNull()
  })

  it("extracts source basename", () => {
    expect(sourceBasename("/path/to/file.pdf")).toBe("file.pdf")
  })
})
