import type { CliConfig } from "../types/cli.js"

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
}

function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh"
  if (/[\u3040-\u30ff]/.test(text)) return "ja"
  if (/[\uac00-\ud7af]/.test(text)) return "ko"
  return "en"
}

export function getOutputLanguage(config: CliConfig, fallbackText = ""): string {
  const configured = config.outputLanguage
  if (configured && configured !== "auto") return configured
  return detectLanguage(fallbackText || "English")
}

export function buildLanguageDirective(config: CliConfig, fallbackText = ""): string {
  const lang = getOutputLanguage(config, fallbackText)
  const promptLang = LANGUAGE_NAMES[lang] ?? lang
  return [
    `## MANDATORY OUTPUT LANGUAGE: ${promptLang}`,
    `Write all output in ${promptLang}. Ignore source document languages.`,
  ].join("\n")
}

export function buildLanguageReminder(config: CliConfig, fallbackText = ""): string {
  const lang = getOutputLanguage(config, fallbackText)
  const promptLang = LANGUAGE_NAMES[lang] ?? lang
  return `REMINDER: All output must be in ${promptLang}.`
}
