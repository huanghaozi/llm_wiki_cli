import { readFileSync, existsSync } from "node:fs"
import { join, basename, resolve } from "node:path"
import chalk from "chalk"
import { loadConfig, loadProjects } from "../lib/config-store.js"
import { applyProxyFromConfig } from "../lib/proxy-config.js"
import { hybridSearchWikiPages } from "../lib/search-engine.js"
import { buildWikiGraph } from "../lib/wiki-graph.js"
import { listWikiMdFiles } from "../lib/wiki-files.js"

interface ServeOptions {
  projectPath?: string
  port?: number
}

function projectIdFromPath(path: string): string {
  return Buffer.from(resolve(path)).toString("base64url").slice(0, 16)
}

export async function serveCommand(options: ServeOptions) {
  applyProxyFromConfig()
  const config = loadConfig()
  const defaultProject = resolve(options.projectPath || process.cwd())
  const api = config.apiServer ?? { enabled: true, port: 19828, allowUnauthenticated: true, token: "" }
  const port = options.port ?? api.port ?? 19828

  const registry = new Map<string, string>()
  for (const p of loadProjects()) {
    if (existsSync(join(p.path, "wiki"))) {
      registry.set(projectIdFromPath(p.path), p.path)
    }
  }
  if (existsSync(join(defaultProject, "wiki"))) {
    registry.set("current", defaultProject)
    registry.set(projectIdFromPath(defaultProject), defaultProject)
  }

  const envToken = process.env.LLM_WIKI_API_TOKEN
  const token = envToken || api.token

  function authorized(req: Request): boolean {
    if (!api.enabled) return false
    if (api.allowUnauthenticated && !token) return true
    const auth = req.headers.get("authorization") ?? ""
    const wikiToken = req.headers.get("x-llm-wiki-token") ?? ""
    const queryToken = new URL(req.url).searchParams.get("token")
    if (token && (auth === `Bearer ${token}` || wikiToken === token || queryToken === token)) return true
    return api.allowUnauthenticated
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  function resolveProject(id: string): string | null {
    if (registry.has(id)) return registry.get(id)!
    for (const [, path] of registry) {
      if (path.endsWith(id) || basename(path) === id) return path
    }
    return null
  }

  console.log(chalk.bold(`\nLLM Wiki API Server\n`))
  console.log(chalk.cyan(`http://127.0.0.1:${port}/api/v1/health`))
  console.log(chalk.dim(`Projects registered: ${registry.size}\n`))

  Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-LLM-Wiki-Token",
          },
        })
      }

      if (path === "/health" || path === "/api/v1/health") {
        return json({
          ok: true,
          status: "running",
          version: "0.4.13-cli",
          authRequired: Boolean(token),
          enabled: api.enabled,
        })
      }

      if (!path.startsWith("/api/v1")) return json({ ok: false, error: "Not found" }, 404)
      if (!api.enabled) return json({ ok: false, error: "API server disabled" }, 503)
      if (!authorized(req)) return json({ ok: false, error: "Unauthorized" }, 401)

      const parts = path.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean)

      try {
        if (req.method === "GET" && parts[0] === "projects" && parts.length === 1) {
          const projects = [...registry.entries()].map(([id, p]) => ({
            id,
            path: p,
            name: basename(p),
          }))
          return json({ ok: true, projects })
        }

        const projectId = parts[1] ?? "current"
        const projectPath = resolveProject(projectId)
        if (!projectPath && parts[0] === "projects") {
          return json({ ok: false, error: "Project not found" }, 404)
        }

        if (req.method === "GET" && parts[0] === "projects" && parts[2] === "files" && parts.length === 3 && projectPath) {
          const wikiDir = join(projectPath, "wiki")
          const files = listWikiMdFiles(wikiDir).map((f) => ({
            path: `wiki/${f.relPath}`,
            title: basename(f.path, ".md"),
          }))
          return json({ ok: true, files })
        }

        if (req.method === "GET" && parts[0] === "projects" && parts[2] === "files" && parts[3] === "content" && projectPath) {
          const filePath = url.searchParams.get("path")
          if (!filePath) return json({ ok: false, error: "path required" }, 400)
          const abs = join(projectPath, filePath.replace(/^\/+/, ""))
          if (!existsSync(abs)) return json({ ok: false, error: "not found" }, 404)
          return json({ ok: true, content: readFileSync(abs, "utf-8") })
        }

        if (req.method === "POST" && parts[0] === "projects" && parts[2] === "search" && projectPath) {
          const body = await req.json() as { query?: string }
          if (!body.query) return json({ ok: false, error: "query required" }, 400)
          const { mode, results } = await hybridSearchWikiPages(
            projectPath,
            body.query,
            20,
            config.embedding,
          )
          return json({ ok: true, mode, results })
        }

        if (req.method === "GET" && parts[0] === "projects" && parts[2] === "graph" && projectPath) {
          const graph = buildWikiGraph(projectPath)
          return json({ ok: true, ...graph })
        }

        if (req.method === "POST" && parts[0] === "projects" && parts[2] === "sources" && parts[3] === "rescan" && projectPath) {
          const { ingestCommand } = await import("./ingest.js")
          await ingestCommand({ projectPath })
          return json({ ok: true, message: "Rescan complete" })
        }

        if (req.method === "POST" && parts[0] === "projects" && parts[2] === "chat" && projectPath) {
          return json({
            ok: false,
            error: "Chat API not available over HTTP. Use `llm-wiki chat` in the terminal.",
          }, 501)
        }

        return json({ ok: false, error: "Not found" }, 404)
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
      }
    },
  })

  console.log(chalk.green("Server running. Press Ctrl+C to stop."))
  await new Promise(() => {})
}
