import { describe, it, expect } from "vitest"
import {
  isAzureOpenAiEndpoint,
  parseAzureOpenAiEndpoint,
  buildAzureOpenAiUrl,
} from "./azure-openai.js"

describe("isAzureOpenAiEndpoint", () => {
  it("matches azure.com hosts", () => {
    expect(isAzureOpenAiEndpoint("https://my-res.openai.azure.com/")).toBe(true)
  })

  it("matches deployment paths even on custom hosts", () => {
    expect(isAzureOpenAiEndpoint("https://foo.com/openai/deployments/x")).toBe(true)
  })

  it("rejects regular OpenAI", () => {
    expect(isAzureOpenAiEndpoint("https://api.openai.com/v1/chat/completions")).toBe(false)
  })
})

describe("parseAzureOpenAiEndpoint", () => {
  it("extracts deployment and apiVersion from full URL", () => {
    const info = parseAzureOpenAiEndpoint(
      "https://my-res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview",
    )
    expect(info.baseUrl).toBe("https://my-res.openai.azure.com")
    expect(info.deployment).toBe("gpt-4o")
    expect(info.apiVersion).toBe("2024-08-01-preview")
  })

  it("uses fallback deployment when path has none", () => {
    const info = parseAzureOpenAiEndpoint(
      "https://my-res.openai.azure.com/",
      "fallback-deployment",
    )
    expect(info.deployment).toBe("fallback-deployment")
  })

  it("defaults to current preview API version when omitted", () => {
    const info = parseAzureOpenAiEndpoint("https://my-res.openai.azure.com/openai/deployments/m/")
    expect(info.apiVersion).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it("throws on malformed URLs", () => {
    expect(() => parseAzureOpenAiEndpoint("not-a-url")).toThrow(/Invalid Azure/)
  })
})

describe("buildAzureOpenAiUrl", () => {
  it("builds chat completion URL with encoded deployment", () => {
    const url = buildAzureOpenAiUrl(
      "https://my-res.openai.azure.com/",
      "gpt-4o-mini",
      "chat/completions",
    )
    expect(url).toContain("/openai/deployments/gpt-4o-mini/chat/completions")
    expect(url).toContain("api-version=")
  })

  it("builds embeddings URL", () => {
    const url = buildAzureOpenAiUrl(
      "https://my-res.openai.azure.com/",
      "text-embedding-3-small",
      "embeddings",
    )
    expect(url).toContain("/embeddings?api-version=")
  })

  it("URL-encodes deployment names with special chars", () => {
    const url = buildAzureOpenAiUrl(
      "https://my-res.openai.azure.com/",
      "gpt 4o/special",
      "chat/completions",
    )
    expect(url).toContain("gpt%204o%2Fspecial")
  })

  it("prefers path deployment over the explicit argument", () => {
    const url = buildAzureOpenAiUrl(
      "https://my-res.openai.azure.com/openai/deployments/path-deployment/",
      "arg-deployment",
      "chat/completions",
    )
    expect(url).toContain("path-deployment")
    expect(url).not.toContain("arg-deployment")
  })

  it("throws when neither path nor arg supplies a deployment", () => {
    expect(() => buildAzureOpenAiUrl(
      "https://my-res.openai.azure.com/",
      "",
      "chat/completions",
    )).toThrow(/deployment name is required/)
  })
})
