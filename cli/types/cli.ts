export type LlmProvider = "openai" | "anthropic" | "google" | "azure" | "ollama" | "custom"
export type SearchProvider = "none" | "tavily" | "serpapi" | "searxng" | "ollama"

export interface EmbeddingConfig {
  enabled: boolean
  endpoint: string
  apiKey: string
  model: string
  outputDimensionality?: number
  maxChunkChars?: number
  overlapChunkChars?: number
}

export interface MultimodalConfig {
  enabled: boolean
  useMainLlm: boolean
  provider?: LlmProvider
  apiKey?: string
  model?: string
  ollamaUrl?: string
  customEndpoint?: string
}

export interface ApiServerConfig {
  enabled: boolean
  port: number
  allowUnauthenticated: boolean
  token: string
}

export interface ScheduledImportConfig {
  enabled: boolean
  path: string
  intervalMinutes: number
}

export interface ProxyConfig {
  httpProxy?: string
  noProxy?: string
}

export interface CliConfig {
  provider: LlmProvider
  apiKey: string
  model: string
  ollamaUrl?: string
  customEndpoint?: string
  maxContextSize: number
  projectPath?: string
  searchProvider?: SearchProvider
  searchApiKey?: string
  searXngUrl?: string
  serpApiEngine?: string
  outputLanguage?: string
  embedding?: EmbeddingConfig
  multimodal?: MultimodalConfig
  apiServer?: ApiServerConfig
  scheduledImport?: ScheduledImportConfig
  httpProxy?: string
  noProxy?: string
}

export interface CliProject {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface ReviewItem {
  id: string
  type: "contradiction" | "duplicate" | "missing-page" | "confirm" | "suggestion"
  title: string
  description: string
  sourcePath?: string
  affectedPages?: string[]
  searchQueries?: string[]
  options: Array<{ label: string; action: string }>
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

export const DEFAULT_EMBEDDING: EmbeddingConfig = {
  enabled: false,
  endpoint: "https://api.openai.com/v1/embeddings",
  apiKey: "",
  model: "text-embedding-3-small",
  maxChunkChars: 1000,
  overlapChunkChars: 200,
}

export const DEFAULT_MULTIMODAL: MultimodalConfig = {
  enabled: false,
  useMainLlm: true,
}

export const DEFAULT_API_SERVER: ApiServerConfig = {
  enabled: true,
  port: 19828,
  allowUnauthenticated: true,
  token: "",
}
