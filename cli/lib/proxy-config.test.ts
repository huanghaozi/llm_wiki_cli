import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { applyProxyFromConfig, describeProxy } from "./proxy-config.js"
import * as configStore from "./config-store.js"

const ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"]

describe("proxy-config", () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k]
      delete process.env[k]
    }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k]
      else process.env[k] = original[k]
    }
  })

  it("sets HTTP(S)_PROXY env vars when configured", () => {
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      maxContextSize: 128000,
      httpProxy: "http://proxy.local:8080",
    })
    applyProxyFromConfig()
    expect(process.env.HTTP_PROXY).toBe("http://proxy.local:8080")
    expect(process.env.https_proxy).toBe("http://proxy.local:8080")
  })

  it("sets NO_PROXY when configured", () => {
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      maxContextSize: 128000,
      httpProxy: "http://proxy",
      noProxy: "localhost,127.0.0.1",
    })
    applyProxyFromConfig()
    expect(process.env.NO_PROXY).toBe("localhost,127.0.0.1")
    expect(process.env.no_proxy).toBe("localhost,127.0.0.1")
  })

  it("noop when proxy is empty / blank", () => {
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      maxContextSize: 128000,
      httpProxy: "  ",
    })
    applyProxyFromConfig()
    expect(process.env.HTTP_PROXY).toBeUndefined()
  })

  it("describeProxy reports configured value", () => {
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      maxContextSize: 128000,
      httpProxy: "http://proxy:8888",
    })
    expect(describeProxy()).toBe("http://proxy:8888")
  })

  it("describeProxy reports 'Not configured' when absent", () => {
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      maxContextSize: 128000,
    })
    expect(describeProxy()).toBe("Not configured")
  })
})
