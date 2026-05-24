import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { loadConfig, saveConfig, loadProjects, saveProject } from "./config-store.js"

describe("config-store", () => {
  let configDir: string
  let originalHome: string | undefined

  beforeEach(() => {
    configDir = join(tmpdir(), `llm-wiki-config-test-${Date.now()}`)
    mkdirSync(configDir, { recursive: true })
    originalHome = process.env.HOME
    process.env.HOME = configDir
    process.env.USERPROFILE = configDir
  })

  afterEach(() => {
    if (originalHome) process.env.HOME = originalHome
    try { rmSync(configDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it("loads defaults and saves config", () => {
    const cfg = loadConfig()
    expect(cfg.provider).toBe("openai")
    saveConfig({ ...cfg, model: "gpt-4o-mini" })
    expect(loadConfig().model).toBe("gpt-4o-mini")
    expect(existsSync(join(configDir, ".llm-wiki-cli", "config.json"))).toBe(true)
  })

  it("manages recent projects", () => {
    saveProject({ id: "1", name: "Demo", path: "/tmp/demo", createdAt: new Date().toISOString() })
    const projects = loadProjects()
    expect(projects[0].name).toBe("Demo")
  })

  it("handles corrupt config json gracefully", () => {
    const cfg = loadConfig()
    saveConfig(cfg)
    const configFile = join(configDir, ".llm-wiki-cli", "config.json")
    writeFileSync(configFile, "{not json")
    expect(loadConfig().provider).toBe("openai")
  })
})
