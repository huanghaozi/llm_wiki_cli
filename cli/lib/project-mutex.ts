/**
 * Per-project async mutex.
 *
 * Why this exists: ingest reads `wiki/index.md` at analysis time,
 * asks the LLM to emit an updated `index.md`, then overwrites the
 * file at write time. If two ingests run concurrently for the SAME
 * project (CLI ingest while `sync --auto-ingest` fires), each LLM
 * sees the same pre-state, each emits its own "updated" version,
 * and whichever finishes second silently overwrites the first.
 *
 * Wrapping ingest's body in `withProjectLock(projectPath, …)` forces
 * all entry points to take turns.
 */

const locks = new Map<string, Promise<unknown>>()

export async function withProjectLock<T>(
  projectPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(projectPath) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  locks.set(
    projectPath,
    prev.then(() => next),
  )
  try {
    await prev.catch(() => {})
    return await fn()
  } finally {
    release()
    if (locks.get(projectPath) === next || locks.size > 1024) {
      const tail = locks.get(projectPath)
      if (tail) {
        Promise.resolve().then(() => {
          if (locks.get(projectPath) === tail) {
            locks.delete(projectPath)
          }
        })
      }
    }
  }
}

export function __resetProjectLocksForTesting(): void {
  locks.clear()
}
