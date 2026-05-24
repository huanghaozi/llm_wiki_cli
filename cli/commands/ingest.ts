import { input } from "@inquirer/prompts"
import { join, basename, extname, dirname } from "node:path"
import { existsSync, writeFileSync, readFileSync, readdirSync, statSync, appendFileSync, mkdirSync } from "node:fs"
import chalk from "chalk"
import ora from "ora"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"
import { ensureDir } from "../lib/fs-adapter.js"
import { extractDocumentText, isSupportedSource } from "../lib/document-extract.js"
import { addReviewItem, appendToLog } from "../lib/project-utils.js"
import { buildLanguageDirective } from "../lib/output-language.js"
import { embedPage } from "../lib/embedding.js"
import { extractImagesNative, isNativeAvailable } from "../lib/native-bridge.js"
import { sanitizeIngestedFileContent } from "../lib/ingest-sanitize.js"
import { parseFileBlocks, parseReviewBlocks, isLogPath, isIndexPath } from "../lib/ingest-parse.js"
import { writeFrontmatterArray, parseFrontmatterArray } from "../lib/sources-merge.js"
import { checkIngestCache, saveIngestCache } from "../lib/ingest-cache.js"
import { sourceIdentityForPath, sourceSummarySlugFromIdentity } from "../lib/source-identity.js"
import { withProjectLock } from "../lib/project-mutex.js"
import { extractFrontmatterTitle } from "../lib/frontmatter.js"
import { mergePageContent, type MergeFn } from "../lib/page-merge.js"
import type { CliConfig } from "../types/cli.js"

interface IngestOptions {
  files?: string[]
  projectPath?: string
  force?: boolean
}

const WIKI_TYPE_DIRS = ["entities", "concepts", "sources", "queries"]
const MAX_SOURCE_CHARS = 50_000

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
    await withProjectLock(projectPath, () => ingestFile(filePath, projectPath, config, options.force ?? false))
  }

  console.log(chalk.green("\nIngest complete!"))
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
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

function tryReadFile(p: string): string {
  try {
    return readFileSync(p, "utf-8")
  } catch {
    return ""
  }
}

function backupExistingPage(projectPath: string, relPath: string, content: string): void {
  try {
    const historyDir = join(projectPath, ".llm-wiki", "page-history")
    mkdirSync(historyDir, { recursive: true })
    const safeName = relPath.replace(/[\\/]/g, "_")
    const ts = Date.now()
    writeFileSync(join(historyDir, `${safeName}-${ts}.md`), content)
  } catch {
    // best-effort
  }
}

function buildAnalysisPrompt(
  config: ReturnType<typeof loadConfig>,
  purpose: string,
  index: string,
  sourceContent: string,
): string {
  return [
    "You are an expert research analyst. Read the source document and produce a structured analysis.",
    "Do NOT output chain-of-thought, hidden reasoning, or a thinking transcript. Reason internally and write only the concise final analysis.",
    "",
    buildLanguageDirective(config, sourceContent.slice(0, 500)),
    "",
    "Your analysis should cover:",
    "",
    "## Key Entities",
    "Named entities (people, organizations, products, datasets, tools). For each:",
    "- Name and type",
    "- Role in the source",
    "- Whether it likely already exists in the wiki (check the index)",
    "",
    "## Key Concepts",
    "Theories, methods, techniques, phenomena. For each:",
    "- Name and brief definition",
    "- Why it matters in this source",
    "",
    "## Main Arguments & Findings",
    "- Core claims and supporting evidence",
    "",
    "## Connections to Existing Wiki",
    "- What existing pages does this source relate to?",
    "",
    "## Contradictions & Tensions",
    "- Does anything in this source conflict with existing wiki content?",
    "",
    "## Recommendations",
    "- What wiki pages should be created or updated?",
    "",
    purpose ? `## Wiki Purpose (for context)\n${purpose}` : "",
    index ? `## Current Wiki Index (for cross-referencing)\n${index}` : "",
    "",
    "## Source Document",
    sourceContent,
  ].filter(Boolean).join("\n")
}

