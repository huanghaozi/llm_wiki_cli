import { describe, it, expect } from "vitest"
import { makeQuerySlug, makeQueryFileName } from "./wiki-filename.js"

describe("makeQuerySlug", () => {
  it("creates ASCII slug from English title", () => {
    expect(makeQuerySlug("Hello World")).toBe("hello-world")
  })

  it("preserves CJK characters", () => {
    expect(makeQuerySlug("默会知识")).toBe("默会知识")
  })

  it("preserves mixed-script titles", () => {
    expect(makeQuerySlug("默会 Tacit Knowledge")).toMatch(/默会-tacit-knowledge/)
  })

  it("strips emoji and punctuation", () => {
    expect(makeQuerySlug("Hello! 👋 World?")).toBe("hello-world")
  })

  it("falls back to 'query' when title is empty after stripping", () => {
    expect(makeQuerySlug("!!!")).toBe("query")
    expect(makeQuerySlug("")).toBe("query")
  })

  it("truncates at 50 chars", () => {
    expect(makeQuerySlug("a".repeat(100)).length).toBeLessThanOrEqual(50)
  })

  it("NFKC-normalizes full-width to half-width", () => {
    expect(makeQuerySlug("ＡＢＣ").length).toBeGreaterThan(0)
  })
})

describe("makeQueryFileName", () => {
  it("produces a filename containing slug + date + time", () => {
    const result = makeQueryFileName("Hello", new Date("2026-05-25T14:30:52Z"))
    expect(result.fileName).toBe("hello-2026-05-25-143052.md")
    expect(result.slug).toBe("hello")
    expect(result.date).toBe("2026-05-25")
    expect(result.time).toBe("143052")
  })

  it("CJK title still gets a unique filename per second", () => {
    const a = makeQueryFileName("默会知识", new Date("2026-05-25T14:30:52Z"))
    const b = makeQueryFileName("默会知识", new Date("2026-05-25T14:30:53Z"))
    expect(a.fileName).not.toBe(b.fileName)
    expect(a.slug).toBe("默会知识")
  })
})
