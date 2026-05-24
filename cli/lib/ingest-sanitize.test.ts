import { describe, it, expect } from "vitest"
import { sanitizeIngestedFileContent } from "./ingest-sanitize.js"

describe("sanitizeIngestedFileContent", () => {
  it("strips outer ```yaml ... ``` code fence", () => {
    const input = '```yaml\n---\ntitle: x\n---\n# Body\n```\n'
    const out = sanitizeIngestedFileContent(input)
    expect(out.startsWith("---")).toBe(true)
    expect(out).not.toContain("```")
  })

  it("strips a leading `frontmatter:` key", () => {
    const input = "frontmatter:\n---\ntitle: x\n---\n# Body"
    const out = sanitizeIngestedFileContent(input)
    expect(out.startsWith("---")).toBe(true)
  })

  it("repairs `related: [[a]], [[b]]` wikilink-list shape", () => {
    const input = `---
title: x
related: [[a]], [[b]], [[c]]
---
# Body`
    const out = sanitizeIngestedFileContent(input)
    expect(out).toContain('related: ["[[a]]", "[[b]]", "[[c]]"]')
  })

  it("leaves clean content alone", () => {
    const input = "---\ntitle: x\n---\n# Body\n"
    expect(sanitizeIngestedFileContent(input)).toBe(input)
  })

  it("leaves an in-body fenced code block untouched", () => {
    const input = "---\ntitle: x\n---\n# Body\n\n```js\nfoo()\n```\n"
    expect(sanitizeIngestedFileContent(input)).toBe(input)
  })
})
