import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import chalk from "chalk"

interface OpenFolderOptions {
  path?: string
}

export async function openFolderCommand(options: OpenFolderOptions) {
  const projectPath = resolve(options.path || process.cwd())

  if (!existsSync(projectPath)) {
    console.log(chalk.red(`Path not found: ${projectPath}`))
    return
  }

  const platform = process.platform
  let cmd: string
  let args: string[]

  if (platform === "win32") {
    cmd = "explorer"
    args = [projectPath]
  } else if (platform === "darwin") {
    cmd = "open"
    args = [projectPath]
  } else {
    cmd = "xdg-open"
    args = [projectPath]
  }

  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref()
  console.log(chalk.green(`Opened folder: ${projectPath}`))
}
