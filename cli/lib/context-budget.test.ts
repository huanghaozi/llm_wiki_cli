import { describe, it, expect } from "vitest"
import { computeContextBudget } from "./context-budget.js"

describe("cli context-budget", () => {
  it("computes budgets for default and custom sizes", () => {
    const d = computeContextBudget(undefined)
    expect(d.maxCtx).toBe(204_800)
    const small = computeContextBudget(8192)
    expect(small.pageBudget).toBeLessThan(d.pageBudget)
  })
})
