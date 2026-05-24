import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join, basename, extname } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { loadConfig } from "../lib/config-store.js"
import { captionImage, mimeFromPath } from "../lib/vision-caption.js"
import { ensureDir } from "../lib/fs-adapter.js"
import { extractImagesNative, isNativeAvailable } from "../lib/native-bridge.js"

interface CaptionOptions {
  files?: string[]
  projectPath?: string
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])

export async function captionCommand(options: CaptionOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()

  if (!config.multimodal?.enabled) {
    console.log(chalk.yellow("Vision captioning disabled. Run 'llm-wiki config --multimodal'."))
    return
  }

  let files = options.files ?? []
  if (files.length === 0) {
    const sourcesDir = join(projectPath, "raw", "sources")
    files = listImages(sourcesDir)
    if (isNativeAvailable()) {
      for (const doc of listDocuments(sourcesDir)) {
        const outDir = join(projectPath, "raw", "extracted", basename(doc, extname(doc)))
        ensureDir(outDir)
        try {
          const extracted = extractImagesNative(doc, outDir) ?? []
          for (const img of extracted) files.push(img.filePath)
        } catch {
          // skip failed extraction
        }
      }
    }
  }

  if (files.length === 0) {
    console.log(chalk.yellow("No image files found."))
    return
  }

  const mediaDir = join(projectPath, "wiki", "media")
  ensureDir(mediaDir)
  const cachePath = join(projectPath, ".llm-wiki", "image-caption-cache.json")
  let cache: Record<string, { caption: string }> = {}
  if (existsSync(cachePath)) {
    try { cache = JSON.parse(readFileSync(cachePath, "utf-8")) } catch { /* fresh */ }
  }

  console.log(chalk.bold(`\nCaptioning ${files.length} image(s)...\n`))

  for (const file of files) {
    const spinner = ora(`Captioning ${basename(file)}...`).start()
    try {
      const bytes = readFileSync(file)
      const hash = await sha256(bytes)
      if (cache[hash]?.caption) {
        spinner.succeed(`${basename(file)}: cached`)
        continue
      }

      const b64 = bytes.toString("base64")
      const caption = await captionImage(b64, mimeFromPath(file), config)
      cache[hash] = { caption }

      const slug = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9-]/g, "-")
      const mdPath = join(mediaDir, `${slug}.md`)
      writeFileSync(mdPath, [
        "---",
        "type: media",
        `title: ${JSON.stringify(basename(file))}`,
        `source: ${JSON.stringify(file)}`,
        "---",
        "",
        `# ${basename(file)}`,
        "",
        `![${caption}](${file.replace(/\\/g, "/")})`,
        "",
        caption,
        "",
      ].join("\n"))

      spinner.succeed(`${basename(file)} → wiki/media/${slug}.md`)
    } catch (err) {
      spinner.fail(`${basename(file)}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  mkdirSync(join(projectPath, ".llm-wiki"), { recursive: true })
  writeFileSync(cachePath, JSON.stringify(cache, null, 2))
  console.log(chalk.green("\nCaption complete!"))
}

const DOC_EXTS = new Set([".pdf", ".docx", ".pptx"])

function listDocuments(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listDocuments(full))
    else if (DOC_EXTS.has(extname(entry.name).toLowerCase())) files.push(full)
  }
  return files
}

function listImages(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listImages(full))
    else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) files.push(full)
  }
  return files
}

async function sha256(bytes: Buffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}
