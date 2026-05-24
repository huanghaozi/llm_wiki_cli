import { describe, it, expect } from "vitest"
import { getOutputLanguage, buildLanguageDirective, buildLanguageReminder } from "./output-language.js"
import type { CliConfig } from "../types/cli.js"

const baseConfig: CliConfig = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o",
  maxContextSize: 128000,
  outputLanguage: "auto",
}

describe("output-language", () => {
  it("uses configured language", () => {
    expect(getOutputLanguage({ ...baseConfig, outputLanguage: "zh" }, "hello")).toBe("zh")
  })

  it("detects languages from text when auto", () => {
    expect(getOutputLanguage(baseConfig, "你好世界")).toBe("zh")
    expect(getOutputLanguage(baseConfig, "こんにちは")).toBe("ja")
    expect(getOutputLanguage(baseConfig, "안녕하세요")).toBe("ko")
    expect(getOutputLanguage(baseConfig, "Hello world")).toBe("en")
  })

  it("defaults to English without fallback text", () => {
    expect(getOutputLanguage(baseConfig)).toBe("en")
  })

  it("builds language directive and reminder", () => {
    expect(buildLanguageDirective({ ...baseConfig, outputLanguage: "en" })).toContain("English")
    expect(buildLanguageReminder({ ...baseConfig, outputLanguage: "fr" })).toContain("French")
    expect(buildLanguageDirective({ ...baseConfig, outputLanguage: "xx" })).toContain("xx")
  })
})
