import type { CliConfig } from "../types/cli.js"
import { buildAzureOpenAiUrl, isAzureOpenAiEndpoint } from "./azure-openai.js"

export type MessageContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; mediaType: string; dataBase64: string }>

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: MessageContent
}

export interface ReasoningOverride {
  /** When set to "off" or "low" we instruct the LLM to avoid emitting
   *  chain-of-thought style reasoning into the visible response. */
  mode?: "off" | "low" | "medium" | "high"
}

export interface RequestOverrides {
  temperature?: number
  max_tokens?: number
  reasoning?: ReasoningOverride
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: Error) => void
  /** Optional channel for `reasoning_content` (DeepSeek-R1, Kimi K2,
   *  Qwen-3, …). When omitted, reasoning tokens are still tracked
   *  internally to power the silent-empty diagnostic. */
  onReasoningToken?: (token: string) => void
}

const DECODER = new TextDecoder()

function parseLines(chunk: Uint8Array, buffer: string): [string[], string] {
  const text = buffer + DECODER.decode(chunk, { stream: true })
  const lines = text.split("\n")
  const remaining = lines.pop() ?? ""
  return [lines, remaining]
}

function getProviderUrl(config: CliConfig): string {
  switch (config.provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions"
    case "anthropic":
      return buildAnthropicUrl(config.customEndpoint || "https://api.anthropic.com")
    case "google":
      return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`
    case "azure":
      return buildAzureOpenAiUrl(
        config.customEndpoint || "",
        config.model,
        "chat/completions",
      )
    case "ollama":
      return `${(config.ollamaUrl || "http://localhost:11434").replace(/\/+$/, "")}/v1/chat/completions`
    case "custom":
      return config.customEndpoint || ""
    default:
      throw new Error(`Unsupported provider: ${(config as { provider?: string }).provider}`)
  }
}

/**
 * Smart Anthropic URL builder — accepts a base host or a partial
 * path and always produces `<base>/v1/messages`. Tolerates users
 * who paste:
 *   - https://api.anthropic.com
 *   - https://api.anthropic.com/v1
 *   - https://api.anthropic.com/v1/messages
 *   - third-party Anthropic-compatible URLs ending in `/anthropic`
 */
function buildAnthropicUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "")
  if (/\/v1\/messages$/i.test(trimmed)) return trimmed
  if (/\/messages$/i.test(trimmed)) return trimmed
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/messages`
  return `${trimmed}/v1/messages`
}

function buildHeaders(config: CliConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.provider === "anthropic") {
    if (config.apiKey) headers["x-api-key"] = config.apiKey
    headers["anthropic-version"] = "2023-06-01"
  } else if (config.provider === "google") {
    if (config.apiKey) headers["x-goog-api-key"] = config.apiKey
  } else if (config.provider === "azure") {
    if (config.apiKey) headers["api-key"] = config.apiKey
  } else if (config.provider === "ollama") {
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  } else {
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  }
  return headers
}

function translateContent(config: CliConfig, content: MessageContent): unknown {
  if (typeof content === "string") return content

  if (config.provider === "anthropic") {
    return content.map((part) => {
      if (part.type === "text") return { type: "text", text: part.text }
      return {
        type: "image",
        source: { type: "base64", media_type: part.mediaType, data: part.dataBase64 },
      }
    })
  }

  if (config.provider === "google") {
    return content.map((part) => {
      if (part.type === "text") return { text: part.text }
      return { inline_data: { mime_type: part.mediaType, data: part.dataBase64 } }
    })
  }

  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text }
    return {
      type: "image_url",
      image_url: { url: `data:${part.mediaType};base64,${part.dataBase64}` },
    }
  })
}

function buildBody(
  config: CliConfig,
  messages: ChatMessage[],
  overrides?: RequestOverrides,
): unknown {
  const mapContent = (m: ChatMessage) => ({
    role: m.role,
    content: translateContent(config, m.content),
  })

  switch (config.provider) {
    case "openai":
    case "azure":
    case "custom":
    case "ollama": {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: messages.map(mapContent),
        stream: true,
      }
      if (overrides?.temperature !== undefined) body.temperature = overrides.temperature
      if (overrides?.max_tokens !== undefined) body.max_tokens = overrides.max_tokens
      if (overrides?.reasoning?.mode) {
        body.reasoning = overrides.reasoning
      }
      return body
    }
    case "anthropic": {
      const sysMsg = messages.find((m) => m.role === "system")
      const sysContent = sysMsg?.content
      const body: Record<string, unknown> = {
        model: config.model,
        messages: messages.filter((m) => m.role !== "system").map(mapContent),
        stream: true,
        max_tokens: overrides?.max_tokens ?? 4096,
      }
      if (sysContent !== undefined) body.system = sysContent
      if (overrides?.temperature !== undefined) body.temperature = overrides.temperature
      return body
    }
    case "google": {
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: typeof m.content === "string"
            ? [{ text: m.content }]
            : (translateContent(config, m.content) as unknown[]),
        }))
      const sys = messages.find((m) => m.role === "system")
      const body: Record<string, unknown> = { contents }
      if (sys) {
        body.systemInstruction = {
          parts: typeof sys.content === "string"
            ? [{ text: sys.content }]
            : (translateContent(config, sys.content) as unknown[]),
        }
      }
      const generationConfig: Record<string, unknown> = {}
      if (overrides?.temperature !== undefined) generationConfig.temperature = overrides.temperature
      if (overrides?.max_tokens !== undefined) generationConfig.maxOutputTokens = overrides.max_tokens
      if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig
      return body
    }
    default:
      throw new Error(`Unsupported provider: ${(config as { provider?: string }).provider}`)
  }
}

