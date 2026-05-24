import { input, confirm, select } from "@inquirer/prompts"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { saveProject } from "../lib/config-store.js"
import type { CliProject } from "../types/cli.js"

const TEMPLATES = [
  { id: "general", name: "General", description: "Minimal setup — a blank slate for any purpose" },
  { id: "research", name: "Research", description: "Deep-dive research with hypothesis tracking" },
  { id: "reading", name: "Reading", description: "Track books, characters, themes, and notes" },
  { id: "personal", name: "Personal Growth", description: "Goals, habits, reflections, and journal" },
  { id: "business", name: "Business", description: "Meetings, decisions, projects, and stakeholders" },
]

const TEMPLATE_DIRS: Record<string, string[]> = {
  general: ["wiki/entities", "wiki/concepts", "wiki/sources", "wiki/queries"],
  research: ["wiki/entities", "wiki/concepts", "wiki/sources", "wiki/queries", "wiki/methodology", "wiki/findings", "wiki/thesis"],
  reading: ["wiki/entities", "wiki/concepts", "wiki/sources", "wiki/queries", "wiki/characters", "wiki/themes", "wiki/plot-threads", "wiki/chapters"],
  personal: ["wiki/entities", "wiki/concepts", "wiki/sources", "wiki/queries", "wiki/goals", "wiki/habits", "wiki/reflections", "wiki/journal"],
  business: ["wiki/entities", "wiki/concepts", "wiki/sources", "wiki/queries", "wiki/meetings", "wiki/decisions", "wiki/projects", "wiki/stakeholders"],
}

const PURPOSE_TEMPLATES: Record<string, string> = {
  general: `# Project Purpose

## Goal

<!-- What are you trying to understand or build? -->

## Key Questions

1.
2.
3.

## Scope

**In scope:**
-

**Out of scope:**
-

## Thesis

> TBD
`,
  research: `# Project Purpose — Research Deep-Dive

## Research Question

>

## Hypothesis / Working Thesis

>

## Background

<!-- Context and motivation for this research -->
`,
  reading: `# Project Purpose — Reading

## Book Details

**Title:**
**Author:**

## Why I'm Reading This

## Key Themes to Track

1.
2.
3.
`,
  personal: `# Project Purpose — Personal Growth

## Focus Areas

1.
2.
3.

## Motivation

## Current Goals (Summary)
`,
  business: `# Project Purpose — Business / Team

## Business Context

**Organisation / Team:**
**Domain:**

## Objectives

1.
2.
3.
`,
}

const WELCOME_TEMPLATE = `---
title: Welcome
created: {{date}}
---

# Welcome to your LLM Wiki

This is your personal knowledge base. Documents ingested into this project will be automatically organized and linked.

## Getting Started

1. Place source documents in the \`raw/sources/\` directory
2. Run \`llm-wiki ingest\` to process them
3. Use \`llm-wiki chat\` to query your knowledge base
4. Use \`llm-wiki search\` to find information
5. Use \`llm-wiki lint\` to check wiki health
`

export async function initCommand(targetPath?: string, templateId?: string) {
  const spinner = ora()

  let projectPath: string
  if (targetPath) {
    projectPath = resolve(targetPath)
  } else {
    projectPath = await input({
      message: "Project directory path:",
      default: "./my-wiki",
    })
    projectPath = resolve(projectPath)
  }

  if (existsSync(projectPath)) {
    const hasWiki = existsSync(join(projectPath, "wiki"))
    const hasLl = existsSync(join(projectPath, ".llm-wiki"))
    if (hasWiki || hasLl) {
      const overwrite = await confirm({
        message: `Directory appears to already be a wiki project. Continue?`,
        default: false,
      })
      if (!overwrite) {
        console.log(chalk.yellow("Aborted."))
        return
      }
    }
  }

  const defaultName = projectPath.replace(/\\/g, "/").split("/").pop() || "my-wiki"
  const projectName = await input({
    message: "Project name:",
    default: defaultName,
  })

  // Template selection
  let selectedTemplate = templateId
  if (!selectedTemplate) {
    selectedTemplate = await select({
      message: "Choose a project template:",
      choices: TEMPLATES.map((t) => ({
        name: `${t.name} — ${t.description}`,
        value: t.id,
      })),
      default: "general",
    })
  }

  spinner.start("Creating project structure...")

  const baseDirs = [
    join(projectPath, "wiki"),
    join(projectPath, "raw", "sources"),
    join(projectPath, ".llm-wiki"),
  ]
  for (const dir of baseDirs) {
    mkdirSync(dir, { recursive: true })
  }

  // Create template-specific directories
  const extraDirs = TEMPLATE_DIRS[selectedTemplate] || TEMPLATE_DIRS.general
  for (const dir of extraDirs) {
    mkdirSync(join(projectPath, dir), { recursive: true })
  }

  const project: CliProject = {
    id: crypto.randomUUID(),
    name: projectName,
    path: projectPath,
    createdAt: new Date().toISOString(),
  }

  writeFileSync(
    join(projectPath, ".llm-wiki", "project.json"),
    JSON.stringify(project, null, 2),
  )

  const welcomeContent = WELCOME_TEMPLATE.replace("{{date}}", new Date().toISOString().split("T")[0])
  writeFileSync(join(projectPath, "wiki", "Welcome.md"), welcomeContent)
  writeFileSync(join(projectPath, "purpose.md"), PURPOSE_TEMPLATES[selectedTemplate] || PURPOSE_TEMPLATES.general)
  writeFileSync(join(projectPath, "wiki", "index.md"), `# Wiki Index\n\n<!-- Auto-updated during ingest -->\n\n- [[Welcome]] — Getting started guide\n`)
  writeFileSync(join(projectPath, "wiki", "log.md"), `# Wiki Log\n\n## ${new Date().toISOString().split("T")[0]}\n\n- Project initialized\n`)

  // Write schema file
  const schemaContent = `# Wiki Schema

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| entity | wiki/entities/ | Named things (people, tools, organizations) |
| concept | wiki/concepts/ | Ideas, techniques, phenomena, frameworks |
| source | wiki/sources/ | Papers, articles, talks, books |
| query | wiki/queries/ | Open questions under investigation |

## Naming Conventions

- Files: \`kebab-case.md\`
- Entities: match official name (e.g., \`openai.md\`)
- Concepts: descriptive noun phrases (e.g., \`chain-of-thought.md\`)
- Sources: \`author-year-slug.md\`

## Frontmatter

All pages must include YAML frontmatter:

\`\`\`yaml
---
type: entity | concept | source | query
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
\`\`\`
`
  // Schema lives at the project root so ingest can find it via
  // `${projectPath}/schema.md` (matches the desktop app's location).
  writeFileSync(join(projectPath, "schema.md"), schemaContent)

  saveProject(project)

  spinner.succeed(chalk.green(`Project "${projectName}" created at ${projectPath}`))
  console.log(chalk.dim(`\nTemplate: ${TEMPLATES.find((t) => t.id === selectedTemplate)?.name || "General"}`))
  console.log(chalk.dim("\nNext steps:"))
  console.log(chalk.dim("  1. Add documents to raw/sources/"))
  console.log(chalk.dim("  2. Run llm-wiki ingest"))
  console.log(chalk.dim("  3. Run llm-wiki chat to query"))
  console.log(chalk.dim("  4. Run llm-wiki lint to check health"))
}
