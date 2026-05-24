/**
 * Detect the primary language of a text string based on Unicode script
 * ranges and a small set of language-specific heuristics for Latin
 * scripts. Returns an English language name (e.g. `"Chinese"`,
 * `"Vietnamese"`).
 *
 * Used by the output-language directive so non-CJK, non-English users
 * still get LLM output in their detected language.
 */
export function detectLanguage(text: string): string {
  const counts: Record<string, number> = {}

  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (!cp || cp < 0x80) continue
    const script = getScript(cp)
    if (script) {
      counts[script] = (counts[script] ?? 0) + 1
    }
  }

  // Special case: Japanese uses BOTH Hiragana/Katakana and Kanji. Pure
  // Chinese uses ONLY Kanji.
  if ((counts.Japanese ?? 0) > 0 && (counts.Chinese ?? 0) > 0) {
    return "Japanese"
  }

  let maxScript = ""
  let maxCount = 0
  for (const [script, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxScript = script
      maxCount = count
    }
  }

  if (maxScript === "Arabic" && maxCount >= 2) {
    return detectArabicScriptLanguage(text)
  }

  if (maxScript && maxCount >= 2) {
    return maxScript
  }

  const latinLang = detectLatinLanguage(text)
  if (latinLang) return latinLang

  return "English"
}

function detectArabicScriptLanguage(text: string): "Arabic" | "Persian" {
  let persianScore = 0
  let arabicScore = 0

  for (const ch of text) {
    switch (ch) {
      case "پ":
      case "چ":
      case "ژ":
      case "گ":
        persianScore += 3
        break
      case "ک":
      case "ی":
        persianScore += 1
        break
      case "ك":
      case "ي":
      case "ة":
      case "ى":
      case "إ":
      case "أ":
      case "ؤ":
      case "ئ":
        arabicScore += 1
        break
    }
  }

  const normalized = ` ${text.replace(/[^\p{L}\p{N}]+/gu, " ")} `
  const persianWords = ["این", "است", "که", "برای", "های", "را", "در", "به", "از", "می", "یک"]
  const arabicWords = ["ال", "في", "من", "على", "هذا", "هذه", "إلى", "التي", "الذي", "كان"]

  for (const word of persianWords) if (normalized.includes(` ${word} `)) persianScore += 2
  for (const word of arabicWords) if (normalized.includes(` ${word} `)) arabicScore += 2

  return persianScore >= 3 && persianScore > arabicScore ? "Persian" : "Arabic"
}

function getScript(cp: number): string | null {
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x20000 && cp <= 0x2a6df) || (cp >= 0xf900 && cp <= 0xfaff)) {
    return "Chinese"
  }
  if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff) ||
      (cp >= 0x31f0 && cp <= 0x31ff) || (cp >= 0xff65 && cp <= 0xff9f)) {
    return "Japanese"
  }
  if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x3130 && cp <= 0x318f)) {
    return "Korean"
  }
  if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f) ||
      (cp >= 0x08a0 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)) {
    return "Arabic"
  }
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) return "Hebrew"
  if (cp >= 0x0e00 && cp <= 0x0e7f) return "Thai"
  if (cp >= 0x0900 && cp <= 0x097f) return "Hindi"
  if (cp >= 0x0980 && cp <= 0x09ff) return "Bengali"
  if (cp >= 0x0b80 && cp <= 0x0bff) return "Tamil"
  if (cp >= 0x0c00 && cp <= 0x0c7f) return "Telugu"
  if (cp >= 0x0c80 && cp <= 0x0cff) return "Kannada"
  if (cp >= 0x0d00 && cp <= 0x0d7f) return "Malayalam"
  if (cp >= 0x0a80 && cp <= 0x0aff) return "Gujarati"
  if (cp >= 0x0a00 && cp <= 0x0a7f) return "Punjabi"
  if (cp >= 0x1000 && cp <= 0x109f) return "Burmese"
  if (cp >= 0x1780 && cp <= 0x17ff) return "Khmer"
  if (cp >= 0x0e80 && cp <= 0x0eff) return "Lao"
  if ((cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x2d00 && cp <= 0x2d2f)) return "Georgian"
  if (cp >= 0x0530 && cp <= 0x058f) return "Armenian"
  if (cp >= 0x1200 && cp <= 0x137f) return "Amharic"
  if (cp >= 0x0f00 && cp <= 0x0fff) return "Tibetan"
  if (cp >= 0x0d80 && cp <= 0x0dff) return "Sinhala"
  if ((cp >= 0x0400 && cp <= 0x04ff) || (cp >= 0x0500 && cp <= 0x052f)) return "Russian"
  if ((cp >= 0x0370 && cp <= 0x03ff) || (cp >= 0x1f00 && cp <= 0x1fff)) return "Greek"

  return null
}