function buildGenerationPrompt(
  config: ReturnType<typeof loadConfig>,
  schema: string,
  purpose: string,
  index: string,
  overview: string,
  sourceFileName: string,
  sourceContent: string,
  sourceSummaryPath: string,
  analysis: string,
): string {
  return [
    "You are a wiki maintainer. Based on the analysis provided, generate wiki files.",
    "Do NOT output chain-of-thought, hidden reasoning, or explanatory preamble. Output ONLY FILE/REVIEW blocks.",
    "",
    buildLanguageDirective(config, sourceContent.slice(0, 500)),
    "",
    `## Source File`,
    `The original source file is: **${sourceFileName}**`,
    `All wiki pages generated from this source MUST include this filename in their frontmatter \`sources\` field.`,
    "",
    "## What to generate",
    "",
    `1. A source summary page at **${sourceSummaryPath}** (MUST use this exact path)`,
    "2. Entity pages in wiki/entities/ for key entities",
    "3. Concept pages in wiki/concepts/ for key concepts",
    "4. An updated wiki/index.md — add new entries to existing categories, PRESERVE ALL existing entries",
    "5. An updated wiki/overview.md — comprehensive 2-5 paragraph high-level summary of ALL topics in the wiki",
    "6. A log entry appended to wiki/log.md (format: `## [YYYY-MM-DD] ingest | <title>` followed by a one-line summary)",
    "",
    "## Block Format",
    "",
    "Emit each file as:",
    "",
    "    ---FILE: wiki/<path>.md---",
    "    <content>",
    "    ---END FILE---",
    "",
    "## Frontmatter Rules (parser is strict)",
    "1. The VERY FIRST line of the file MUST be exactly `---`.",
    "2. Do NOT wrap the file in a ```yaml fence.",
    "3. Do NOT prefix it with a `frontmatter:` key.",
    "4. Arrays use the standard YAML inline form `[a, b, c]`.",
    "   Wikilinks belong in the BODY only — never write `related: [[a]], [[b]]` (invalid YAML);",
    "   write `related: [a, b]` with bare slugs.",
    "5. Required fields: `type`, `title`, `sources`, `tags`, `related`.",
    "",
    "## Review Blocks (optional)",
    "Flag contradictions, duplicates, missing pages, or research-worthy questions with:",
    "",
    "    ---REVIEW: contradiction|duplicate|missing-page|suggestion | <title>---",
    "    <description>",
    "    OPTIONS: Approve|Skip|Edit",
    "    PAGES: <comma-separated affected page paths>",
    "    SEARCH: <pipe-separated optimized search queries — only for missing-page>",
    "    ---END REVIEW---",
    "",
    schema ? `## Wiki Schema\n${schema}` : "",
    purpose ? `## Wiki Purpose\n${purpose}` : "",
    index ? `## Current Wiki Index (preserve all existing entries when emitting the updated index.md)\n${index}` : "",
    overview ? `## Current Overview (update, don't replace)\n${overview}` : "",
    "",
    "## Analysis (use this as your reasoning input)",
    analysis,
    "",
    "## Original Source Document",
    sourceContent,
  ].filter(Boolean).join("\n")
}

