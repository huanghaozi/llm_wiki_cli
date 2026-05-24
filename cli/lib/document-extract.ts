import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"
import mammoth from "mammoth"

const SUPPORTED_EXTS = [".md", ".txt", ".pdf", ".docx", ".doc"]

export { SUPPORTED_EXTS }

export async function extractDocumentText(filePath: string): Promise<string | null> {
  const ext = extname(filePath).toLowerCase()

  if (ext === ".md" || ext === ".txt") {
    return readFileSync(filePath, "utf-8")
  }

  if (ext === ".docx" || ext === ".doc") {
    try {
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value.trim() || null
    } catch {
      return null
    }
  }

  if (ext === ".pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default
      const buffer = readFileSync(filePath)
      const data = await pdfParse(buffer)
      return data.text?.trim() || null
    } catch {
      return null
    }
  }

  return null
}

export function isSupportedSource(filePath: string): boolean {
  return SUPPORTED_EXTS.includes(extname(filePath).toLowerCase())
}

export function sourceBasename(filePath: string): string {
  return basename(filePath)
}
