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

describe("llm-client provider URLs", () => {
  it("builds OpenAI URL", () => {
    expect(llmClientInternals.getProviderUrl(baseConfig)).toBe("https://api.openai.com/v1/chat/completions")
  })

  it("builds Anthropic URL with custom base normalization", () => {
    expect(llmClientInternals.getProviderUrl({ ...baseConfig, provider: "anthropic" })).toBe("https://api.anthropic.com/v1/messages")
    expect(llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "anthropic",
      customEndpoint: "https://api.anthropic.com/v1",
    })).toBe("https://api.anthropic.com/v1/messages")
    expect(llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "anthropic",
      customEndpoint: "https://api.anthropic.com/v1/messages",
    })).toBe("https://api.anthropic.com/v1/messages")
  })

  it("builds Google URL with SSE alt", () => {
    const url = llmClientInternals.getProviderUrl({ ...baseConfig, provider: "google" })
    expect(url).toContain(":streamGenerateContent?alt=sse")
    expect(url).not.toContain("?key=") // Auth via header
  })

  it("builds Ollama URL using OpenAI-compatible path", () => {
    expect(llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "ollama",
      ollamaUrl: "http://127.0.0.1:11434",
    })).toBe("http://127.0.0.1:11434/v1/chat/completions")
  })

  it("builds Azure URL from deployment endpoint", () => {
    const url = llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "azure",
      model: "my-deployment",
      customEndpoint: "https://my-resource.openai.azure.com",
    })
    expect(url).toBe("https://my-resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-08-01-preview")
  })

  it("custom provider passes through endpoint", () => {
    expect(llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "custom",
      customEndpoint: "https://proxy/v1/chat",
    })).toBe("https://proxy/v1/chat")
  })

  it("throws for unsupported provider", () => {
    expect(() => llmClientInternals.getProviderUrl({
      ...baseConfig,
      provider: "unknown" as CliConfig["provider"],
    })).toThrow(/Unsupported/)
  })
})

describe("llm-client headers", () => {
  it("sets x-api-key for Anthropic", () => {
    const h = llmClientInternals.buildHeaders({ ...baseConfig, provider: "anthropic" })
    expect(h["x-api-key"]).toBe("test-key")
    expect(h["anthropic-version"]).toBe("2023-06-01")
    expect(h.Authorization).toBeUndefined()
  })

  it("sets x-goog-api-key for Google", () => {
    const h = llmClientInternals.buildHeaders({ ...baseConfig, provider: "google" })
    expect(h["x-goog-api-key"]).toBe("test-key")
    expect(h.Authorization).toBeUndefined()
  })

  it("sets api-key for Azure", () => {
    const h = llmClientInternals.buildHeaders({ ...baseConfig, provider: "azure" })
    expect(h["api-key"]).toBe("test-key")
  })

  it("sets Bearer Authorization for OpenAI", () => {
    const h = llmClientInternals.buildHeaders(baseConfig)
    expect(h.Authorization).toBe("Bearer test-key")
  })
})

