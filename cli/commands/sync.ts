import { watch } from "chokidar"
import chalk from "chalk"
import { join } from "node:path"
import ora from "ora"
import { ingestCommand } from "./ingest.js"
import { sourceDeleteCommand } from "./source-delete.js"

interface SyncOptions {
  projectPath?: string
  autoIngest?: boolean
}

export async function syncCommand(options: SyncOptions) {
  const projectPath = options.projectPath || process.cwd()
  const sourcesDir = join(projectPath, "raw", "sources")

  console.log(chalk.bold("\nFile Sync\n"))
  console.log(`Watching: ${chalk.cyan(sourcesDir)}`)
  if (options.autoIngest) {
    console.log(chalk.dim("Auto-ingest: enabled (new files will be processed automatically)\n"))
  } else {
    console.log(chalk.dim("Auto-ingest: disabled (use --auto-ingest to enable)\n"))
  }

  const spinner = ora("Starting file watcher...").start()

  const watcher = watch(sourcesDir, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  })

  watcher.on("add", async (path) => {
    spinner.stop()
    console.log(chalk.green(`+ Added: ${path}`))
    if (options.autoIngest) {
      console.log(chalk.dim("  Auto-ingesting..."))
      await ingestCommand({ files: [path], projectPath })
    } else {
      console.log(chalk.dim("  Run 'llm-wiki ingest' to process new files"))
    }
    spinner.start()
  })

  watcher.on("change", async (path) => {
    spinner.stop()
    console.log(chalk.yellow(`~ Modified: ${path}`))
    if (options.autoIngest) {
      console.log(chalk.dim("  Re-ingesting..."))
      await ingestCommand({ files: [path], projectPath })
    }
    spinner.start()
  })

  watcher.on("unlink", async (path) => {
    spinner.stop()
    console.log(chalk.red(`- Removed: ${path}`))
    if (options.autoIngest) {
      const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path
      await sourceDeleteCommand({
        files: [fileName],
        projectPath,
        yes: true,
      })
    }
    spinner.start()
  })

  spinner.succeed("Watching for changes (Press Ctrl+C to stop)")

  await new Promise(() => {})
}
