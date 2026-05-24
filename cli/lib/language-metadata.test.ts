import { describe, it, expect } from "vitest"
import {
  getLanguageMetadata,
  getLanguagePromptName,
  getTextDirection,
  getHtmlLang,
  sameScriptFamily,
} from "./language-metadata.js"

describe("getLanguageMetadata", () => {
  it("returns canonical metadata for known languages", () => {
    expect(getLanguageMetadata("English").htmlLang).toBe("en")
    expect(getLanguageMetadata("Chinese").htmlLang).toBe("zh-Hans")
    expect(getLanguageMetadata("Traditional Chinese").htmlLang).toBe("zh-Hant")
  })

  it("returns a sensible default for unknown languages, preserving the name", () => {
    const meta = getLanguageMetadata("Klingon")
    expect(meta.promptName).toBe("Klingon")
    expect(meta.direction).toBe("ltr")
    expect(meta.scriptFamily).toBe("latin")
  })

  it("returns English defaults for empty input", () => {
    const meta = getLanguageMetadata("")
    expect(meta.promptName).toBe("English")
  })
})

describe("getLanguagePromptName", () => {
  it("includes native form for non-English languages", () => {
    expect(getLanguagePromptName("Russian")).toContain("Русский")
    expect(getLanguagePromptName("Arabic")).toContain("العربية")
  })

  it("returns plain English for English", () => {
    expect(getLanguagePromptName("English")).toBe("English")
  })
})

describe("getTextDirection", () => {
  it("returns rtl for Arabic and Persian", () => {
    expect(getTextDirection("Arabic")).toBe("rtl")
    expect(getTextDirection("Persian")).toBe("rtl")
  })

  it("returns ltr for European and CJK languages", () => {
    expect(getTextDirection("English")).toBe("ltr")
    expect(getTextDirection("Chinese")).toBe("ltr")
    expect(getTextDirection("Russian")).toBe("ltr")
  })
})

describe("getHtmlLang", () => {
  it("returns ISO codes for known languages", () => {
    expect(getHtmlLang("French")).toBe("fr")
    expect(getHtmlLang("Japanese")).toBe("ja")
  })

  it("returns undefined for unknown languages", () => {
    expect(getHtmlLang("Klingon")).toBeUndefined()
  })
})

describe("sameScriptFamily", () => {
  it("groups CJK languages together", () => {
    expect(sameScriptFamily("Chinese", "Japanese")).toBe(true)
    expect(sameScriptFamily("Korean", "Traditional Chinese")).toBe(true)
  })

  it("separates Arabic-script languages from Latin", () => {
    expect(sameScriptFamily("Arabic", "English")).toBe(false)
    expect(sameScriptFamily("Persian", "Arabic")).toBe(true)
  })

  it("treats unknown languages as latin by default", () => {
    expect(sameScriptFamily("Klingon", "English")).toBe(true)
  })
})
