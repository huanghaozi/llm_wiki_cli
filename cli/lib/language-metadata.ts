export type TextDirection = "ltr" | "rtl"

interface LanguageMetadata {
  promptName: string
  htmlLang?: string
  direction: TextDirection
  scriptFamily: "arabic" | "cjk" | "latin" | "other"
}

const LANGUAGE_METADATA: Record<string, LanguageMetadata> = {
  English: { promptName: "English", htmlLang: "en", direction: "ltr", scriptFamily: "latin" },
  Arabic: { promptName: "Arabic / العربية", htmlLang: "ar", direction: "rtl", scriptFamily: "arabic" },
  Persian: { promptName: "Persian (Farsi / فارسی)", htmlLang: "fa", direction: "rtl", scriptFamily: "arabic" },
  Hebrew: { promptName: "Hebrew / עברית", htmlLang: "he", direction: "rtl", scriptFamily: "other" },
  Chinese: { promptName: "Chinese", htmlLang: "zh-Hans", direction: "ltr", scriptFamily: "cjk" },
  "Traditional Chinese": { promptName: "Traditional Chinese", htmlLang: "zh-Hant", direction: "ltr", scriptFamily: "cjk" },
  Japanese: { promptName: "Japanese", htmlLang: "ja", direction: "ltr", scriptFamily: "cjk" },
  Korean: { promptName: "Korean", htmlLang: "ko", direction: "ltr", scriptFamily: "cjk" },
  Vietnamese: { promptName: "Vietnamese / Tiếng Việt", htmlLang: "vi", direction: "ltr", scriptFamily: "latin" },
  Thai: { promptName: "Thai / ภาษาไทย", htmlLang: "th", direction: "ltr", scriptFamily: "other" },
  Hindi: { promptName: "Hindi / हिन्दी", htmlLang: "hi", direction: "ltr", scriptFamily: "other" },
  Bengali: { promptName: "Bengali / বাংলা", htmlLang: "bn", direction: "ltr", scriptFamily: "other" },
  Tamil: { promptName: "Tamil / தமிழ்", htmlLang: "ta", direction: "ltr", scriptFamily: "other" },
  Telugu: { promptName: "Telugu / తెలుగు", htmlLang: "te", direction: "ltr", scriptFamily: "other" },
  Kannada: { promptName: "Kannada / ಕನ್ನಡ", htmlLang: "kn", direction: "ltr", scriptFamily: "other" },
  Malayalam: { promptName: "Malayalam / മലയാളം", htmlLang: "ml", direction: "ltr", scriptFamily: "other" },
  Gujarati: { promptName: "Gujarati / ગુજરાતી", htmlLang: "gu", direction: "ltr", scriptFamily: "other" },
  Punjabi: { promptName: "Punjabi / ਪੰਜਾਬੀ", htmlLang: "pa", direction: "ltr", scriptFamily: "other" },
  Burmese: { promptName: "Burmese / မြန်မာ", htmlLang: "my", direction: "ltr", scriptFamily: "other" },
  Khmer: { promptName: "Khmer / ខ្មែរ", htmlLang: "km", direction: "ltr", scriptFamily: "other" },
  Lao: { promptName: "Lao / ລາວ", htmlLang: "lo", direction: "ltr", scriptFamily: "other" },
  Georgian: { promptName: "Georgian / ქართული", htmlLang: "ka", direction: "ltr", scriptFamily: "other" },
  Armenian: { promptName: "Armenian / Հայերեն", htmlLang: "hy", direction: "ltr", scriptFamily: "other" },
  Amharic: { promptName: "Amharic / አማርኛ", htmlLang: "am", direction: "ltr", scriptFamily: "other" },
  Tibetan: { promptName: "Tibetan / བོད་སྐད་", htmlLang: "bo", direction: "ltr", scriptFamily: "other" },
  Sinhala: { promptName: "Sinhala / සිංහල", htmlLang: "si", direction: "ltr", scriptFamily: "other" },
  Russian: { promptName: "Russian / Русский", htmlLang: "ru", direction: "ltr", scriptFamily: "latin" },
  Greek: { promptName: "Greek / Ελληνικά", htmlLang: "el", direction: "ltr", scriptFamily: "latin" },
  Turkish: { promptName: "Turkish / Türkçe", htmlLang: "tr", direction: "ltr", scriptFamily: "latin" },
  Polish: { promptName: "Polish / Polski", htmlLang: "pl", direction: "ltr", scriptFamily: "latin" },
  Czech: { promptName: "Czech / Čeština", htmlLang: "cs", direction: "ltr", scriptFamily: "latin" },
  Romanian: { promptName: "Romanian / Română", htmlLang: "ro", direction: "ltr", scriptFamily: "latin" },
  Hungarian: { promptName: "Hungarian / Magyar", htmlLang: "hu", direction: "ltr", scriptFamily: "latin" },
  German: { promptName: "German / Deutsch", htmlLang: "de", direction: "ltr", scriptFamily: "latin" },
  French: { promptName: "French / Français", htmlLang: "fr", direction: "ltr", scriptFamily: "latin" },
  Portuguese: { promptName: "Portuguese / Português", htmlLang: "pt", direction: "ltr", scriptFamily: "latin" },
  Spanish: { promptName: "Spanish / Español", htmlLang: "es", direction: "ltr", scriptFamily: "latin" },
  Italian: { promptName: "Italian / Italiano", htmlLang: "it", direction: "ltr", scriptFamily: "latin" },
  Dutch: { promptName: "Dutch / Nederlands", htmlLang: "nl", direction: "ltr", scriptFamily: "latin" },
  Swedish: { promptName: "Swedish / Svenska", htmlLang: "sv", direction: "ltr", scriptFamily: "latin" },
  Norwegian: { promptName: "Norwegian / Norsk", htmlLang: "no", direction: "ltr", scriptFamily: "latin" },
  Danish: { promptName: "Danish / Dansk", htmlLang: "da", direction: "ltr", scriptFamily: "latin" },
  Finnish: { promptName: "Finnish / Suomi", htmlLang: "fi", direction: "ltr", scriptFamily: "latin" },
  Indonesian: { promptName: "Indonesian / Bahasa Indonesia", htmlLang: "id", direction: "ltr", scriptFamily: "latin" },
  Swahili: { promptName: "Swahili / Kiswahili", htmlLang: "sw", direction: "ltr", scriptFamily: "latin" },
}

const DEFAULT_METADATA: LanguageMetadata = {
  promptName: "English",
  direction: "ltr",
  scriptFamily: "latin",
}

export function getLanguageMetadata(language: string): LanguageMetadata {
  return LANGUAGE_METADATA[language] ?? {
    ...DEFAULT_METADATA,
    promptName: language || DEFAULT_METADATA.promptName,
  }
}

export function getLanguagePromptName(language: string): string {
  return getLanguageMetadata(language).promptName
}

export function getTextDirection(language: string): TextDirection {
  return getLanguageMetadata(language).direction
}

export function getHtmlLang(language: string): string | undefined {
  return getLanguageMetadata(language).htmlLang
}

export function sameScriptFamily(a: string, b: string): boolean {
  return getLanguageMetadata(a).scriptFamily === getLanguageMetadata(b).scriptFamily
}
