import { describe, it, expect, vi } from "vitest"
import { mergePageContent, type MergeFn } from "./page-merge.js"

const FAST_TODAY = () => "2026-01-01"

function page(fmExtras: string, body: string): string {
  return `---
type: entity
title: Foo
created: 2024-05-01
${fmExtras}
---
${body}`
}

describe("mergePageContent", () => {
  it("returns newContent unchanged when no existing page", async () => {
    const merger = vi.fn() as unknown as MergeFn
    const out = await mergePageContent(
      "new",
      null,
      merger,
      { sourceFileName: "s", pagePath: "p" },
    )
    expect(out).toBe("new")
    expect(merger).not.toHaveBeenCalled()
  })

  it("returns existingContent on byte-identical re-ingest", async () => {
    const merger = vi.fn() as unknown as MergeFn
    const same = page("", "body")
    const out = await mergePageContent(
      same,
      same,
      merger,
      { sourceFileName: "s", pagePath: "p" },
    )
    expect(out).toBe(same)
    expect(merger).not.toHaveBeenCalled()
  })

  it("skips LLM when bodies match (only frontmatter array diff)", async () => {
    const merger = vi.fn() as unknown as MergeFn
    const existing = page('sources: ["a.pdf"]', "Body content here.")
    const incoming = page('sources: ["b.pdf"]', "Body content here.")
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p" },
    )
    expect(merger).not.toHaveBeenCalled()
    expect(out).toContain("a.pdf")
    expect(out).toContain("b.pdf")
  })

  it("calls the LLM when bodies differ", async () => {
    const existing = page('sources: ["a.pdf"]', "Existing body.")
    const incoming = page('sources: ["b.pdf"]', "Incoming body.")
    const llmOutput = page('sources: ["a.pdf", "b.pdf"]', "Existing body. Incoming body.")
    const merger = vi.fn().mockResolvedValue(llmOutput) as MergeFn
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p", today: FAST_TODAY },
    )
    expect(merger).toHaveBeenCalledOnce()
    expect(out).toContain("Existing body.")
    expect(out).toContain("Incoming body.")
    expect(out).toContain("updated: 2026-01-01")
  })

  it("locks type/title/created to existing values even when LLM rewrites them", async () => {
    const existing = page('sources: ["a"]', "Old body, longer text to satisfy threshold.")
    const incoming = page('sources: ["b"]', "New body, longer text to satisfy threshold.")
    const llmOutput = `---
type: concept
title: Wrong Title
created: 2099-12-31
sources: ["a", "b"]
---
Merged body, longer text to satisfy threshold.`
    const merger = vi.fn().mockResolvedValue(llmOutput) as MergeFn
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p", today: FAST_TODAY },
    )
    expect(out).toContain("type: entity")
    expect(out).toContain("title: Foo")
    expect(out).toContain("created: 2024-05-01")
  })

  it("falls back when LLM throws, backing up existing content", async () => {
    const existing = page('sources: ["a"]', "Existing body.")
    const incoming = page('sources: ["b"]', "Incoming body.")
    const merger = vi.fn().mockRejectedValue(new Error("LLM error")) as MergeFn
    const backup = vi.fn().mockResolvedValue(undefined)
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p", backup },
    )
    // array-merged but body kept as incoming
    expect(out).toContain("Incoming body.")
    expect(out).toContain('"a"')
    expect(out).toContain('"b"')
    expect(backup).toHaveBeenCalledWith(existing)
  })

  it("falls back when LLM output has no frontmatter", async () => {
    const existing = page('sources: ["a"]', "Existing body, long enough.")
    const incoming = page('sources: ["b"]', "Incoming body, long enough.")
    const merger = vi.fn().mockResolvedValue("just a plain string") as MergeFn
    const backup = vi.fn().mockResolvedValue(undefined)
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p", backup },
    )
    expect(out).toContain("Incoming body")
    expect(backup).toHaveBeenCalled()
  })

  it("falls back when LLM produces a body shorter than 70% of inputs", async () => {
    const existing = page('sources: ["a"]', "A".repeat(200))
    const incoming = page('sources: ["b"]', "B".repeat(200))
    const llmOutput = page('sources: ["a", "b"]', "TINY")
    const merger = vi.fn().mockResolvedValue(llmOutput) as MergeFn
    const backup = vi.fn().mockResolvedValue(undefined)
    const out = await mergePageContent(
      incoming,
      existing,
      merger,
      { sourceFileName: "x", pagePath: "p", backup },
    )
    expect(out).not.toContain("TINY")
    expect(backup).toHaveBeenCalled()
  })

  it("survives backup failure gracefully", async () => {
    const existing = page("", "old body, longer text to pass threshold check.")
    const incoming = page("", "new body, longer text to pass threshold check.")
    const merger = vi.fn().mockRejectedValue(new Error("LLM down")) as MergeFn
    const backup = vi.fn().mockRejectedValue(new Error("disk full"))
    await expect(
      mergePageContent(incoming, existing, merger, {
        sourceFileName: "x",
        pagePath: "p",
        backup,
      }),
    ).resolves.toBeTypeOf("string")
  })
})
