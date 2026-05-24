import { input } from "@inquirer/prompts"
import { join, basename, extname, dirname } from "node:path"
import { existsSync, writeFileSync, readdirSync, statSync } from "node:fs"
import chalk from "chalk"
import ora from "ora"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"
import { ensureDir } from "../lib/fs-adapter.js"
import { SUPPORTED_EXTS, extractDocumentText, isSupportedSource } from "../lib/document-extract.js"
import { appendToIndex, appendToLog, addReviewItem } from "../lib/project-utils.js"
import { buildLanguageDirective } from "../lib/output-language.js"
import { embedPage } from "../lib/embedding.js"
import { extractImagesNative, isNativeAvailable } from "../lib/native-bridge.js"

interface IngestOptions {
  files?: string[]
  projectPath?: string
}

const WIKI_TYPE_DIRS = ["entities", "concepts", "sources", "queries", "overview"]

export async function ingestCommand(options: IngestOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()

  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  let files = options.files || []

  if (files.length === 0) {
    const sourcesDir = join(projectPath, "raw", "sources")
    if (existsSync(sourcesDir)) {
      files = listSourceFiles(sourcesDir)
      if (files.length === 0) {
        console.log(chalk.yellow("No files found in raw/sources/. Please specify files or add them to that directory."))
        return
      }
      console.log(chalk.dim(`Found ${files.length} file(s) in raw/sources/`))
    } else {
      const filePath = await input({ message: "File or directory to ingest:" })
      files = [filePath]
    }
  }

  const allFiles: string[] = []
  for (const f of files) {
    if (!existsSync(f)) {
      console.log(chalk.red(`File not found: ${f}`))
      continue
    }
    const stat = statSync(f)
    if (stat.isDirectory()) {
      allFiles.push(...listSourceFiles(f))
    } else {
      allFiles.push(f)
    }
  }

  const supportedFiles = allFiles.filter((f) => isSupportedSource(f))

  if (supportedFiles.length === 0) {
    console.log(chalk.yellow("No supported files found."))
    return
  }

  console.log(chalk.bold(`\nIngesting ${supportedFiles.length} file(s)...\n`))

  for (const filePath of supportedFiles) {
    await ingestFile(filePath, projectPath, config)
  }

  console.log(chalk.green("\nIngest complete!"))
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
    } else if (isSupportedSource(fullPath)) {
      files.push(fullPath)
    }
  }
  return files
}

function ensureWikiStructure(wikiDir: string) {
  ensureDir(wikiDir)
  for (const sub of WIKI_TYPE_DIRS) {
    ensureDir(join(wikiDir, sub))
  }
}

async function ingestFile(filePath: string, projectPath: string, config: ReturnType<typeof loadConfig>) {
  const spinner = ora(`Reading ${basename(filePath)}...`).start()

  try {
    const ext = extname(filePath).toLowerCase()
    if (isNativeAvailable() && [".pdf", ".docx", ".pptx"].includes(ext)) {
      const outDir = join(projectPath, "raw", "extracted", basename(filePath, ext))
      ensureDir(outDir)
      try {
        const images = extractImagesNative(filePath, outDir)
        if (images?.length) {
          spinner.text = `Extracted ${images.length} embedded image(s) from ${basename(filePath)}`
        }
      } catch (err) {
        spinner.warn(`Image extraction skipped: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const content = await extractDocumentText(filePath)
    if (!content) {
      spinner.warn(`${basename(filePath)}: Could not extract text. Skipping.`)
      return
    }

    spinner.text = `Analyzing ${basename(filePath)}...`

    const analysisPrompt = `You are a knowledge base curator. Analyze this document and identify:
1. Main topics and concepts
2. Key facts and data points
3. How this relates to other knowledge areas

${buildLanguageDirective(config, content.slice(0, 500))}

Document content:
${content.slice(0, config.maxContextSize || 128000)}

Respond with a brief analysis (2-3 paragraphs).`

    let analysis = ""
    await streamChat(
      config,
      [
        { role: "system", content: "You are a precise document analyzer." },
        { role: "user", content: analysisPrompt },
      ],
      {
        onToken: (token) => { analysis += token },
        onDone: () => {},
        onError: (err) => { throw err },
      },
    )

    spinner.text = `Generating wiki pages for ${basename(filePath)}...`

    const generationPrompt = `Based on the following document analysis, generate structured wiki pages in Markdown format.

${buildLanguageDirective(config, analysis)}

Analysis:
${analysis}

Original document:
${content.slice(0, Math.floor((config.maxContextSize || 128000) * 0.5))}

Generate wiki pages using this format for EACH page. Paths MUST start with wiki/ and use subdirectories:
- wiki/entities/ for named entities
- wiki/concepts/ for abstract concepts
- wiki/sources/ for source summaries

---FILE: wiki/entities/example-entity.md---
---
type: entity
title: Example Entity
sources:
  - ${basename(filePath)}
tags: [relevant, tags]
---

# Example Entity

Content here with [[wiki links]] to related concepts.

---END FILE---

Generate 1-5 pages depending on document complexity. Use [[wikilinks]] for cross-references.`

    let generated = ""
    await streamChat(
      config,
      [
        { role: "system", content: "You are a wiki page generator. Output pages in the exact format specified." },
        { role: "user", content: generationPrompt },
      ],
      {
        onToken: (token) => { generated += token },
        onDone: () => {},
        onError: (err) => { throw err },
      },
    )

    const pages = parseGeneratedPages(generated)
    const wikiDir = join(projectPath, "wiki")
    ensureWikiStructure(wikiDir)

    for (const page of pages) {
      const relPath = page.filename.startsWith("wiki/") ? page.filename.slice(5) : page.filename
      const pagePath = join(wikiDir, relPath)
      ensureDir(dirname(pagePath))
      writeFileSync(pagePath, page.content)
      appendToIndex(projectPath, relPath, extractTitle(page.content))

      const embCfg = config.embedding
      if (embCfg?.enabled) {
        const pageId = basename(pagePath, ".md")
        const title = extractTitle(page.content) || pageId
        await embedPage(projectPath, pageId, title, page.content, embCfg)
      }
    }

    appendToLog(projectPath, `Ingested ${basename(filePath)} → ${pages.length} page(s)`)

    if (pages.length === 0) {
      addReviewItem(projectPath, {
        type: "confirm",
        title: `Ingest produced no pages: ${basename(filePath)}`,
        description: "The LLM did not generate any wiki pages. You may need to re-ingest or edit manually.",
        sourcePath: filePath,
        options: [{ label: "Re-ingest", action: "re-ingest" }],
      })
    }

    spinner.succeed(`${basename(filePath)}: ${pages.length} page(s) generated`)
  } catch (error) {
    spinner.fail(`${basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function extractTitle(content: string): string {
  const m = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (m) return m[1].trim()
  const h1 = content.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : ""
}

function parseGeneratedPages(text: string): Array<{ filename: string; content: string }> {
  const pages: Array<{ filename: string; content: string }> = []
  const regex = /---FILE:\s*([^\n]+?)\s*---\n([\s\S]*?)---END FILE---/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const filename = match[1].trim()
    const content = match[2].trim()
    if (filename && content && filename.startsWith("wiki/") && !filename.includes("..")) {
      pages.push({ filename, content })
    }
  }
  return pages
}
