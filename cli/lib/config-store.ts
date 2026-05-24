import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { CliConfig, CliProject } from "../types/cli.js"

const CONFIG_DIR_NAME = ".llm-wiki-cli"

function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR_NAME)
}

function getConfigFile(): string {
  return join(getConfigDir(), "config.json")
}

function getProjectsFile(): string {
  return join(getConfigDir(), "projects.json")
}

function ensureDir() {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
}

function loadJson<T>(path: string, defaultValue: T): T {
  if (!existsSync(path)) return defaultValue
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T
  } catch {
    return defaultValue
  }
}

function saveJson<T>(path: string, data: T) {
  ensureDir()
  writeFileSync(path, JSON.stringify(data, null, 2))
}

export function loadConfig(): CliConfig {
  return loadJson<CliConfig>(getConfigFile(), {
    provider: "openai",
    apiKey: "",
    model: "gpt-4o",
    maxContextSize: 128000,
    searchProvider: "none",
    searchApiKey: "",
    outputLanguage: "auto",
    embedding: {
      enabled: false,
      endpoint: "https://api.openai.com/v1/embeddings",
      apiKey: "",
      model: "text-embedding-3-small",
      maxChunkChars: 1000,
      overlapChunkChars: 200,
    },
    multimodal: {
      enabled: false,
      useMainLlm: true,
    },
    apiServer: {
      enabled: true,
      port: 19828,
      allowUnauthenticated: true,
      token: "",
    },
  })
}

export function saveConfig(config: CliConfig) {
  saveJson(getConfigFile(), config)
}

export function loadProjects(): CliProject[] {
  return loadJson<CliProject[]>(getProjectsFile(), [])
}

export function saveProject(project: CliProject) {
  const projects = loadProjects().filter((p) => p.path !== project.path)
  projects.unshift(project)
  saveJson(getProjectsFile(), projects.slice(0, 10))
}

export function getRecentProjects(): CliProject[] {
  return loadProjects()
}
