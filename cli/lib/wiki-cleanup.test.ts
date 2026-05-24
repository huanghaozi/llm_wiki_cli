import { describe, it, expect } from "vitest"
import {
  normalizeWikiRefKey,
  buildDeletedKeys,
  cleanIndexListing,
  stripDeletedWikilinks,
} from "./wiki-cleanup.js"

describe("normalizeWikiRefKey", () => {
  it("collapses case + separator boundaries", () => {
    expect(normalizeWikiRefKey("KV Cache")).toBe("kvcache")
    expect(normalizeWikiRefKey("kv-cache")).toBe("kvcache")
    expect(normalizeWikiRefKey("kv_cache")).toBe("kvcache")
    expect(normalizeWikiRefKey("wiki/concepts/kv-cache.md")).toBe("kvcache")
  })

  it("trims whitespace", () => {
    expect(normalizeWikiRefKey("  foo  ")).toBe("foo")
  })

  it("preserves CJK", () => {
    expect(normalizeWikiRefKey("默会知识")).toBe("默会知识")
  })
})

describe("cleanIndexListing", () => {
  it("removes index entries whose primary link is deleted", () => {
    const text = `# Index
- [[Foo]] some description
- [[Bar]] kept
- [[Baz]]
`
    const result = cleanIndexListing(text, new Set(["foo", "baz"]))
    expect(result).toContain("[[Bar]]")
    expect(result).not.toContain("[[Foo]]")
    expect(result).not.toContain("[[Baz]]")
  })

  it("preserves headings and prose", () => {
    const text = "# Title\n\nSome prose.\n- [[Foo]]\n"
    const result = cleanIndexListing(text, new Set(["foo"]))
    expect(result).toContain("# Title")
    expect(result).toContain("Some prose.")
  })

  it("returns text unchanged when no deletions", () => {
    expect(cleanIndexListing("- [[Foo]]", new Set())).toBe("- [[Foo]]")
  })
})

describe("stripDeletedWikilinks", () => {
  it("strips wikilinks to deleted pages", () => {
    expect(stripDeletedWikilinks("See [[Foo]] and [[Bar]].", new Set(["foo"])))
      .toBe("See Foo and [[Bar]].")
  })

  it("uses display label when present", () => {
    expect(stripDeletedWikilinks("See [[foo|the Foo]]", new Set(["foo"])))
      .toBe("See the Foo")
  })

  it("does NOT strip substring-collision innocent links", () => {
    expect(stripDeletedWikilinks("[[OpenAI]] and [[AI Safety]]", new Set(["ai"])))
      .toBe("[[OpenAI]] and [[AI Safety]]")
  })
})

describe("buildDeletedKeys", () => {
  it("includes slug and title forms", () => {
    const keys = buildDeletedKeys([{ slug: "kv-cache", title: "KV Cache" }])
    expect(keys.has("kvcache")).toBe(true)
    expect(keys.size).toBe(1)
  })
})