function detectLatinLanguage(text: string): string | null {
  const lower = text.toLowerCase()

  if (/[ảạắằẳẵặấầẩẫậđẻẽẹếềểễệỉĩịỏọốồổỗộơớờởỡợủũụưứừửữựỷỹỵ]/.test(lower)) return "Vietnamese"
  if (/[ğış]/.test(lower) && /\b(bir|ve|için|ile|bu|da|de|değil|ama)\b/.test(lower)) return "Turkish"
  if (/[ąćęłńóśźż]/.test(lower)) return "Polish"
  if (/[ěšžřďťňů]/.test(lower)) return "Czech"
  if (/[ăâîșț]/.test(lower) && /\b(și|este|sau|care|pentru)\b/.test(lower)) return "Romanian"
  if (/[őű]/.test(lower)) return "Hungarian"
  if (/[äöüß]/.test(lower) || /\b(und|der|die|das|ist|nicht|ein|eine)\b/.test(lower)) {
    if (/\b(und|der|die|das|ist)\b/.test(lower)) return "German"
  }
  if (/[àâçéèêëïîôùûüÿœæ]/.test(lower) || /\b(le|la|les|de|des|est|et|un|une|du|au)\b/.test(lower)) {
    if (/\b(le|la|les|est|une|des)\b/.test(lower)) return "French"
  }
  if (/[ãõç]/.test(lower) && /\b(o|a|os|as|de|do|da|é|em|um|uma|não|que)\b/.test(lower)) return "Portuguese"
  if (/[áéíóúñ¿¡]/.test(lower) || /\b(el|la|los|las|de|del|es|en|por|que|un|una)\b/.test(lower)) {
    if (/\b(el|los|las|del|por)\b/.test(lower) || /[ñ¿¡]/.test(lower)) return "Spanish"
  }
  if (/\b(il|lo|la|gli|le|di|del|della|è|e|un|una|che|non|per)\b/.test(lower)) {
    if (/\b(il|della|gli|che|è)\b/.test(lower)) return "Italian"
  }
  if (/\b(het|de|een|van|en|in|is|dat|op|te|met)\b/.test(lower)) {
    if (/\b(het|een|van|dat)\b/.test(lower)) return "Dutch"
  }
  if (/[åäö]/.test(lower) && /\b(och|att|det|en|ett|är|för|med)\b/.test(lower)) return "Swedish"
  if (/[åæø]/.test(lower) && /\b(og|er|det|en|et|for|med|på)\b/.test(lower)) return "Norwegian"
  if (/[åæø]/.test(lower) && /\b(og|er|det|en|et|til|med|af)\b/.test(lower)) return "Danish"
  if (/[äö]/.test(lower) && /\b(ja|on|ei|se|että|tai|kun|niin)\b/.test(lower)) return "Finnish"
  if (/\b(dan|yang|di|dari|untuk|dengan|ini|itu|adalah|tidak|ada)\b/.test(lower)) {
    if (/\b(yang|dari|untuk|dengan|adalah)\b/.test(lower)) return "Indonesian"
  }
  if (/\b(na|ya|wa|ni|kwa|katika|hii|hiyo)\b/.test(lower)) return "Swahili"

  return null
}
