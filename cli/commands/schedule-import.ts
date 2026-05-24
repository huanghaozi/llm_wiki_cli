import { existsSync, readFileSync, readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import chalk from "chalk"
import { loadConfig } from "../lib/config-store.js"
import { ingestCommand } from "./ingest.js"

interface ScheduleOptions {
  projectPath?: string
  once?: boolean
}

export async function scheduleImportCommand(options: ScheduleOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()
  const sched = config.scheduledImport ?? { enabled: true, path: "raw", intervalMinutes: 30 }

  const watchPath = join(projectPath, sched.path || "raw")
  if (!existsSync(watchPath)) {
    console.log(chalk.red(`Watch path not found: ${watchPath}`))
    return
  }

  console.log(chalk.bold(`\nScheduled Import: ${watchPath}\n`))
  console.log(chalk.dim(`Interval: ${sched.intervalMinutes} minutes. Press Ctrl+C to stop.\n`))

  const scan = async () => {
    const dbPath = join(projectPath, ".llm-wiki", "scheduled-import-db.json")
    let db: { files: Record<string, string>; lastScan: number | null } = { files: {}, lastScan: null }
    if (existsSync(dbPath)) {
      try {
        const parsed = JSON.parse(readFileSync(dbPath, "utf-8")) as { directories?: Record<string, typeof db> }
        db = parsed.directories?.[sched.path] ?? db
      } catch {
        // fresh db
      }
    }

    const sourcesDir = join(projectPath, "raw", "sources")
    if (!existsSync(sourcesDir)) mkdirSync(sourcesDir, { recursive: true })

    const files = listFilesRecursive(watchPath)
    let imported = 0

    for (const file of files) {
      const rel = relative(watchPath, file).replace(/\\/g, "/")
      const stat = statSync(file)
      const fingerprint = `${stat.size}:${stat.mtimeMs}`
      if (db.files[rel] === fingerprint) continue

      const dest = join(sourcesDir, rel)
      mkdirSync(join(dest, ".."), { recursive: true })
      copyFileSync(file, dest)
      db.files[rel] = fingerprint
      imported++
    }

    db.lastScan = Date.now()
    const store = { version: 1, directories: { [sched.path]: db } }
    mkdirSync(join(projectPath, ".llm-wiki"), { recursive: true })
    writeFileSync(dbPath, JSON.stringify(store, null, 2))

    if (imported > 0) {
      console.log(chalk.green(`[${new Date().toLocaleTimeString()}] Imported ${imported} new/changed file(s)`))
      await ingestCommand({ projectPath })
    } else {
      console.log(chalk.dim(`[${new Date().toLocaleTimeString()}] No changes`))
    }
  }

  await scan()
  if (options.once) return

  const intervalMs = Math.max(1, sched.intervalMinutes) * 60_000
  setInterval(scan, intervalMs)
}

function listFilesRecursive(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listFilesRecursive(full))
    else files.push(full)
  }
  return files
}
