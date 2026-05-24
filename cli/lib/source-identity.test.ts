import { describe, it, expect } from "vitest"
import {
  sourceIdentityForPath,
  sourceReferenceIdentity,
  sourceNameMatchesAny,
  sourceSummarySlugFromIdentity,
} from "./source-identity.js"

describe("sourceIdentityForPath", () => {
  it("strips project + raw/sources prefix", () => {
    expect(sourceIdentityForPath("/project", "/project/raw/sources/papers/intro.pdf"))
      .toBe("papers/intro.pdf")
  })

  it("handles Windows backslash paths", () => {
    expect(sourceIdentityForPath("C:/project", "C:\\project\\raw\\sources\\papers\\intro.pdf"))
      .toBe("papers/intro.pdf")
  })

  it("strips a generic raw/sources marker mid-path", () => {
    expect(sourceIdentityForPath("/other", "/anywhere/raw/sources/foo.pdf")).toBe("foo.pdf")
  })

  it("falls back to basename for unrelated paths", () => {
    expect(sourceIdentityForPath("/project", "/tmp/foo.pdf")).toBe("foo.pdf")
  })
})

describe("sourceReferenceIdentity", () => {
  it("strips raw/sources prefix", () => {
    expect(sourceReferenceIdentity("raw/sources/papers/x.pdf")).toBe("papers/x.pdf")
  })

  it("strips marker mid-path", () => {
    expect(sourceReferenceIdentity("/abs/raw/sources/foo.pdf")).toBe("foo.pdf")
  })

  it("returns as-is when no prefix", () => {
    expect(sourceReferenceIdentity("foo.pdf")).toBe("foo.pdf")
  })
})

describe("sourceNameMatchesAny", () => {
  it("matches identical path identities", () => {
    expect(sourceNameMatchesAny("papers/intro.pdf", ["papers/intro.pdf"])).toBe(true)
  })

  it("refuses cross-folder basename collision", () => {
    expect(sourceNameMatchesAny("papers-a/intro.pdf", ["papers-b/intro.pdf"])).toBe(false)
  })

  it("allows basename-only match when neither side has path segments", () => {
    expect(sourceNameMatchesAny("intro.pdf", ["intro.pdf"])).toBe(true)
  })

  it("case-insensitive", () => {
    expect(sourceNameMatchesAny("Papers/INTRO.pdf", ["papers/intro.pdf"])).toBe(true)
  })
})

describe("sourceSummarySlugFromIdentity", () => {
  it("returns simple slug for single-part identity", () => {
    expect(sourceSummarySlugFromIdentity("intro.pdf")).toBe("intro")
  })

  it("encodes multi-part identity with stable hash", () => {
    const a = sourceSummarySlugFromIdentity("papers-a/intro.pdf")
    const b = sourceSummarySlugFromIdentity("papers-b/intro.pdf")
    expect(a).not.toBe(b)
    expect(a).toMatch(/--[0-9a-z]+$/)
  })

  it("is deterministic across calls", () => {
    const a = sourceSummarySlugFromIdentity("papers/x.pdf")
    const b = sourceSummarySlugFromIdentity("papers/x.pdf")
    expect(a).toBe(b)
  })
})
