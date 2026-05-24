import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join, dirname, basename, extname } from "node:path"

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
}

export function readTextFile(path: string): string {
  return readFileSync(path, "utf-8")
}

export function writeTextFile(path: string, content: string) {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, content)
}

export function fileExists(path: string): boolean {
  return existsSync(path)
}

export function listDirectory(path: string): FileNode[] {
  if (!existsSync(path)) return []
  const entries = readdirSync(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    is_dir: entry.isDirectory(),
  }))
}

export function readDirRecursive(path: string): FileNode[] {
  const entries = readdirSync(path, { withFileTypes: true })
  return entries.map((entry) => {
    const fullPath = join(path, entry.name)
    if (entry.isDirectory()) {
      return {
        name: entry.name,
        path: fullPath,
        is_dir: true,
        children: readDirRecursive(fullPath),
      }
    }
    return { name: entry.name, path: fullPath, is_dir: false }
  })
}

export function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export { join, dirname, basename, extname }
