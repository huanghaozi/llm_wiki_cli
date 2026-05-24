import { input, select, password, number, confirm } from "@inquirer/prompts"
import chalk from "chalk"
import { loadConfig, saveConfig } from "../lib/config-store.js"
import type { SearchProvider } from "../types/cli.js"

const PROVIDERS = [
  { name: "OpenAI", value: "openai" },
  { name: "Anthropic", value: "anthropic" },
  { name: "Google (Gemini)", value: "google" },
  { name: "Ollama (Local)", value: "ollama" },
  { name: "Custom Endpoint", value: "custom" },
] as const

const SEARCH_PROVIDERS = [
  { name: "None (disabled)", value: "none" },
  { name: "Tavily", value: "tavily" },
  { name: "SerpApi", value: "serpapi" },
  { name: "SearXNG", value: "searxng" },
  { name: "Ollama Web Search", value: "ollama" },
] as const

const OUTPUT_LANGUAGES = [
  { name: "Auto (detect from input)", value: "auto" },
  { name: "English", value: "en" },
  { name: "Chinese (Simplified)", value: "zh" },
  { name: "Japanese", value: "ja" },
  { name: "Korean", value: "ko" },
]

interface ConfigOptions {
  show?: boolean
  webSearch?: boolean
  embedding?: boolean
  multimodal?: boolean
  apiServer?: boolean
  scheduleImport?: boolean
  proxy?: boolean
}

export async function configCommand(options: ConfigOptions = {}) {
  if (options.webSearch) {
    await configWebSearch()
    return
  }
  if (options.embedding) {
    await configEmbedding()
    return
  }
  if (options.multimodal) {
    await configMultimodal()
    return
  }
  if (options.apiServer) {
    await configApiServer()
    return
  }
  if (options.scheduleImport) {
    await configScheduleImport()
    return
  }
  if (options.proxy) {
    await configProxy()
    return
  }

  const config = loadConfig()

  console.log(chalk.bold("\nLLM Wiki CLI Configuration\n"))

  const provider = await select({
    message: "Select LLM provider:",
    choices: PROVIDERS.map((p) => ({ name: p.name, value: p.value })),
    default: config.provider,
  })

  const apiKey = await password({
    message: "API key:",
    mask: "*",
    default: config.apiKey,
  })

  const defaultModel = provider === "anthropic" ? "claude-sonnet-4-2" : provider === "google" ? "gemini-2.0-flash" : "gpt-4o"
  const model = await input({
    message: "Model name:",
    default: config.model || defaultModel,
  })

  let ollamaUrl = config.ollamaUrl
  let customEndpoint = config.customEndpoint

  if (provider === "ollama") {
    ollamaUrl = await input({
      message: "Ollama URL:",
      default: ollamaUrl || "http://localhost:11434",
    })
  } else if (provider === "custom") {
    customEndpoint = await input({
      message: "Custom endpoint URL:",
      default: customEndpoint || "",
    })
  }

  const maxContextSize = await number({
    message: "Max context size (characters):",
    default: config.maxContextSize || 128000,
  })

  const outputLanguage = await select({
    message: "Output language for generated content:",
    choices: OUTPUT_LANGUAGES,
    default: config.outputLanguage ?? "auto",
  })

  const configureSearch = await confirm({
    message: "Configure web search provider now?",
    default: false,
  })

  let searchProvider = config.searchProvider ?? "none"
  let searchApiKey = config.searchApiKey ?? ""
  let searXngUrl = config.searXngUrl
  let serpApiEngine = config.serpApiEngine

  if (configureSearch) {
    const searchConfig = await promptWebSearch(config)
    searchProvider = searchConfig.searchProvider
    searchApiKey = searchConfig.searchApiKey
    searXngUrl = searchConfig.searXngUrl
    serpApiEngine = searchConfig.serpApiEngine
  }

  saveConfig({
    provider,
    apiKey,
    model,
    ollamaUrl,
    customEndpoint,
    maxContextSize: maxContextSize ?? 128000,
    searchProvider,
    searchApiKey,
    searXngUrl,
    serpApiEngine,
    outputLanguage,
  })
  console.log(chalk.green("\nConfiguration saved!"))
}

