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
      return tavilySearch(query, config.searchApiKey ?? "", maxResults)
    case "serpapi":
      return serpApiSearch(query, config.searchApiKey ?? "", maxResults, config.serpApiEngine ?? "google")
    case "searxng":
      return searXngSearch(query, config.searXngUrl ?? "", maxResults)
    case "ollama":
      return ollamaSearch(query, config.searchApiKey ?? "", maxResults)
    default:
      throw new Error("Web search not configured. Run 'llm-wiki config --web-search'.")
  }
}

async function tavilySearch(query: string, apiKey: string, maxResults: number): Promise<WebSearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults }),
  })
  if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`)
  const data = await response.json() as { results?: Array<{ title: string; url: string; content: string }> }
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: "Tavily",
  }))
}

async function serpApiSearch(
  query: string,
  apiKey: string,
  maxResults: number,
  engine: string,
): Promise<WebSearchResult[]> {
  const url = new URL("https://serpapi.com/search.json")
  url.searchParams.set("engine", engine)
  url.searchParams.set("q", query)
  url.searchParams.set("api_key", apiKey)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`SerpApi search failed: ${response.status}`)
  const data = await response.json() as { organic_results?: Array<{ title: string; link: string; snippet: string }> }
  return (data.organic_results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    source: "SerpApi",
  }))
}

async function searXngSearch(query: string, instanceUrl: string, maxResults: number): Promise<WebSearchResult[]> {
  const trimmed = instanceUrl.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = path.endsWith("/search") ? path : `${path}/search`
  url.searchParams.set("q", query)
  url.searchParams.set("format", "json")
  url.searchParams.set("categories", "general")

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } })
  if (!response.ok) throw new Error(`SearXNG search failed: ${response.status}`)
  const data = await response.json() as { results?: Array<{ title: string; url: string; content?: string }> }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content ?? "",
    source: "SearXNG",
  }))
}

async function ollamaSearch(query: string, apiKey: string, maxResults: number): Promise<WebSearchResult[]> {
  const response = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, max_results: maxResults }),
  })
  if (!response.ok) throw new Error(`Ollama web search failed: ${response.status}`)
  const data = await response.json() as { results?: Array<{ title: string; url: string; content: string }> }
  return (data.results ?? []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: "Ollama",
  }))
}
