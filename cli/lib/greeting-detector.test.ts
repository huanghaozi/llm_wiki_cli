import { describe, it, expect } from "vitest"
import { isGreeting } from "./greeting-detector.js"

describe("cli greeting-detector", () => {
  it("detects greetings", () => {
    expect(isGreeting("你好")).toBe(true)
    expect(isGreeting("hello")).toBe(true)
  })

  it("rejects real questions", () => {
    expect(isGreeting("hello, how does transformer work?")).toBe(false)
  })
})
