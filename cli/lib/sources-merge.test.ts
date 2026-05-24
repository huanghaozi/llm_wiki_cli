import { describe, it, expect } from "vitest"
import {
  parseFrontmatterArray,
  writeFrontmatterArray,
  mergeSourcesIntoContent,
  mergeArrayFieldsIntoContent,
  parseSources,
  mergeSourcesLists,
} from "./sources-merge.js"

const inlineDoc = `---
title: X
sources: ["a.pdf", "b.pdf"]
tags: [foo, bar]
---
Body
`

const blockDoc = `---
title: X
sources:
  - "a.pdf"
  - b.pdf
tags:
  - foo
  - bar
---
Body
`

describe("parseFrontmatterArray", () => {
  it("parses inline form", () => {
    expect(parseFrontmatterArray(inlineDoc, "sources")).toEqual(["a.pdf", "b.pdf"])
    expect(parseFrontmatterArray(inlineDoc, "tags")).toEqual(["foo", "bar"])
  })

  it("parses block form", () => {
    expect(parseFrontmatterArray(blockDoc, "sources")).toEqual(["a.pdf", "b.pdf"])
    expect(parseFrontmatterArray(blockDoc, "tags")).toEqual(["foo", "bar"])
  })

  it("returns empty array when field is absent", () => {
    expect(parseFrontmatterArray(inlineDoc, "related")).toEqual([])
  })

  it("returns empty when no frontmatter", () => {
    expect(parseFrontmatterArray("# Body", "sources")).toEqual([])
  })

  it("handles CRLF frontmatter", () => {
    const doc = "---\r\nsources: [\"a.pdf\"]\r\n---\r\nBody"
    expect(parseFrontmatterArray(doc, "sources")).toEqual(["a.pdf"])
  })
})

describe("writeFrontmatterArray", () => {
  it("rewrites inline form in place", () => {
    const updated = writeFrontmatterArray(inlineDoc, "sources", ["c.pdf"])
    expect(parseFrontmatterArray(updated, "sources")).toEqual(["c.pdf"])
    expect(updated).toContain('sources: ["c.pdf"]')
  })

  it("rewrites block form into inline shape", () => {
    const updated = writeFrontmatterArray(blockDoc, "sources", ["c.pdf"])
    expect(parseFrontmatterArray(updated, "sources")).toEqual(["c.pdf"])
  })

  it("appends the field if absent", () => {
    const updated = writeFrontmatterArray(inlineDoc, "related", ["x"])
    expect(parseFrontmatterArray(updated, "related")).toEqual(["x"])
  })

  it("returns content unchanged when no frontmatter", () => {
    expect(writeFrontmatterArray("# Body", "sources", ["a"])).toBe("# Body")
  })
})

describe("mergeSourcesIntoContent", () => {
  it("unions old and new sources", () => {
    const newContent = `---
title: X
sources: ["b.pdf"]
---
New body
`
    const existing = `---
title: X
sources: ["a.pdf"]
---
Old body
`
    const merged = mergeSourcesIntoContent(newContent, existing)
    expect(parseSources(merged)).toEqual(["a.pdf", "b.pdf"])
  })

  it("returns newContent verbatim when existing is missing", () => {
    const newContent = `---\nsources: [b.pdf]\n---\nBody`
    expect(mergeSourcesIntoContent(newContent, null)).toBe(newContent)
  })

  it("dedupes case-insensitively but keeps first-seen casing", () => {
    const merged = mergeSourcesLists(["FooBar.pdf"], ["foobar.pdf", "baz.pdf"])
    expect(merged).toEqual(["FooBar.pdf", "baz.pdf"])
  })
})

describe("mergeArrayFieldsIntoContent", () => {
  it("merges multiple fields atomically", () => {
    const newContent = `---
title: X
sources: ["b.pdf"]
tags: [new]
---
`
    const existing = `---
title: X
sources: ["a.pdf"]
tags: [old]
related: [foo]
---
`
    const merged = mergeArrayFieldsIntoContent(newContent, existing, [
      "sources", "tags", "related",
    ])
    expect(parseFrontmatterArray(merged, "sources")).toEqual(["a.pdf", "b.pdf"])
    expect(parseFrontmatterArray(merged, "tags")).toEqual(["old", "new"])
    expect(parseFrontmatterArray(merged, "related")).toEqual(["foo"])
  })
})
