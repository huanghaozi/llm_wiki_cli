import { describe, it, expect } from "vitest"
import {
  parseFrontmatter,
  extractFrontmatterTitle,
  stripFrontmatter,
} from "./frontmatter.js"

describe("parseFrontmatter", () => {
  it("returns null for content without frontmatter", () => {
    const r = parseFrontmatter("# Just markdown\nNo YAML.")
    expect(r.frontmatter).toBeNull()
    expect(r.body).toBe("# Just markdown\nNo YAML.")
    expect(r.rawBlock).toBe("")
  })

  it("parses a simple frontmatter block", () => {
    const content = `---
title: Hello
type: entity
tags: [a, b]
---
# Body
`
    const r = parseFrontmatter(content)
    expect(r.frontmatter?.title).toBe("Hello")
    expect(r.frontmatter?.type).toBe("entity")
    expect(r.frontmatter?.tags).toEqual(["a", "b"])
    expect(r.body).toBe("# Body\n")
  })

  it("handles CRLF line endings", () => {
    const content = "---\r\ntitle: Hi\r\n---\r\n# Body\r\n"
    const r = parseFrontmatter(content)
    expect(r.frontmatter?.title).toBe("Hi")
  })

  it("handles the broken `related: [[a]], [[b]]` YAML shape", () => {
    const content = `---
title: Test
related: [[foo]], [[bar]]
---
# Body
`
    const r = parseFrontmatter(content)
    expect(r.frontmatter?.related).toEqual(["[[foo]]", "[[bar]]"])
  })

  it("recovers when a stray prefix line wraps the frontmatter", () => {
    const content = '```yaml\n---\ntitle: Wrapped\n---\n# Body\n```\n'
    const r = parseFrontmatter(content)
    expect(r.frontmatter?.title).toBe("Wrapped")
  })
})

describe("extractFrontmatterTitle", () => {
  it("extracts title from valid frontmatter", () => {
    expect(extractFrontmatterTitle('---\ntitle: "My Page"\n---\nBody'))
      .toBe("My Page")
  })

  it("returns empty string when frontmatter is missing", () => {
    expect(extractFrontmatterTitle("# Body\nNo frontmatter")).toBe("")
  })

  it("does NOT pick up a 'title:' line in the body", () => {
    const content = `---
type: entity
---
# Real Body
title: not really the title
`
    expect(extractFrontmatterTitle(content)).toBe("")
  })

  it("handles CJK titles", () => {
    expect(extractFrontmatterTitle('---\ntitle: 默会知识\n---\n')).toBe("默会知识")
  })
})

describe("stripFrontmatter", () => {
  it("strips a standard frontmatter block", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\n# Body\n")).toBe("# Body\n")
  })

  it("returns content unchanged when no frontmatter", () => {
    expect(stripFrontmatter("# Hi")).toBe("# Hi")
  })

  it("handles CRLF frontmatter", () => {
    expect(stripFrontmatter("---\r\ntitle: x\r\n---\r\nBody")).toBe("Body")
  })
})
