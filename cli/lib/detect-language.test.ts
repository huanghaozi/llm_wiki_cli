import { describe, it, expect } from "vitest"
import { detectLanguage } from "./detect-language.js"

describe("detectLanguage", () => {
  it("detects Chinese", () => {
    expect(detectLanguage("默会知识与显性知识的区别")).toBe("Chinese")
  })

  it("detects Japanese when both Kanji and Kana appear", () => {
    expect(detectLanguage("これは日本語のテキストです")).toBe("Japanese")
  })

  it("detects Korean", () => {
    expect(detectLanguage("안녕하세요 세계")).toBe("Korean")
  })

  it("detects Arabic vs Persian by script signal", () => {
    expect(detectLanguage("هذا نص عربي بسيط في اللغة العربية")).toBe("Arabic")
    expect(detectLanguage("این یک متن فارسی است که برای نمایش")).toBe("Persian")
  })

  it("detects Russian via Cyrillic", () => {
    expect(detectLanguage("Это пример русского текста")).toBe("Russian")
  })

  it("detects Vietnamese via tone marks", () => {
    expect(detectLanguage("Tiếng Việt rất đẹp và phong phú")).toBe("Vietnamese")
  })

  it("detects Polish", () => {
    expect(detectLanguage("Język polski używa specjalnych znaków: ąćęłńóśźż")).toBe("Polish")
  })

  it("detects German with common words", () => {
    expect(detectLanguage("Das ist ein Beispiel und der Text ist auf Deutsch")).toBe("German")
  })

  it("falls back to English when no signal", () => {
    expect(detectLanguage("Hello world this is a simple sentence")).toBe("English")
  })

  it("handles Thai", () => {
    expect(detectLanguage("นี่คือข้อความภาษาไทย")).toBe("Thai")
  })

  it("handles Hindi (Devanagari)", () => {
    expect(detectLanguage("यह हिंदी में लिखा गया है")).toBe("Hindi")
  })

  it("handles Hebrew, Bengali, Tamil, Telugu, Kannada", () => {
    expect(detectLanguage("שלום עולם זוהי דוגמה")).toBe("Hebrew")
    expect(detectLanguage("এটি একটি বাংলা পাঠ্য উদাহরণ")).toBe("Bengali")
    expect(detectLanguage("இது தமிழ் உரை எடுத்துக்காட்டு")).toBe("Tamil")
    expect(detectLanguage("ఇది తెలుగు వచనం")).toBe("Telugu")
    expect(detectLanguage("ಇದು ಕನ್ನಡ ಪಠ್ಯ ಉದಾಹರಣೆ")).toBe("Kannada")
  })

  it("handles minor South-Asian / SE-Asian scripts", () => {
    expect(detectLanguage("ഇത് മലയാളം പാഠം")).toBe("Malayalam")
    expect(detectLanguage("આ ગુજરાતી ઉદાહરણ છે")).toBe("Gujarati")
    expect(detectLanguage("ਇਹ ਪੰਜਾਬੀ ਟੈਕਸਟ ਹੈ")).toBe("Punjabi")
    expect(detectLanguage("ဤသည် မြန်မာစာ ဥပမာ")).toBe("Burmese")
    expect(detectLanguage("នេះគឺជាអត្ថបទខ្មែរ")).toBe("Khmer")
    expect(detectLanguage("ນີ້ແມ່ນຂໍ້ຄວາມລາວ")).toBe("Lao")
  })

  it("handles Georgian / Armenian / Amharic / Tibetan / Sinhala", () => {
    expect(detectLanguage("ეს არის ქართული ტექსტი")).toBe("Georgian")
    expect(detectLanguage("Սա հայերեն օրինակ տեքստ է")).toBe("Armenian")
    expect(detectLanguage("ይህ የአማርኛ ጽሑፍ ምሳሌ ነው")).toBe("Amharic")
    expect(detectLanguage("འདི་ནི་བོད་སྐད་ཀྱི་དཔེ་ཡིན")).toBe("Tibetan")
    expect(detectLanguage("මෙය සිංහල පෙළක උදාහරණයයි")).toBe("Sinhala")
  })

  it("handles Greek (Latin-script outlier)", () => {
    expect(detectLanguage("Αυτό είναι ένα παράδειγμα κειμένου στα Ελληνικά")).toBe("Greek")
  })

  it("handles Turkish, Czech, Romanian, Hungarian", () => {
    expect(detectLanguage("Bu bir Türkçe metin örneği ve şu söz değil ama"))
      .toBe("Turkish")
    expect(detectLanguage("Toto je příklad textu v češtině, hřejivý."))
      .toBe("Czech")
    expect(detectLanguage("Acesta este un exemplu de text în limba română și care este"))
      .toBe("Romanian")
    expect(detectLanguage("Ez egy magyar nyelvű szöveg példája és gyökerű"))
      .toBe("Hungarian")
  })

  it("handles French, Spanish, Italian, Dutch, Portuguese", () => {
    expect(detectLanguage("Le livre est une œuvre fascinante et la lecture est essentielle"))
      .toBe("French")
    expect(detectLanguage("El libro es una obra fascinante por los lectores del mundo"))
      .toBe("Spanish")
    expect(detectLanguage("Il libro è un'opera affascinante e gli lettori della della"))
      .toBe("Italian")
    expect(detectLanguage("Dit is een Nederlandse zin van een tekst dat het beste"))
      .toBe("Dutch")
    // Plain Portuguese sentence without French-style é (only ã/õ tildes).
    expect(detectLanguage("Não há ações um livro do mundo da literatura na obra"))
      .toBe("Portuguese")
  })

  it("handles Nordic languages and Finnish", () => {
    expect(detectLanguage("Detta är ett exempel och att text på svenska för att"))
      .toBe("Swedish")
  })

  it("handles Indonesian and Swahili", () => {
    expect(detectLanguage("Ini adalah contoh teks yang ditulis dari untuk dengan adalah"))
      .toBe("Indonesian")
    expect(detectLanguage("Hii ni mfano wa maandishi ya kwa na katika hiyo"))
      .toBe("Swahili")
  })

  it("returns English when input is empty / very short", () => {
    expect(detectLanguage("")).toBe("English")
    expect(detectLanguage("a")).toBe("English")
  })
})
