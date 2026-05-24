import { describe, it, expect, vi, beforeEach } from "vitest"
import { captionImage, mimeFromPath, CAPTION_PROMPT } from "./vision-caption.js"
import * as llmClient from "./llm-client.js"
import type { CliConfig } from "../types/cli.js"

const baseConfig: CliConfig = {
  provider: "openai",
  apiKey: "key",
  model: "gpt-4o",
  maxContextSize: 128000,
  multimodal: { enabled: true, useMainLlm: true },
}

describe("vision-caption", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("guesses mime types from extensions", () => {
    expect(mimeFromPath("a.png")).toBe("image/png")
    expect(mimeFromPath("b.JPG")).toBe("image/jpeg")
    expect(mimeFromPath("c.webp")).toBe("image/webp")
    expect(mimeFromPath("c.gif")).toBe("image/gif")
    expect(mimeFromPath("c.unknown")).toBe("application/octet-stream")
  })

  it("captions image via streamChat", async () => {
    vi.spyOn(llmClient, "streamChat").mockImplementation(async (_cfg, _msgs, cbs) => {
      cbs.onToken("A chart showing sales.")
      cbs.onDone()
    })
    const caption = await captionImage("abc", "image/png", baseConfig)
    expect(caption).toBe("A chart showing sales.")
  })

  it("uses dedicated multimodal provider when configured", async () => {
    const streamSpy = vi.spyOn(llmClient, "streamChat").mockImplementation(async (cfg, _msgs, cbs) => {
      expect(cfg.provider).toBe("anthropic")
      cbs.onToken("ok")
      cbs.onDone()
    })
    await captionImage("abc", "image/png", {
      ...baseConfig,
      multimodal: {
        enabled: true,
        useMainLlm: false,
        provider: "anthropic",
        apiKey: "mm-key",
        model: "claude-3",
      },
    })
    expect(streamSpy).toHaveBeenCalled()
  })

  it("throws when multimodal disabled", async () => {
    await expect(captionImage("abc", "image/png", {
      ...baseConfig,
      multimodal: { enabled: false, useMainLlm: true },
    })).rejects.toThrow(/disabled/)
  })

  it("propagates stream errors", async () => {
    vi.spyOn(llmClient, "streamChat").mockImplementation(async (_cfg, _msgs, cbs) => {
      cbs.onError(new Error("vision failed"))
    })
    await expect(captionImage("abc", "image/png", baseConfig)).rejects.toThrow(/vision failed/)
  })

  it("exports caption prompt", () => {
    expect(CAPTION_PROMPT).toContain("knowledge-base")
  })
})