interface ParsedStreamChunk {
  content: string
  reasoning: string
  done: boolean
}

function parseStreamLine(provider: string, line: string): ParsedStreamChunk | null {
  if (provider === "google") {
    if (!line.startsWith("data: ")) return null
    const json = line.slice(6).trim()
    if (!json || json === "[DONE]") return null
    try {
      const data = JSON.parse(json)
      const parts = data?.candidates?.[0]?.content?.parts
      if (!Array.isArray(parts)) return null
      let content = ""
      let reasoning = ""
      for (const part of parts) {
        if (typeof part?.text === "string") {
          if (part.thought === true) reasoning += part.text
          else content += part.text
        }
      }
      if (!content && !reasoning) return null
      return { content, reasoning, done: false }
    } catch {
      return null
    }
  }

  if (!line.startsWith("data: ")) return null
  const json = line.slice(6)
  if (json === "[DONE]") return { content: "", reasoning: "", done: true }

  try {
    const data = JSON.parse(json)
    if (provider === "anthropic") {
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
        return { content: data.delta.text ?? "", reasoning: "", done: false }
      }
      if (data.type === "content_block_delta" && data.delta?.type === "thinking_delta") {
        return { content: "", reasoning: data.delta.thinking ?? "", done: false }
      }
      return null
    }
    // OpenAI / Azure / Ollama / custom share the same SSE shape.
    const delta = data.choices?.[0]?.delta ?? data.choices?.[0]?.message ?? null
    if (!delta) return null
    const content = typeof delta.content === "string" ? delta.content : ""
    const reasoning =
      typeof delta.reasoning_content === "string" ? delta.reasoning_content :
      typeof delta.reasoning === "string" ? delta.reasoning : ""
    if (!content && !reasoning) return null
    return { content, reasoning, done: false }
  } catch {
    return null
  }
}

export async function streamChat(
  config: CliConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  overrides?: RequestOverrides,
): Promise<void> {
  const { onToken, onDone, onError, onReasoningToken } = callbacks

  let url: string
  let headers: Record<string, string>
  let body: unknown
  try {
    url = getProviderUrl(config)
    headers = buildHeaders(config)
    body = buildBody(config, messages, overrides)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  let contentChars = 0
  let reasoningChars = 0

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`)
    }

    if (!response.body) {
      throw new Error("No response body")
    }

    const reader = response.body.getReader()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const [lines, remaining] = parseLines(value, buffer)
      buffer = remaining

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        const chunk = parseStreamLine(config.provider, line)
        if (!chunk) continue
        if (chunk.content) {
          onToken(chunk.content)
          contentChars += chunk.content.length
        }
        if (chunk.reasoning) {
          reasoningChars += chunk.reasoning.length
          onReasoningToken?.(chunk.reasoning)
        }
      }
    }

    if (contentChars === 0 && reasoningChars >= 200) {
      throw new Error(
        `Model produced ${reasoningChars} chars of reasoning_content but no actual response content. ` +
        `This often happens with reasoning models (DeepSeek-R1, Kimi K2, Qwen-3) when reasoning output is being routed to the wrong channel. ` +
        `Try a non-reasoning model, increase max_tokens, or set reasoning: { mode: "off" }.`,
      )
    }

    onDone()
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function chatCompletion(
  config: CliConfig,
  messages: ChatMessage[],
  overrides?: RequestOverrides,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let result = ""
    streamChat(
      config,
      messages,
      {
        onToken: (token) => { result += token },
        onDone: () => resolve(result),
        onError: (error) => reject(error),
      },
      undefined,
      overrides,
    )
  })
}

/** Re-export for backward-compat (some tests imported isAzureOpenAiEndpoint indirectly). */
export { isAzureOpenAiEndpoint }

export const llmClientInternals = {
  getProviderUrl,
  buildHeaders,
  buildBody,
  parseStreamLine,
  parseLines,
  buildAnthropicUrl,
}