describe("llm-client body", () => {
  it("OpenAI body with multimodal content", () => {
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

  it("Anthropic body separates system message", () => {
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

  it("Google body builds contents and systemInstruction", () => {
    const body = llmClientInternals.buildBody(
      { ...baseConfig, provider: "google" },
      [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "hello" },
      ],
    ) as { contents: Array<{ role: string }>; systemInstruction?: { parts: unknown[] } }
    expect(body.contents[0].role).toBe("user")
    expect(body.systemInstruction).toBeDefined()
  })

  it("body applies request overrides (temperature/max_tokens)", () => {
    const body = llmClientInternals.buildBody(
      baseConfig,
      [{ role: "user", content: "hi" }],
      { temperature: 0.1, max_tokens: 2048 },
    ) as { temperature?: number; max_tokens?: number }
    expect(body.temperature).toBe(0.1)
    expect(body.max_tokens).toBe(2048)
  })

  it("Google maps overrides into generationConfig", () => {
    const body = llmClientInternals.buildBody(
      { ...baseConfig, provider: "google" },
      [{ role: "user", content: "hi" }],
      { temperature: 0.2, max_tokens: 512 },
    ) as { generationConfig: { temperature: number; maxOutputTokens: number } }
    expect(body.generationConfig.temperature).toBe(0.2)
    expect(body.generationConfig.maxOutputTokens).toBe(512)
  })
})

describe("llm-client parseStreamLine", () => {
  it("parses OpenAI content delta", () => {
    expect(llmClientInternals.parseStreamLine(
      "openai",
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
    )).toEqual({ content: "Hi", reasoning: "", done: false })
  })

  it("parses OpenAI [DONE] marker", () => {
    expect(llmClientInternals.parseStreamLine("openai", "data: [DONE]"))
      .toEqual({ content: "", reasoning: "", done: true })
  })

  it("parses OpenAI reasoning_content separately", () => {
    const r = llmClientInternals.parseStreamLine(
      "openai",
      'data: {"choices":[{"delta":{"reasoning_content":"thinking…"}}]}',
    )
    expect(r).toEqual({ content: "", reasoning: "thinking…", done: false })
  })

  it("parses Anthropic text delta", () => {
    expect(llmClientInternals.parseStreamLine(
      "anthropic",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}',
    )).toEqual({ content: "Yo", reasoning: "", done: false })
  })

  it("parses Anthropic thinking delta into reasoning channel", () => {
    expect(llmClientInternals.parseStreamLine(
      "anthropic",
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"ponder"}}',
    )).toEqual({ content: "", reasoning: "ponder", done: false })
  })

  it("parses Google SSE data line with content text", () => {
    const r = llmClientInternals.parseStreamLine(
      "google",
      'data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]}}]}',
    )
    expect(r).toEqual({ content: "Gemini", reasoning: "", done: false })
  })

  it("parses Google SSE data line with thought parts as reasoning", () => {
    const r = llmClientInternals.parseStreamLine(
      "google",
      'data: {"candidates":[{"content":{"parts":[{"text":"thinking","thought":true},{"text":"answer"}]}}]}',
    )
    expect(r).toEqual({ content: "answer", reasoning: "thinking", done: false })
  })

  it("rejects non-data Google lines", () => {
    expect(llmClientInternals.parseStreamLine("google", "garbage")).toBeNull()
    expect(llmClientInternals.parseStreamLine("google", "data: [DONE]")).toBeNull()
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

  it("routes reasoning tokens to onReasoningToken", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n',
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n',
        "data: [DONE]\n",
      ]),
    }))

    const tokens: string[] = []
    const reasoning: string[] = []
    await streamChat(baseConfig, [{ role: "user", content: "hi" }], {
      onToken: (t) => tokens.push(t),
      onDone: () => {},
      onError: (e) => { throw e },
      onReasoningToken: (t) => reasoning.push(t),
    })
    expect(tokens.join("")).toBe("answer")
    expect(reasoning.join("")).toBe("thinking")
  })

  it("emits diagnostic when only reasoning is produced", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream([
        `data: {"choices":[{"delta":{"reasoning_content":"${"x".repeat(300)}"}}]}\n`,
        "data: [DONE]\n",
      ]),
    }))

    const err = await new Promise<Error>((resolve) => {
      streamChat(baseConfig, [{ role: "user", content: "hi" }], {
        onToken: () => {},
        onDone: () => resolve(new Error("should not have completed cleanly")),
        onError: resolve,
      })
    })
    expect(err.message).toMatch(/reasoning_content/i)
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

  it("Anthropic streaming parses text deltas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n',
      ]),
    }))
    const tokens: string[] = []
    await streamChat({ ...baseConfig, provider: "anthropic" }, [{ role: "user", content: "hi" }], {
      onToken: (t) => tokens.push(t),
      onDone: () => {},
      onError: (e) => { throw e },
    })
    expect(tokens.join("")).toBe("Hi there")
  })

  it("Google streaming parses SSE format", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: mockSseStream([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi "}]}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"there"}]}}]}\n',
      ]),
    }))
    const tokens: string[] = []
    await streamChat({ ...baseConfig, provider: "google" }, [{ role: "user", content: "hi" }], {
      onToken: (t) => tokens.push(t),
      onDone: () => {},
      onError: (e) => { throw e },
    })
    expect(tokens.join("")).toBe("Hi there")
  })
})
