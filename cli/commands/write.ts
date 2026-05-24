import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import chalk from "chalk"
import { input, confirm } from "@inquirer/prompts"
import { readTextFile, fileExists } from "../lib/fs-adapter.js"
import { listWikiMdFiles, buildSlugMap } from "../lib/wiki-files.js"
import { appendToLog } from "../lib/project-utils.js"

interface WriteOptions {
  page?: string
  content?: string
  projectPath?: string
  file?: string
}

export async function writeCommand(options: WriteOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found. Run 'llm-wiki init' first."))
    return
  }

  let content = options.content
  if (options.file) {
    if (!existsSync(options.file)) {
      console.log(chalk.red(`File not found: ${options.file}`))
      return
    }
    content = readFileSync(options.file, "utf-8")
  }

  let pagePath: string

  if (options.page) {
    pagePath = resolvePagePath(wikiDir, options.page)
    if (!pagePath) {
      console.log(chalk.red(`Page not found: ${options.page}`))
      const create = await confirm({ message: "Create new page?", default: true })
      if (!create) return
      pagePath = join(wikiDir, options.page.endsWith(".md") ? options.page : `${options.page}.md`)
    }
  } else {
    const page = await input({ message: "Page path (relative to wiki/, e.g. entities/foo.md):" })
    pagePath = join(wikiDir, page.endsWith(".md") ? page : `${page}.md`)
  }

  if (!content) {
    if (existsSync(pagePath)) {
      content = readFileSync(pagePath, "utf-8")
      console.log(chalk.dim("Editing existing page. Enter new content (end with a line containing only '.'):"))
    } else {
      const title = basename(pagePath, ".md")
      content = [
        "---",
        "type: entity",
        `title: ${title}`,
        `created: ${new Date().toISOString().slice(0, 10)}`,
        "tags: []",
        "---",
        "",
        `# ${title}`,
        "",
      ].join("\n")
      console.log(chalk.dim("Creating new page. Enter content (end with a line containing only '.'):"))
    }

    const lines: string[] = []
    while (true) {
      const line = await input({ message: "" })
      if (line === ".") break
      lines.push(line)
    }
    if (lines.length > 0) content = lines.join("\n")
  }

  ensureDir(dirname(pagePath))
  writeFileSync(pagePath, content!)
  const relPath = pagePath.slice(wikiDir.length + 1).replace(/\\/g, "/")
  appendToLog(projectPath, `Updated page: ${relPath}`)
  console.log(chalk.green(`Written: wiki/${relPath}`))
}

function resolvePagePath(wikiDir: string, query: string): string | null {
  const files = listWikiMdFiles(wikiDir)
  const slugMap = buildSlugMap(files)
  const q = query.toLowerCase()

  const direct = join(wikiDir, query.endsWith(".md") ? query : `${query}.md`)
  if (existsSync(direct)) return direct

  const bySlug = slugMap.get(q) ?? slugMap.get(basename(query).replace(/\.md$/, "").toLowerCase())
  if (bySlug) return bySlug

  for (const f of files) {
    if (f.relPath.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)) {
      return f.path
    }
  }
  return null
}

function ensureDir(dir: string) {
  if (!fileExists(dir)) mkdirSync(dir, { recursive: true })
}
