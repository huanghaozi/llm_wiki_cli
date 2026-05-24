import { describe, it, expect } from "vitest"
import {
  parseFileBlocks,
  parseReviewBlocks,
  isSafeIngestPath,
} from "./ingest-parse.js"

describe("isSafeIngestPath", () => {
  it("accepts a wiki-relative path", () => {
    expect(isSafeIngestPath("wiki/entities/alpha.md")).toBe(true)
  })

  it("rejects paths outside wiki/", () => {
    expect(isSafeIngestPath("etc/passwd")).toBe(false)
    expect(isSafeIngestPath("raw/sources/foo.pdf")).toBe(false)
  })

  it("rejects absolute paths", () => {
    expect(isSafeIngestPath("/etc/passwd")).toBe(false)
    expect(isSafeIngestPath("C:\\Windows\\System32\\foo.txt")).toBe(false)
    expect(isSafeIngestPath("\\\\server\\share\\foo")).toBe(false)
  })

  it("rejects `..` segments", () => {
    expect(isSafeIngestPath("wiki/../etc/passwd")).toBe(false)
    expect(isSafeIngestPath("wiki/foo/../../etc/passwd")).toBe(false)
  })

  it("rejects Windows reserved names", () => {
    expect(isSafeIngestPath("wiki/CON.md")).toBe(false)
    expect(isSafeIngestPath("wiki/PRN.md")).toBe(false)
    expect(isSafeIngestPath("wiki/COM1.md")).toBe(false)
    expect(isSafeIngestPath("wiki/LPT9.md")).toBe(false)
  })

  it("rejects Windows-invalid filename chars", () => {
    expect(isSafeIngestPath("wiki/foo:bar.md")).toBe(false)
    expect(isSafeIngestPath('wiki/foo"bar.md')).toBe(false)
    expect(isSafeIngestPath("wiki/foo|bar.md")).toBe(false)
  })

  it("rejects control bytes", () => {
    expect(isSafeIngestPath("wiki/foo\x00bar.md")).toBe(false)
  })
})

describe("parseFileBlocks", () => {
  it("parses a single block", () => {
    const text = `---FILE: wiki/foo.md---
content here
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0].path).toBe("wiki/foo.md")
    expect(r.blocks[0].content).toBe("content here")
    expect(r.warnings).toEqual([])
  })

  it("normalizes CRLF line endings", () => {
    const text = "---FILE: wiki/foo.md---\r\ncontent\r\n---END FILE---\r\n"
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(1)
  })

  it("handles multiple blocks", () => {
    const text = `---FILE: wiki/a.md---
A
---END FILE---
---FILE: wiki/b.md---
B
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(2)
  })

  it("ignores `---END FILE---` inside a fenced code block", () => {
    const text = `---FILE: wiki/concept.md---
About our format:

\`\`\`
---END FILE---
\`\`\`

End of body.
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0].content).toContain("End of body.")
  })

  it("warns on truncated stream (no closing marker)", () => {
    const text = `---FILE: wiki/foo.md---
content with no closer`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(0)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings[0]).toContain("truncation")
  })

  it("warns on empty path", () => {
    const text = `---FILE:   ---
content
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(0)
    expect(r.warnings[0]).toContain("empty path")
  })

  it("warns on unsafe path and drops the block", () => {
    const text = `---FILE: ../etc/passwd---
malicious
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(0)
    expect(r.warnings[0]).toContain("unsafe path")
  })

  it("warns on Windows reserved filename", () => {
    const text = `---FILE: wiki/CON.md---
test
---END FILE---`
    const r = parseFileBlocks(text)
    expect(r.blocks).toHaveLength(0)
  })
})

describe("parseReviewBlocks", () => {
  it("parses a simple suggestion block", () => {
    const text = `---REVIEW: suggestion | Update Foo---
Description text here.
OPTIONS: Approve|Skip|Edit
PAGES: foo.md, bar.md
---END REVIEW---`
    const items = parseReviewBlocks(text)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("suggestion")
    expect(items[0].title).toBe("Update Foo")
    expect(items[0].options).toEqual([
      { label: "Approve", action: "Approve" },
      { label: "Skip", action: "Skip" },
      { label: "Edit", action: "Edit" },
    ])
    expect(items[0].affectedPages).toEqual(["foo.md", "bar.md"])
  })

  it("parses SEARCH queries", () => {
    const text = `---REVIEW: missing-page | Need Bar---
What is Bar?
SEARCH: bar tutorial|bar overview
---END REVIEW---`
    const items = parseReviewBlocks(text)
    expect(items[0].searchQueries).toEqual(["bar tutorial", "bar overview"])
  })

  it("returns empty array when no review blocks present", () => {
    expect(parseReviewBlocks("# just markdown")).toEqual([])
  })

  it("falls back to default options when OPTIONS line absent", () => {
    const text = `---REVIEW: confirm | Title---
Some desc
---END REVIEW---`
    const items = parseReviewBlocks(text)
    expect(items[0].options.map((o) => o.label)).toEqual(["Approve", "Skip"])
  })
})
