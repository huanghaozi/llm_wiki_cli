import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

export interface ExtractedNativeImage {
  index: number
  mimeType: string
  page?: number | null
  width: number
  height: number
  filePath: string
  sha256: string
}

const PLATFORM_SUFFIX: Record<string, string> = {
  win32: ".exe",
  linux: "",
  darwin: "",
}

function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, "..", "..")
}

export function resolveNativeBinary(): string | null {
  const root = repoRoot()
  const ext = PLATFORM_SUFFIX[process.platform] ?? ""
  const candidates = [
    join(root, "native", "target", "release", `llm-wiki-native${ext}`),
    join(root, "native", "target", "debug", `llm-wiki-native${ext}`),
    join(root, "bin", `llm-wiki-native${ext}`),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

export function isNativeAvailable(): boolean {
  return resolveNativeBinary() !== null
}

export function extractImagesNative(
  inputPath: string,
  outputDir: string,
): ExtractedNativeImage[] | null {
  const bin = resolveNativeBinary()
  if (!bin) return null

  const result = spawnSync(
    bin,
    ["extract-images", "--input", inputPath, "--output-dir", outputDir, "--format", "json"],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  )

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Native extract-images failed")
  }

  try {
    return JSON.parse(result.stdout.trim()) as ExtractedNativeImage[]
  } catch {
    throw new Error("Native extract-images returned invalid JSON")
  }
}

export function startClipServerNative(port: number, projectPath: string): boolean {
  const bin = resolveNativeBinary()
  if (!bin) return false

  const child = spawnSync(
    bin,
    ["clip-server", "--port", String(port), "--project-path", projectPath],
    { detached: true, stdio: "ignore" },
  )
  return child.status === 0 || child.pid !== undefined
}
