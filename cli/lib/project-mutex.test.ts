import { describe, it, expect, beforeEach } from "vitest"
import { withProjectLock, __resetProjectLocksForTesting } from "./project-mutex.js"

describe("withProjectLock", () => {
  beforeEach(() => {
    __resetProjectLocksForTesting()
  })

  it("serializes concurrent calls for the same project", async () => {
    const events: string[] = []
    const slow = async () => {
      events.push("A:start")
      await new Promise((r) => setTimeout(r, 20))
      events.push("A:end")
      return "A"
    }
    const fast = async () => {
      events.push("B:start")
      events.push("B:end")
      return "B"
    }
    const [a, b] = await Promise.all([
      withProjectLock("/proj", slow),
      withProjectLock("/proj", fast),
    ])
    expect(a).toBe("A")
    expect(b).toBe("B")
    // Either A fully before B, or B fully before A — never interleaved.
    expect(
      events.join(",") === "A:start,A:end,B:start,B:end" ||
        events.join(",") === "B:start,B:end,A:start,A:end",
    ).toBe(true)
  })

  it("does NOT block different projects from running in parallel", async () => {
    let aHolding = true
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 30))
      aHolding = false
      return "done"
    }
    const promA = withProjectLock("/proj-a", slow)
    // While A is in flight, B should run immediately for a different project.
    const promB = withProjectLock("/proj-b", async () => {
      expect(aHolding).toBe(true) // A still holding its lock
      return "B"
    })
    await Promise.all([promA, promB])
  })

  it("releases lock even when the callback throws", async () => {
    await expect(
      withProjectLock("/proj-err", async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    // A subsequent call must still run.
    const r = await withProjectLock("/proj-err", async () => "ok")
    expect(r).toBe("ok")
  })
})
