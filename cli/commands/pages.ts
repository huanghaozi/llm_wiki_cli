import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"

interface PagesOptions {
  projectPath?: string
  format?: "list" | "tree" | "json"
}

function listMdFiles(dir: string, prefix = ""): Array<{ path: string; relPath: string; title: string }> {
  const files: Array<{ path: string; relPath: string; title: string }> = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...listMdFiles(fullPath, relPath))
    } else if (entry.name.endsWith(".md")) {
      let title = entry.name.replace(/\.md$/, "")
      try {
        const content = readFileSync(fullPath, "utf-8")
        if (content.startsWith("---")) {
          const endIdx = content.indexOf("---", 3)
          if (endIdx > 0) {
            const m = content.slice(3, endIdx).match(/^title:\s*["']?(.+?)["']?\s*$/m)
            if (m) title = m[1].trim()
          }
        }
      } catch {
        // use filename
      }
      files.push({ path: fullPath, relPath, title })
    }
  }
  return files
}

function tree(dir: string, prefix = "", isLast = true): string[] {
  const lines: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const isLastItem = i === entries.length - 1
    const connector = isLastItem ? "└── " : "├── "
    const line = `${prefix}${connector}${chalk.cyan(entry.name)}`

    if (entry.isDirectory()) {
      lines.push(line)
      const childPrefix = prefix + (isLastItem ? "    " : "│   ")
      lines.push(...tree(join(dir, entry.name), childPrefix, isLastItem))
    } else if (entry.name.endsWith(".md")) {
      lines.push(line)
    }
  }
  return lines
}

export async function pagesCommand(options: PagesOptions) {
  const projectPath = options.projectPath || process.cwd()
  const wikiDir = join(projectPath, "wiki")

  if (!existsSync(wikiDir)) {
    console.log(chalk.red("No wiki directory found. Run 'llm-wiki init' first."))
    return
  }

  if (options.format === "json") {
    const files = listMdFiles(wikiDir)
    console.log(JSON.stringify(files, null, 2))
    return
  }

  if (options.format === "tree") {
    console.log(chalk.bold("\nWiki Pages\n"))
    console.log(chalk.cyan("wiki/"))
    const lines = tree(wikiDir)
    for (const line of lines) {
      console.log(line)
    }
    return
  }

  const files = listMdFiles(wikiDir)

  console.log(chalk.bold(`\nWiki Pages (${files.length}):\n`))

  for (const file of files) {
    console.log(`  ${chalk.cyan(file.title)} ${chalk.dim(`(${file.relPath})`)}`)
  }
}
