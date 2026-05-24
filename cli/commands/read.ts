import { existsSync, readFileSync, readdirSync, Dirent } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"

interface ReadOptions {
  page: string
  projectPath?: string
  raw?: boolean
}

function findFile(dir: string, target: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(fullPath, target)
      if (found) return found
    } else if (entry.name.endsWith(".md")) {
      const nameNoExt = entry.name.slice(0, -3)
      // Match: exact, case-insensitive, space↔underscore, title from frontmatter
      if (nameNoExt.toLowerCase() === target.toLowerCase() ||
          nameNoExt.toLowerCase() === target.toLowerCase().replace(/\s+/g, "_") ||
          nameNoExt.toLowerCase().replace(/_/g, " ") === target.toLowerCase()) {
        return fullPath
      }
    }
  }
  return null
}

function findByTitle(dir: string, target: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findByTitle(fullPath, target)
      if (found) return found
    } else if (entry.name.endsWith(".md")) {
      try {
        const content = readFileSync(fullPath, "utf-8")
        const m = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
        if (m && m[1].trim().toLowerCase() === target.toLowerCase()) {
          return fullPath
        }
      } catch {
        // skip
      }
    }
  }
  return null
}

export async function readCommand(options: ReadOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found. Run 'llm-wiki init' first."))
    return
  }

  // Try exact path first
  let pagePath = join(wikiDir, options.page)
  if (!existsSync(pagePath) && !pagePath.endsWith(".md")) {
    pagePath = pagePath + ".md"
  }

  // Try walking to find by filename
  if (!existsSync(pagePath)) {
    const found = findFile(wikiDir, options.page)
    if (found) pagePath = found
  }

  // Try finding by title
  if (!existsSync(pagePath)) {
    const found = findByTitle(wikiDir, options.page)
    if (found) pagePath = found
  }

  if (!existsSync(pagePath)) {
    console.log(chalk.red(`Page not found: ${options.page}`))
    return
  }

  const content = readFileSync(pagePath, "utf-8")

  if (options.raw) {
    console.log(content)
    return
  }

  // Extract title from frontmatter
  let title = options.page.replace(/\.md$/, "")
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3)
    if (endIdx > 0) {
      const m = content.slice(3, endIdx).match(/^title:\s*["']?(.+?)["']?\s*$/m)
      if (m) title = m[1].trim()
    }
  }

  console.log(chalk.bold(`\n${title}\n`))
  console.log(chalk.dim("─".repeat(Math.min(title.length + 4, 60))))
  console.log()

  // Print body without frontmatter
  let body = content
  if (content.startsWith("---")) {
    const endIdx = content.indexOf("---", 3)
    if (endIdx > 0) {
      body = content.slice(endIdx + 3).trimStart()
    }
  }
  console.log(body)
}
