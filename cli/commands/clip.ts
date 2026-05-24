import chalk from "chalk"
import { loadConfig } from "../lib/config-store.js"
import { isNativeAvailable, resolveNativeBinary } from "../lib/native-bridge.js"

interface ClipOptions {
  projectPath?: string
  port?: number
}

export async function clipCommand(options: ClipOptions) {
  const projectPath = options.projectPath || process.cwd()
  const port = options.port ?? 19827

  if (!isNativeAvailable()) {
    console.log(chalk.red("Native binary not found. Build with: yarn native:build"))
    console.log(chalk.dim("See native/README.md for cross-platform build instructions."))
    return
  }

  const bin = resolveNativeBinary()!
  console.log(chalk.bold("\nStarting Clip Server\n"))
  console.log(chalk.cyan(`http://127.0.0.1:${port}`))
  console.log(chalk.dim(`Project: ${projectPath}`))
  console.log(chalk.dim(`Binary: ${bin}\n`))

  const proc = Bun.spawn([bin, "clip-server", "--port", String(port), "--project-path", projectPath], {
    stdout: "inherit",
    stderr: "inherit",
  })

  console.log(chalk.green("Clip server running. Press Ctrl+C to stop."))
  await proc.exited
}
