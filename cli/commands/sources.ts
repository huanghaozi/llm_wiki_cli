import { existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"

interface SourcesOptions {
  projectPath?: string
  format?: "list" | "tree" | "json"
}

function listSourceFiles(dir: string, prefix = ""): Array<{ path: string; relPath: string; size: number }> {
  const files: Array<{ path: string; relPath: string; size: number }> = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath, relPath))
    } else {
      const stats = statSync(fullPath)
      files.push({ path: fullPath, relPath, size: stats.size })
    }
  }
  return files
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export async function sourcesCommand(options: SourcesOptions) {
  const projectPath = options.projectPath || process.cwd()
  const sourcesDir = join(projectPath, "raw", "sources")

  if (!existsSync(sourcesDir)) {
    console.log(chalk.red("No sources directory found. Run 'llm-wiki init' first."))
    return
  }

  const files = listSourceFiles(sourcesDir)

  if (options.format === "json") {
    console.log(JSON.stringify(files, null, 2))
    return
  }

  console.log(chalk.bold(`\nSource Files (${files.length}):\n`))

  for (const file of files) {
    console.log(`  ${chalk.cyan(file.relPath)} ${chalk.dim(formatBytes(file.size))}`)
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  console.log(chalk.dim(`\nTotal: ${formatBytes(totalSize)}`))
}
