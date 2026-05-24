import type { CliConfig } from "../types/cli.js"

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export function hasConfiguredSearch(config: CliConfig): boolean {
  const provider = config.searchProvider ?? "none"
  if (provider === "none") return false
  if (provider === "searxng") return Boolean(config.searXngUrl?.trim())
  return Boolean(config.searchApiKey?.trim())
}

export async function webSearch(
  query: string,
  config: CliConfig,
  maxResults = 10,
): Promise<WebSearchResult[]> {
  const provider = config.searchProvider ?? "none"
  switch (provider) {
    case "tavily":
      return tavilySearch(query, config, maxResults)
    case "serpapi":
      return serpApiSearch(query, config, maxResults)
    case "searxng":
      return searXngSearch(query, config, maxResults)
    case "ollama":
      return ollamaSearch(query, config.searchApiKey ?? "", maxResults)
    default:
      throw new Error("Web search not configured. Run 'llm-wiki config --web-search'.")
  }
}

function hostnameFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return fallback
  }
}

async function tavilySearch(
  query: string,
  config: CliConfig,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const apiKey = (config.searchApiKey ?? "").trim()
  if (!apiKey) throw new Error("Tavily API key missing")
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: config.tavilySearchDepth ?? "advanced",
      include_answer: false,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Tavily search failed: ${response.status} ${text.slice(0, 200)}`)
  }
  const data = await response.json() as {
    results?: Array<{ title: string; url: string; content: string }>
  }
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: hostnameFromUrl(r.url, "Tavily"),
  }))
}

interface SerpApiResultShape {
  title?: string
  link?: string
  url?: string
  snippet?: string
  description?: string
}

function normalizeSerpApiResults(
  rows: SerpApiResultShape[] | undefined,
  maxResults: number,
  defaultSource: string,
): WebSearchResult[] {
  return (rows ?? []).slice(0, maxResults).map((r) => {
    const url = r.link ?? r.url ?? ""
    return {
      title: r.title ?? "",
      url,
      snippet: r.snippet ?? r.description ?? "",
      source: hostnameFromUrl(url, defaultSource),
    }
  })
}

async function serpApiSearch(
  query: string,
  config: CliConfig,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const apiKey = (config.searchApiKey ?? "").trim()
  if (!apiKey) throw new Error("SerpApi API key missing")
  const engine = config.serpApiEngine ?? "google"
  const url = new URL("https://serpapi.com/search.json")
  url.searchParams.set("engine", engine)
  url.searchParams.set("q", query)
  url.searchParams.set("num", String(maxResults))
  url.searchParams.set("api_key", apiKey)

  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`SerpApi search failed: ${response.status} ${text.slice(0, 200)}`)
  }
  const data = await response.json() as {
    error?: string
    organic_results?: SerpApiResultShape[]
    news_results?: SerpApiResultShape[]
    images_results?: SerpApiResultShape[]
    videos_results?: SerpApiResultShape[]
    video_results?: SerpApiResultShape[]
    shopping_results?: SerpApiResultShape[]
  }
  if (data.error) throw new Error(`SerpApi: ${data.error}`)
  // Combine result rows from any of the result kinds SerpApi may return.
  const allRows = [
    ...(data.organic_results ?? []),
    ...(data.news_results ?? []),
    ...(data.images_results ?? []),
    ...(data.videos_results ?? data.video_results ?? []),
    ...(data.shopping_results ?? []),
  ]
  return normalizeSerpApiResults(allRows, maxResults, "SerpApi")
}

async function searXngSearch(
  query: string,
  config: CliConfig,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const trimmed = (config.searXngUrl ?? "").trim()
  if (!trimmed) throw new Error("SearXNG URL not configured")
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = path.endsWith("/search") ? path : `${path}/search`
  url.searchParams.set("q", query)
  url.searchParams.set("format", "json")
  const categories = (config.searXngCategories?.length ? config.searXngCategories : ["general"]).join(",")
  url.searchParams.set("categories", categories)

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`SearXNG search failed: ${response.status} ${text.slice(0, 200)}`)
  }
  const data = await response.json() as {
    results?: Array<{ title: string; url: string; content?: string }>
  }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content ?? "",
    source: hostnameFromUrl(r.url, "SearXNG"),
  }))
}

async function ollamaSearch(query: string, apiKey: string, maxResults: number): Promise<WebSearchResult[]> {
  const key = apiKey.trim()
  if (!key) throw new Error("Ollama web-search API key missing")
  const response = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query, max_results: maxResults }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    if (response.status === 401) {
      throw new Error("Ollama web-search rejected the API key (401). Generate a new key at https://ollama.com/settings/keys.")
    }
    throw new Error(`Ollama web search failed: ${response.status} ${text.slice(0, 200)}`)
  }
  const data = await response.json() as { results?: Array<{ title: string; url: string; content: string }>; error?: { field?: string; message?: string } }
  if (data.error) {
    throw new Error(`Ollama web search: ${data.error.message ?? "unknown error"}`)
  }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: hostnameFromUrl(r.url, "Ollama"),
  }))
}
