import type { CliConfig } from "../types/cli.js"

export type MessageContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; mediaType: string; dataBase64: string }>

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: MessageContent
}

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: Error) => void
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
      return "https://api.anthropic.com/v1/messages"
    case "google":
      return `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}`
    case "ollama":
      return `${config.ollamaUrl || "http://localhost:11434"}/api/chat`
    case "custom":
      return config.customEndpoint || ""
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

function buildHeaders(config: CliConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey
    headers["anthropic-version"] = "2023-06-01"
  } else if (config.provider !== "google") {
    headers["Authorization"] = `Bearer ${config.apiKey}`
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

  // OpenAI / Ollama / custom
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text }
    return {
      type: "image_url",
      image_url: { url: `data:${part.mediaType};base64,${part.dataBase64}` },
    }
  })
}

function buildBody(config: CliConfig, messages: ChatMessage[]): unknown {
  const mapContent = (m: ChatMessage) => ({
    role: m.role,
    content: translateContent(config, m.content),
  })

  switch (config.provider) {
    case "openai":
    case "custom":
    case "ollama":
      return {
        model: config.model,
        messages: messages.map(mapContent),
        stream: true,
      }
    case "anthropic":
      return {
        model: config.model,
        messages: messages.filter((m) => m.role !== "system").map(mapContent),
        system: messages.find((m) => m.role === "system")?.content,
        stream: true,
        max_tokens: 4096,
      }
    case "google": {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: translateContent(config, m.content),
      }))
      return { contents }
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

function parseStreamLine(provider: string, line: string): string | null {
  if (provider === "google") {
    if (!line.startsWith("[")) return null
    try {
      const data = JSON.parse(line)
      if (Array.isArray(data) && data[0]?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data[0].candidates[0].content.parts[0].text
      }
      return null
    } catch {
      return null
    }
  }

  if (!line.startsWith("data: ")) return null
  const json = line.slice(6)
  if (json === "[DONE]") return null

  try {
    const data = JSON.parse(json)
    if (provider === "anthropic") {
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
        return data.delta.text
      }
      return null
    }
    return data.choices?.[0]?.delta?.content || data.message?.content || ""
  } catch {
    return null
  }
}

export async function streamChat(
  config: CliConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onToken, onDone, onError } = callbacks

  const url = getProviderUrl(config)
  const headers = buildHeaders(config)
  const body = buildBody(config, messages)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
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

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const token = parseStreamLine(config.provider, trimmed)
        if (token) onToken(token)
      }
    }

    onDone()
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function chatCompletion(config: CliConfig, messages: ChatMessage[]): Promise<string> {
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
    )
  })
}

export const llmClientInternals = {
  getProviderUrl,
  buildHeaders,
  buildBody,
  parseStreamLine,
  parseLines,
}