async function ingestFile(
  filePath: string,
  projectPath: string,
  config: ReturnType<typeof loadConfig>,
  force: boolean,
) {
  const spinner = ora(`Reading ${basename(filePath)}...`).start()
  const fileName = basename(filePath)
  const identity = sourceIdentityForPath(projectPath, filePath)
  const sourceSummarySlug = sourceSummarySlugFromIdentity(identity)
  const sourceSummaryPath = `wiki/sources/${sourceSummarySlug}.md`

  try {
    // Optional native image extraction for binary formats. Best-effort.
    const ext = extname(filePath).toLowerCase()
    if (isNativeAvailable() && [".pdf", ".docx", ".pptx"].includes(ext)) {
      const outDir = join(projectPath, "raw", "extracted", basename(filePath, ext))
      ensureDir(outDir)
      try {
        const images = extractImagesNative(filePath, outDir)
        if (images?.length) {
          spinner.text = `Extracted ${images.length} embedded image(s) from ${fileName}`
        }
      } catch (err) {
        spinner.warn(`Image extraction skipped: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const rawContent = await extractDocumentText(filePath)
    if (!rawContent) {
      spinner.warn(`${fileName}: Could not extract text. Skipping.`)
      return
    }

    const sourceContent = rawContent.length > MAX_SOURCE_CHARS
      ? rawContent.slice(0, MAX_SOURCE_CHARS) + "\n\n[...truncated...]"
      : rawContent

    // Cache check — skip re-ingest when source content unchanged AND
    // every previously-written file still exists.
    if (!force) {
      const cached = checkIngestCache(projectPath, identity, sourceContent)
      if (cached !== null) {
        spinner.succeed(`${fileName}: cached (${cached.length} previously-written file(s)).`)
        return
      }
    }

    // Read project context.
    const schema = tryReadFile(join(projectPath, "schema.md"))
    const purpose = tryReadFile(join(projectPath, "purpose.md"))
    const index = tryReadFile(join(projectPath, "wiki", "index.md"))
    const overview = tryReadFile(join(projectPath, "wiki", "overview.md"))

    spinner.text = `Analyzing ${fileName}...`
    const analysisPrompt = buildAnalysisPrompt(config, purpose, index, sourceContent)

    let analysis = ""
    let analysisErr: Error | null = null
    await streamChat(
      config,
      [
        { role: "system", content: "You are a precise document analyzer." },
        { role: "user", content: analysisPrompt },
      ],
      {
        onToken: (token) => { analysis += token },
        onDone: () => {},
        onError: (err) => { analysisErr = err },
      },
      undefined,
      { temperature: 0.1, max_tokens: 4096, reasoning: { mode: "off" } },
    )
    if (analysisErr) throw analysisErr
    if (!analysis.trim()) {
      spinner.warn(`${fileName}: empty analysis from LLM. Skipping.`)
      return
    }

    spinner.text = `Generating wiki pages for ${fileName}...`
    const generationPrompt = buildGenerationPrompt(
      config, schema, purpose, index, overview, fileName, sourceContent, sourceSummaryPath, analysis,
    )

    let generated = ""
    let genErr: Error | null = null
    await streamChat(
      config,
      [
        { role: "system", content: "You are a wiki page generator. Output pages in the exact format specified — FILE/REVIEW blocks only." },
        { role: "user", content: generationPrompt },
      ],
      {
        onToken: (token) => { generated += token },
        onDone: () => {},
        onError: (err) => { genErr = err },
      },
      undefined,
      { temperature: 0.1, max_tokens: 8192, reasoning: { mode: "off" } },
    )
    if (genErr) throw genErr

    const { blocks, warnings } = parseFileBlocks(generated)
    const reviewBlocks = parseReviewBlocks(generated)
    const wikiDir = join(projectPath, "wiki")
    ensureWikiStructure(wikiDir)

    const writtenPaths: string[] = []

    for (const block of blocks) {
      // The opener line guarantees the path starts with `wiki/`. We
      // strip that prefix to join under wikiDir; any other path was
      // already rejected by isSafeIngestPath.
      const relUnderWiki = block.path.replace(/^wiki\//, "")
      // Project-relative path (with wiki/ prefix) — used for cache
      // bookkeeping so `checkIngestCache` can validate file existence
      // by `join(projectPath, relUnderProject)`.
      const relUnderProject = `wiki/${relUnderWiki}`
      const pagePath = join(wikiDir, relUnderWiki)
      ensureDir(dirname(pagePath))

      let sanitized = sanitizeIngestedFileContent(block.content)
      sanitized = canonicalizeSourcesField(sanitized, identity)

      const isLog = isLogPath(block.path)
      const isIndex = isIndexPath(block.path)
      const exists = existsSync(pagePath)
      const isOverview = relUnderWiki === "overview.md"

      if (isLog && exists) {
        // Log files grow append-only.
        const newEntry = sanitized.trim()
        if (newEntry) {
          try {
            appendFileSync(pagePath, "\n" + newEntry + "\n")
          } catch (err) {
            console.warn(chalk.dim(`[ingest] failed to append log: ${err instanceof Error ? err.message : err}`))
          }
        }
        writtenPaths.push(relUnderProject)
        continue
      }

      let finalContent = sanitized
      if (exists && !isIndex && !isOverview) {
        // Existing content page: 3-layer merge (array fields ∪,
        // LLM body merge with sanity checks, locked scalar fields).
        // Falls back to "array-merged + incoming body" with a backup
        // on LLM failure. See cli/lib/page-merge.ts.
        try {
          const existingContent = readFileSync(pagePath, "utf-8")
          finalContent = await mergePageContent(
            sanitized,
            existingContent,
            buildPageMerger(config),
            {
              sourceFileName: fileName,
              pagePath: relUnderProject,
              backup: async (old) => backupExistingPage(projectPath, relUnderWiki, old),
            },
          )
        } catch {
          // existingContent read or merge errored; fall through with
          // sanitized (incoming) content and rely on the page-history
          // backup that ran inside mergePageContent's fallback path.
        }
      }

      try {
        writeFileSync(pagePath, finalContent)
        writtenPaths.push(relUnderProject)
      } catch (err) {
        console.warn(chalk.dim(`[ingest] failed to write ${pagePath}: ${err instanceof Error ? err.message : err}`))
      }
      // Use the finalContent for downstream embedding so the vector
      // store and the on-disk file agree.
      sanitized = finalContent

      // Embed only content pages (skip index/log/overview/purpose/schema)
      const pageId = basename(pagePath, ".md")
      const skipEmbed = ["index", "log", "overview", "purpose", "schema"].includes(pageId)
      const embCfg = config.embedding
      if (!skipEmbed && embCfg?.enabled) {
        const title = extractFrontmatterTitle(sanitized) || pageId
        try {
          await embedPage(projectPath, pageId, title, sanitized, embCfg)
        } catch {
          // embedding is best-effort
        }
      }
    }

    // Surface parser warnings as a single review item so the user knows
    // pages got dropped.
    if (warnings.length > 0) {
      addReviewItem(projectPath, {
        type: "confirm",
        title: `Ingest warnings for ${fileName}`,
        description: warnings.join("\n"),
        sourcePath: filePath,
        options: [
          { label: "Re-ingest", action: "re-ingest" },
          { label: "Dismiss", action: "dismiss" },
        ],
      })
    }

    // Push REVIEW blocks into the review queue.
    for (const rb of reviewBlocks) {
      addReviewItem(projectPath, {
        ...rb,
        sourcePath: filePath,
      })
    }

    appendToLog(projectPath, `Ingested ${fileName} → ${writtenPaths.length} page(s)`)

    if (blocks.length === 0) {
      addReviewItem(projectPath, {
        type: "confirm",
        title: `Ingest produced no pages: ${fileName}`,
        description: "The LLM did not generate any wiki pages. You may need to re-ingest or edit manually.",
        sourcePath: filePath,
        options: [{ label: "Re-ingest", action: "re-ingest" }],
      })
    } else {
      // Persist cache only after a healthy write.
      saveIngestCache(projectPath, identity, sourceContent, writtenPaths)
    }

    spinner.succeed(`${fileName}: ${writtenPaths.length} page(s) generated${warnings.length ? `, ${warnings.length} warning(s)` : ""}`)
  } catch (error) {
    spinner.fail(`${fileName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Ensure the page's frontmatter `sources:` field contains the current
 * source identity (in canonical, project-relative form). Idempotent.
 */
function canonicalizeSourcesField(content: string, identity: string): string {
  const sources = parseFrontmatterArray(content, "sources")
  const idLower = identity.toLowerCase()
  const hasIdentity = sources.some((s) => s.toLowerCase() === idLower)
  if (hasIdentity) return content
  return writeFrontmatterArray(content, "sources", [...sources, identity])
}

/**
 * Build a MergeFn that asks the configured LLM to produce a unified
 * body when an existing wiki page collides with a re-ingested one.
 * Used by page-merge to prevent data loss on multi-source ingest.
 */
function buildPageMerger(config: CliConfig): MergeFn {
  return async (existingContent, incomingContent, sourceFileName, signal) => {
    const systemPrompt = [
      "You are merging two versions of the same wiki page into one coherent document.",
      "Both versions describe the same entity / concept; one is already on disk,",
      "the other was just generated from a different source document.",
      "",
      "Output ONE merged version that:",
      "- Preserves every factual claim from both versions (do not drop content)",
      "- Eliminates redundancy when both versions state the same fact",
      "- Reorganizes sections so the structure is logical for the merged topic,",
      "  not just a concatenation of the two inputs",
      "- Uses consistent markdown structure (headings, tables, lists, callouts)",
      "- Keeps `[[wikilink]]` references intact",
      "",
      "Output requirements:",
      "- The FIRST character of your response MUST be `-` (the opening of `---`)",
      "- Output the COMPLETE file: YAML frontmatter + body",
      "- No preamble (no \"Here is the merged version:\"), no analysis prose",
      "- The caller will overwrite `sources`/`tags`/`related`/`updated` with",
      "  deterministic values — your job is the body and any other fields",
    ].join("\n")

    const userMessage = [
      "## Existing version on disk",
      "",
      existingContent,
      "",
      "---",
      "",
      `## Newly generated version (from ${sourceFileName})`,
      "",
      incomingContent,
      "",
      "---",
      "",
      "Now output the merged file. Start with `---` on the first line.",
    ].join("\n")

    let result = ""
    let streamError: Error | null = null
    await new Promise<void>((resolve) => {
      streamChat(
        config,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        {
          onToken: (token) => { result += token },
          onDone: () => resolve(),
          onError: (err) => {
            streamError = err
            resolve()
          },
        },
        signal,
        { temperature: 0.1 },
      ).catch((err) => {
        streamError = err instanceof Error ? err : new Error(String(err))
        resolve()
      })
    })
    if (streamError) throw streamError
    return result
  }
}
