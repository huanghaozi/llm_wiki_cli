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
  it("uses configured language code", () => {
    expect(getOutputLanguage({ ...baseConfig, outputLanguage: "zh" }, "hello"))
      .toBe("Chinese")
  })

  it("accepts canonical language names too", () => {
    expect(getOutputLanguage({ ...baseConfig, outputLanguage: "Chinese" }, "hello"))
      .toBe("Chinese")
  })

  it("detects CJK languages from fallback text when auto", () => {
    expect(getOutputLanguage(baseConfig, "你好世界你好")).toBe("Chinese")
    expect(getOutputLanguage(baseConfig, "こんにちは世界")).toBe("Japanese")
    expect(getOutputLanguage(baseConfig, "안녕하세요 세계")).toBe("Korean")
  })

  it("detects non-CJK languages too", () => {
    expect(getOutputLanguage(baseConfig, "Bonjour le monde et la France")).toBe("French")
    expect(getOutputLanguage(baseConfig, "Это пример русского текста")).toBe("Russian")
    expect(getOutputLanguage(baseConfig, "Tiếng Việt rất đẹp"))
      .toBe("Vietnamese")
  })

  it("falls back to English when fallback text is empty / ASCII-only", () => {
    expect(getOutputLanguage(baseConfig)).toBe("English")
    expect(getOutputLanguage(baseConfig, "Hello world")).toBe("English")
  })

  it("builds language directive and reminder", () => {
    expect(buildLanguageDirective({ ...baseConfig, outputLanguage: "en" })).toContain("English")
    expect(buildLanguageReminder({ ...baseConfig, outputLanguage: "fr" })).toMatch(/French/i)
    expect(buildLanguageDirective({ ...baseConfig, outputLanguage: "xx" })).toContain("xx")
  })
})
