import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import chalk from "chalk"
import { loadProjects, saveProject } from "../lib/config-store.js"
import type { CliProject } from "../types/cli.js"

interface OpenOptions {
  path?: string
}

export async function openCommand(options: OpenOptions) {
  let projectPath: string

  if (options.path) {
    projectPath = resolve(options.path)
  } else {
    const recent = loadProjects()
    if (recent.length === 0) {
      console.log(chalk.red("No recent projects. Specify a path: llm-wiki open <path>"))
      return
    }

    console.log(chalk.bold("\nRecent Projects:\n"))
    for (let i = 0; i < recent.length; i++) {
      const p = recent[i]
      console.log(`  ${chalk.cyan(`${i + 1}.`)} ${p.name} ${chalk.dim(`(${p.path})`)}`)
    }

    const { select } = await import("@inquirer/prompts")
    const choices = recent.map((p, i) => ({
      name: `${p.name} (${p.path})`,
      value: p.path,
    }))

    projectPath = await select({
      message: "Select a project:",
      choices,
    })
  }

  if (!existsSync(projectPath)) {
    console.log(chalk.red(`Project not found: ${projectPath}`))
    return
  }

  // Validate it's a wiki project
  const projectFile = join(projectPath, ".llm-wiki", "project.json")
  let project: CliProject | null = null

  if (existsSync(projectFile)) {
    try {
      project = JSON.parse(readFileSync(projectFile, "utf-8")) as CliProject
    } catch {
      // invalid project file
    }
  }

  if (!project) {
    // Try to infer from directory structure
    const hasWiki = existsSync(join(projectPath, "wiki"))
    const hasRaw = existsSync(join(projectPath, "raw"))

    if (!hasWiki && !hasRaw) {
      console.log(chalk.yellow(`Warning: ${projectPath} doesn't look like a wiki project.`))
      const { confirm } = await import("@inquirer/prompts")
      const proceed = await confirm({
        message: "Open anyway?",
        default: false,
      })
      if (!proceed) return
    }

    const dirName = projectPath.replace(/\\/g, "/").split("/").pop() || "project"
    project = {
      id: crypto.randomUUID(),
      name: dirName,
      path: projectPath,
      createdAt: new Date().toISOString(),
    }

    // Save project file
    try {
      const { mkdirSync, writeFileSync } = await import("node:fs")
      mkdirSync(join(projectPath, ".llm-wiki"), { recursive: true })
      writeFileSync(projectFile, JSON.stringify(project, null, 2))
    } catch {
      // ignore
    }
  }

  // Save to recent projects
  saveProject(project)

  // Show project info
  console.log(chalk.bold(`\nOpened: ${project.name}\n`))
  console.log(`Path: ${chalk.cyan(project.path)}`)

  // Count wiki pages
  const { readdirSync, statSync } = await import("node:fs")
  const wikiDir = join(projectPath, "wiki")
  let pageCount = 0
  if (existsSync(wikiDir)) {
    const countFiles = (dir: string): number => {
      let count = 0
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += countFiles(join(dir, entry.name))
        } else if (entry.name.endsWith(".md")) {
          count++
        }
      }
      return count
    }
    pageCount = countFiles(wikiDir)
  }

  const sourcesDir = join(projectPath, "raw", "sources")
  let sourceCount = 0
  if (existsSync(sourcesDir)) {
    const countFiles = (dir: string): number => {
      let count = 0
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += countFiles(join(dir, entry.name))
        } else {
          count++
        }
      }
      return count
    }
    sourceCount = countFiles(sourcesDir)
  }

  console.log(`Wiki pages: ${chalk.cyan(pageCount)}`)
  console.log(`Source files: ${chalk.cyan(sourceCount)}`)
  console.log(chalk.dim("\nUse --project flag or cd into this directory for other commands."))
}
