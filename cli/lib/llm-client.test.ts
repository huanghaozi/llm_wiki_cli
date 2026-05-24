import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  streamChat,
  chatCompletion,
  llmClientInternals,
  type ChatMessage,
} from "./llm-client.js"
import type { CliConfig } from "../types/cli.js"

const baseConfig: CliConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4o",
  maxContextSize: 128000,
}

function mockSseStream(chunks: string[]) {
  const encoder = new TextEncoder()
  return {
    getReader: () => {
      let i = 0
      return {
        read: async () => {
          if (i >= chunks.length) return { done: true, value: undefined }
          const value = encoder.encode(chunks[i++])
          return { done: false, value }
        },
      }
    },
  }
}

describe("llm-client internals", () => {
  it("builds provider URLs", () => {
    expect(llmClientInternals.getProviderUrl(baseConfig)).toContain("openai.com")
    expect(llmClientInternals.getProviderUrl({ ...baseConfig, provider: "anthropic" })).toContain("anthropic.com")
    expect(llmClientInternals.getProviderUrl({ ...baseConfig, provider: "ollama", ollamaUrl: "http://127.0.0.1:11434" }))
      .toBe("http://127.0.0.1:11434/api/chat")
    expect(llmClientInternals.getProviderUrl({ ...baseConfig, provider: "custom", customEndpoint: "https://proxy/v1/chat" }))
      .toBe("https://proxy/v1/chat")
  })

  it("builds OpenAI request body with multimodal content", () => {
    const messages: ChatMessage[] = [{
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", mediaType: "image/png", dataBase64: "abc" },
      ],
    }]
    const body = llmClientInternals.buildBody(baseConfig, messages) as { messages: Array<{ content: unknown[] }> }
    expect(body.messages[0].content[1]).toMatchObject({ type: "image_url" })
  })

  it("builds Anthropic headers and body", () => {
    const headers = llmClientInternals.buildHeaders({ ...baseConfig, provider: "anthropic" })
    expect(headers["x-api-key"]).toBe("test-key")
    const body = llmClientInternals.buildBody(
      { ...baseConfig, provider: "anthropic" },
      [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    ) as { messages: unknown[]; system: string }
    expect(body.system).toBe("sys")
    expect(body.messages).toHaveLength(1)
  })

  it("builds Google request body", () => {
    const body = llmClientInternals.buildBody(
      { ...baseConfig, provider: "google" },
      [{ role: "user", content: "hello" }],
    ) as { contents: Array<{ role: string }> }
    expect(body.contents[0].role).toBe("user")
  })

  it("parses OpenAI stream lines", () => {
    const token = llmClientInternals.parseStreamLine(
      "openai",
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
    )
    expect(token).toBe("Hi")
    expect(llmClientInternals.parseStreamLine("openai", "data: [DONE]")).toBeNull()
  })

  it("parses Anthropic stream lines", () => {
    const token = llmClientInternals.parseStreamLine(
      "anthropic",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}',
    )
    expect(token).toBe("Yo")
  })

  it("parses Google stream lines", () => {
    const line = JSON.stringify([{ candidates: [{ content: { parts: [{ text: "Gemini" }] } }] }])
    expect(llmClientInternals.parseStreamLine("google", line)).toBe("Gemini")
  })

  it("parseLines handles partial chunks", () => {
    const enc = new TextEncoder()
    const [lines, rest] = llmClientInternals.parseLines(enc.encode("data: a\n"), "")
    expect(lines).toEqual(["data: a"])
    expect(rest).toBe("")
  })
  it("throws for unsupported provider URL", () => {
    expect(() => llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "unknown" as CliConfig["provider"],
    })).toThrow(/Unsupported/)
  })

  it("uses google auth via query param only", () => {
    const headers = llmClientInternals.buildHeaders({ ...baseConfig, provider: "google" })
    expect(headers.Authorization).toBeUndefined()
  })
})

describe("llm-client streamChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("streams tokens from OpenAI-compatible SSE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        "data: [DONE]\n",
      ]),
    }))

    const tokens: string[] = []
    await streamChat(baseConfig, [{ role: "user", content: "hi" }], {
      onToken: (t) => tokens.push(t),
      onDone: () => {},
      onError: (e) => { throw e },
    })
    expect(tokens.join("")).toBe("Hello")
  })

  it("reports missing response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: null }))

    const err = await new Promise<Error>((resolve) => {
      streamChat(baseConfig, [{ role: "user", content: "hi" }], {
        onToken: () => {},
        onDone: () => resolve(new Error("unexpected done")),
        onError: resolve,
      })
    })
    expect(err.message).toContain("No response body")
  })

  it("reports HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    }))

    const err = await new Promise<Error>((resolve) => {
      streamChat(baseConfig, [{ role: "user", content: "hi" }], {
        onToken: () => {},
        onDone: () => resolve(new Error("should not complete")),
        onError: resolve,
      })
    })
    expect(err.message).toContain("401")
  })

  it("chatCompletion aggregates tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream(['data: {"choices":[{"delta":{"content":"OK"}}]}\n']),
    }))
    const text = await chatCompletion(baseConfig, [{ role: "user", content: "ping" }])
    expect(text).toBe("OK")
  })
})