async function configWebSearch() {
  const config = loadConfig()
  const searchConfig = await promptWebSearch(config)
  saveConfig({ ...config, ...searchConfig })
  console.log(chalk.green("\nWeb search configuration saved!"))
}

async function promptWebSearch(config: ReturnType<typeof loadConfig>) {
  const searchProvider = await select({
    message: "Web search provider:",
    choices: SEARCH_PROVIDERS.map((p) => ({ name: p.name, value: p.value })),
    default: (config.searchProvider ?? "none") as SearchProvider,
  }) as SearchProvider

  let searchApiKey = config.searchApiKey ?? ""
  let searXngUrl = config.searXngUrl
  let serpApiEngine = config.serpApiEngine ?? "google"

  if (searchProvider === "tavily" || searchProvider === "serpapi" || searchProvider === "ollama") {
    searchApiKey = await password({
      message: "Search API key:",
      mask: "*",
      default: searchApiKey,
    })
  }
  if (searchProvider === "searxng") {
    searXngUrl = await input({
      message: "SearXNG instance URL:",
      default: searXngUrl || "https://search.example.com",
    })
  }
  if (searchProvider === "serpapi") {
    serpApiEngine = await input({
      message: "SerpApi engine:",
      default: serpApiEngine,
    })
  }

  return { searchProvider, searchApiKey, searXngUrl, serpApiEngine }
}

async function configEmbedding() {
  const config = loadConfig()
  const emb = config.embedding ?? {
    enabled: false,
    endpoint: "https://api.openai.com/v1/embeddings",
    apiKey: "",
    model: "text-embedding-3-small",
  }

  const enabled = await confirm({ message: "Enable vector search (embeddings)?", default: emb.enabled })
  const endpoint = await input({ message: "Embedding endpoint:", default: emb.endpoint })
  const apiKey = await password({ message: "Embedding API key:", mask: "*", default: emb.apiKey })
  const model = await input({ message: "Embedding model:", default: emb.model })
  const maxChunkChars = await number({ message: "Max chunk chars:", default: emb.maxChunkChars ?? 1000 })

  saveConfig({
    ...config,
    embedding: {
      ...emb,
      enabled,
      endpoint,
      apiKey,
      model,
      maxChunkChars: maxChunkChars ?? 1000,
    },
  })
  console.log(chalk.green("\nEmbedding configuration saved!"))
  console.log(chalk.dim("Run 'llm-wiki embed' to index your wiki."))
}

async function configMultimodal() {
  const config = loadConfig()
  const mm = config.multimodal ?? { enabled: false, useMainLlm: true }

  const enabled = await confirm({ message: "Enable image captioning (vision)?", default: mm.enabled })
  const useMainLlm = await confirm({ message: "Use main LLM for vision?", default: mm.useMainLlm ?? true })

  let provider = mm.provider
  let apiKey = mm.apiKey
  let model = mm.model
  if (enabled && !useMainLlm) {
    provider = await select({
      message: "Vision LLM provider:",
      choices: PROVIDERS.map((p) => ({ name: p.name, value: p.value })),
      default: provider ?? config.provider,
    }) as typeof config.provider
    apiKey = await password({ message: "Vision API key:", mask: "*", default: apiKey ?? "" })
    model = await input({ message: "Vision model:", default: model ?? "gpt-4o" })
  }

  saveConfig({
    ...config,
    multimodal: { enabled, useMainLlm, provider, apiKey, model },
  })
  console.log(chalk.green("\nMultimodal configuration saved!"))
}

async function configApiServer() {
  const config = loadConfig()
  const api = config.apiServer ?? { enabled: true, port: 19828, allowUnauthenticated: true, token: "" }

  const enabled = await confirm({ message: "Enable local API server?", default: api.enabled })
  const port = await number({ message: "API port:", default: api.port })
  const allowUnauthenticated = await confirm({
    message: "Allow unauthenticated access when no token set?",
    default: api.allowUnauthenticated,
  })
  const token = await password({ message: "API token (optional, leave empty for none):", mask: "*", default: api.token })

  saveConfig({
    ...config,
    apiServer: {
      enabled,
      port: port ?? 19828,
      allowUnauthenticated,
      token: token ?? "",
    },
  })
  console.log(chalk.green("\nAPI server configuration saved!"))
  console.log(chalk.dim("Start with: llm-wiki serve"))
}

