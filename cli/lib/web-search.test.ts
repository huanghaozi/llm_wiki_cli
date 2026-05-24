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

function mockOkJson(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  })
}

describe("hasConfiguredSearch", () => {
  it("reports unconfigured baseline", () => {
    expect(hasConfiguredSearch(base)).toBe(false)
  })

  it("recognizes API-key-based providers", () => {
    expect(hasConfiguredSearch({ ...base, searchProvider: "tavily", searchApiKey: "k" })).toBe(true)
    expect(hasConfiguredSearch({ ...base, searchProvider: "serpapi", searchApiKey: "k" })).toBe(true)
    expect(hasConfiguredSearch({ ...base, searchProvider: "ollama", searchApiKey: "k" })).toBe(true)
  })

  it("recognizes SearXNG only when URL is set", () => {
    expect(hasConfiguredSearch({ ...base, searchProvider: "searxng", searXngUrl: "https://x" })).toBe(true)
    expect(hasConfiguredSearch({ ...base, searchProvider: "searxng", searXngUrl: "  " })).toBe(false)
  })
})

describe("webSearch dispatch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws when search is not configured", async () => {
    await expect(webSearch("q", base)).rejects.toThrow(/not configured/)
  })

  it("calls Tavily with search_depth advanced by default", async () => {
    const fetchMock = mockOkJson({
      results: [{ title: "T", url: "https://example.com/article", content: "snippet" }],
    })
    vi.stubGlobal("fetch", fetchMock)
    const results = await webSearch("test", {
      ...base,
      searchProvider: "tavily",
      searchApiKey: "key",
    })
    expect(results[0].title).toBe("T")
    // Source label is hostname per-result (matches GUI behavior).
    expect(results[0].source).toBe("example.com")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.search_depth).toBe("advanced")
    expect(body.include_answer).toBe(false)
  })

  it("calls Tavily with configured search_depth basic", async () => {
    const fetchMock = mockOkJson({ results: [] })
    vi.stubGlobal("fetch", fetchMock)
    await webSearch("test", {
      ...base,
      searchProvider: "tavily",
      searchApiKey: "k",
      tavilySearchDepth: "basic",
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.search_depth).toBe("basic")
  })

  it("calls SerpApi with num= and supports non-organic kinds", async () => {
    const fetchMock = mockOkJson({
      organic_results: [{ title: "S", link: "https://s.com/x", snippet: "snip" }],
      news_results: [{ title: "N", link: "https://news.example.com/a", snippet: "news" }],
    })
    vi.stubGlobal("fetch", fetchMock)
    const results = await webSearch("test", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "key",
      serpApiEngine: "google",
    }, 5)
    expect(results.length).toBe(2)
    const calledUrl = fetchMock.mock.calls[0][0] as URL
    expect(calledUrl.toString()).toContain("num=5")
  })

  it("SerpApi surfaces data.error", async () => {
    vi.stubGlobal("fetch", mockOkJson({ error: "Invalid query" }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "k",
    })).rejects.toThrow(/Invalid query/)
  })

  it("calls SearXNG with path normalization and categories CSV", async () => {
    const fetchMock = mockOkJson({
      results: [{ title: "X", url: "https://x.com/p", content: "c" }],
    })
    vi.stubGlobal("fetch", fetchMock)
    await webSearch("test", {
      ...base,
      searchProvider: "searxng",
      searXngUrl: "search.example.com",
      searXngCategories: ["general", "news"],
    })
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("/search")
    expect(calledUrl).toContain("categories=general%2Cnews")
  })

  it("Ollama 401 returns a specific error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "ollama",
      searchApiKey: "k",
    })).rejects.toThrow(/rejected the API key/)
  })

  it("propagates Tavily API errors with status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }))
    await expect(webSearch("test", {
      ...base,
      searchProvider: "tavily",
      searchApiKey: "key",
    })).rejects.toThrow(/Tavily/)
  })

  it("rejects when Tavily API key missing", async () => {
    await expect(webSearch("q", {
      ...base,
      searchProvider: "tavily",
      searchApiKey: "",
    })).rejects.toThrow(/Tavily API key/)
  })

  it("rejects when SerpApi key missing", async () => {
    await expect(webSearch("q", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "",
    })).rejects.toThrow(/SerpApi/)
  })

  it("rejects when SearXNG URL missing", async () => {
    await expect(webSearch("q", {
      ...base,
      searchProvider: "searxng",
      searXngUrl: "",
    })).rejects.toThrow(/SearXNG URL/)
  })

  it("rejects when Ollama key missing", async () => {
    await expect(webSearch("q", {
      ...base,
      searchProvider: "ollama",
      searchApiKey: "",
    })).rejects.toThrow(/API key/)
  })

  it("propagates SearXNG API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "down",
    }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "searxng",
      searXngUrl: "https://x.com",
    })).rejects.toThrow(/SearXNG/)
  })

  it("propagates Ollama API errors (non-401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "ollama",
      searchApiKey: "k",
    })).rejects.toThrow(/Ollama web search failed: 502/)
  })

  it("propagates Ollama API data.error payloads", async () => {
    vi.stubGlobal("fetch", mockOkJson({
      error: { message: "Quota exceeded" },
    }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "ollama",
      searchApiKey: "k",
    })).rejects.toThrow(/Quota exceeded/)
  })

  it("propagates SerpApi API errors (HTTP)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }))
    await expect(webSearch("q", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "k",
    })).rejects.toThrow(/SerpApi/)
  })

  it("SearXNG keeps existing /search suffix", async () => {
    const fetchMock = mockOkJson({ results: [] })
    vi.stubGlobal("fetch", fetchMock)
    await webSearch("q", {
      ...base,
      searchProvider: "searxng",
      searXngUrl: "https://search.example.com/search",
    })
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("/search")
    expect(calledUrl).not.toContain("/search/search")
  })

  it("normalizes SerpApi result with .url instead of .link", async () => {
    vi.stubGlobal("fetch", mockOkJson({
      organic_results: [{ title: "Z", url: "https://z.com/p", description: "alt" }],
    }))
    const results = await webSearch("q", {
      ...base,
      searchProvider: "serpapi",
      searchApiKey: "k",
    })
    expect(results[0].url).toBe("https://z.com/p")
    expect(results[0].snippet).toBe("alt")
  })

  it("source falls back to provider name for non-URL results", async () => {
    vi.stubGlobal("fetch", mockOkJson({ results: [{ title: "T", url: "not a url", content: "c" }] }))
    const results = await webSearch("q", {
      ...base,
      searchProvider: "tavily",
      searchApiKey: "k",
    })
    expect(results[0].source).toBe("Tavily")
  })
})
