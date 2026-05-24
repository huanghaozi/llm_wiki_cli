import type { CliConfig } from "../types/cli.js"
import { detectLanguage } from "./detect-language.js"
import { getLanguagePromptName } from "./language-metadata.js"

/**
 * Resolve the user-configured output language with sensible fallbacks.
 *
 * When `outputLanguage` is unset or `"auto"`, fall back to script-based
 * detection on the provided fallback text — covers 30+ languages now
 * (vs. only zh/ja/ko/en in the old implementation).
 *
 * Returns the canonical language name (English form, e.g. `"Chinese"`,
 * `"Vietnamese"`). Use `buildLanguageDirective` to get the LLM prompt
 * snippet with localized labels.
 */
export function getOutputLanguage(config: CliConfig, fallbackText = ""): string {
  const configured = config.outputLanguage
  if (configured && configured !== "auto") {
    // Accept both BCP-47 codes and full English names. Map the most
    // common codes to canonical names so existing configs still work.
    return canonicalizeLanguage(configured)
  }
  return detectLanguage(fallbackText || "English")
}

export function buildLanguageDirective(config: CliConfig, fallbackText = ""): string {
  const lang = getOutputLanguage(config, fallbackText)
  const promptLang = getLanguagePromptName(lang)
  return [
    `## MANDATORY OUTPUT LANGUAGE: ${promptLang}`,
    `Write all output in ${promptLang}. Ignore source document languages.`,
  ].join("\n")
}

export function buildLanguageReminder(config: CliConfig, fallbackText = ""): string {
  const lang = getOutputLanguage(config, fallbackText)
  const promptLang = getLanguagePromptName(lang)
  return `REMINDER: All output must be in ${promptLang}.`
}

const CODE_TO_NAME: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  "zh-cn": "Chinese",
  "zh-hans": "Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
  ar: "Arabic",
  fa: "Persian",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  hi: "Hindi",
  bn: "Bengali",
  tr: "Turkish",
  pl: "Polish",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  id: "Indonesian",
  el: "Greek",
}

function canonicalizeLanguage(value: string): string {
  const lower = value.trim().toLowerCase()
  if (CODE_TO_NAME[lower]) return CODE_TO_NAME[lower]
  // Already a canonical name? Return it with a normalized capitalization
  // when it's a single-word language.
  return value.trim()
}
