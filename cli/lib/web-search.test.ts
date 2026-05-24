import { describe, it, expect, vi, beforeEach } from "vitest"
import { hasConfiguredSearch, webSearch } from "./web-search.js"
import type { CliConfig } from "../types/cli.js"

const base: CliConfig = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o",
  maxContextSize: 128000,
  searchProvider: "none",
}

describe("web-search", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("detects configured providers", () => {
    expect(hasConfiguredSearch(base)).toBe(false)
    expect(hasConfiguredSearch({ ...base, searchProvider: "tavily", searchApiKey: "key" })).toBe(true)
    expect(hasConfiguredSearch({ ...base, searchProvider: "searxng", searXngUrl: "https://search.example.com" })).toBe(true)
    expect(hasConfiguredSearch({ ...base, searchProvider: "searxng", searXngUrl: "  " })).toBe(false)
  })

  it("throws when search not configured", async () => {
    await expect(webSearch("q", base)).rejects.toThrow(/not configured/)
  })

  it("calls tavily API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "T", url: "https://x.com", content: "snippet" }] }),
    }))
    const results = await webSearch("test", { ...base, searchProvider: "tavily", searchApiKey: "key" })
    expect(results[0]).toMatchObject({ title: "T", source: "Tavily" })
  })

  it("calls serpapi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organic_results: [{ title: "S", link: "https://s.com", snippet: "snip" }],
      }),
    }))
    const results = await webSearch("test", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "key",
      serpApiEngine: "google",
    })
    expect(results[0].source).toBe("SerpApi")
  })

  it("calls searxng with path normalization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "X", url: "https://x.com", content: "c" }] }),
    }))
    const results = await webSearch("test", {
      ...base,
      searchProvider: "searxng",
      searXngUrl: "search.example.com",
    })
    expect(results[0].source).toBe("SearXNG")
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("/search")
  })

  it("calls ollama web search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "O", url: "https://o.com", content: "c" }] }),
    }))
    const results = await webSearch("test", { ...base, searchProvider: "ollama", searchApiKey: "key" })
    expect(results[0].source).toBe("Ollama")
  })

  it("propagates API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(webSearch("test", { ...base, searchProvider: "tavily", searchApiKey: "key" }))
      .rejects.toThrow(/Tavily/)
  })
})