async function configScheduleImport() {
  const config = loadConfig()
  const si = config.scheduledImport ?? { enabled: false, path: "", intervalMinutes: 60 }

  const enabled = await confirm({ message: "Enable scheduled import?", default: si.enabled })
  const path = await input({
    message: "Watch folder path (empty = project raw/sources):",
    default: si.path,
  })
  const intervalMinutes = await number({
    message: "Scan interval (minutes):",
    default: si.intervalMinutes,
  })

  saveConfig({
    ...config,
    scheduledImport: {
      enabled,
      path,
      intervalMinutes: intervalMinutes ?? 60,
    },
  })
  console.log(chalk.green("\nScheduled import configuration saved!"))
  console.log(chalk.dim("Run: llm-wiki schedule-import -p <project>"))
}

async function configProxy() {
  const config = loadConfig()
  const httpProxy = await input({
    message: "HTTP/HTTPS proxy URL (empty to disable):",
    default: config.httpProxy ?? "",
  })
  const noProxy = await input({
    message: "NO_PROXY hosts (comma-separated, optional):",
    default: config.noProxy ?? "",
  })

  saveConfig({ ...config, httpProxy, noProxy })
  console.log(chalk.green("\nProxy configuration saved!"))
}

export function showConfig() {
  const config = loadConfig()
  console.log(chalk.bold("\nCurrent Configuration:\n"))
  console.log(`  Provider: ${chalk.cyan(config.provider)}`)
  console.log(`  Model: ${chalk.cyan(config.model)}`)
  console.log(`  API Key: ${config.apiKey ? chalk.green("set") : chalk.red("not set")}`)
  if (config.ollamaUrl) console.log(`  Ollama URL: ${chalk.cyan(config.ollamaUrl)}`)
  if (config.customEndpoint) console.log(`  Custom Endpoint: ${chalk.cyan(config.customEndpoint)}`)
  console.log(`  Max Context: ${chalk.cyan(config.maxContextSize.toLocaleString())} chars`)
  console.log(`  Output Language: ${chalk.cyan(config.outputLanguage ?? "auto")}`)
  console.log(`  Web Search: ${chalk.cyan(config.searchProvider ?? "none")}`)
  if (config.searchProvider && config.searchProvider !== "none") {
    console.log(`  Search API Key: ${config.searchApiKey ? chalk.green("set") : chalk.red("not set")}`)
    if (config.searXngUrl) console.log(`  SearXNG URL: ${chalk.cyan(config.searXngUrl)}`)
  }
  console.log(`  Embedding: ${config.embedding?.enabled ? chalk.green("enabled") : chalk.dim("disabled")}`)
  if (config.embedding?.enabled) {
    console.log(`    Model: ${chalk.cyan(config.embedding.model)}`)
    console.log(`    Endpoint: ${chalk.cyan(config.embedding.endpoint)}`)
  }
  console.log(`  Vision Caption: ${config.multimodal?.enabled ? chalk.green("enabled") : chalk.dim("disabled")}`)
  console.log(`  API Server: ${config.apiServer?.enabled !== false ? chalk.green("enabled") : chalk.dim("disabled")}`)
  if (config.apiServer) {
    console.log(`    Port: ${chalk.cyan(String(config.apiServer.port))}`)
    console.log(`    Token: ${config.apiServer.token ? chalk.green("set") : chalk.dim("none")}`)
  }
  console.log(`  Scheduled Import: ${config.scheduledImport?.enabled ? chalk.green("enabled") : chalk.dim("disabled")}`)
  if (config.scheduledImport?.enabled) {
    console.log(`    Interval: ${chalk.cyan(String(config.scheduledImport.intervalMinutes))} min`)
  }
  console.log(`  HTTP Proxy: ${config.httpProxy ? chalk.cyan(config.httpProxy) : chalk.dim("not set")}`)
}
