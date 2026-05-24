import { describe, it, expect, vi, beforeEach } from "vitest"
import { spawnSync } from "node:child_process"
import {
  resolveNativeBinary,
  isNativeAvailable,
  extractImagesNative,
  startClipServerNative,
} from "./native-bridge.js"

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}))

describe("native-bridge", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset()
  })

  it("resolves binary path when built", () => {
    const bin = resolveNativeBinary()
    if (bin) {
      expect(bin).toContain("llm-wiki-native")
    }
  })

  it("reports availability consistently", () => {
    expect(isNativeAvailable()).toBe(resolveNativeBinary() !== null)
  })

  it("returns null when binary missing", () => {
    if (resolveNativeBinary() !== null) {
      expect(isNativeAvailable()).toBe(true)
      return
    }
    expect(extractImagesNative("/missing.pdf", "/out")).toBeNull()
  })

  it("parses extract-images JSON output", () => {
    const bin = resolveNativeBinary()
    if (!bin) {
      expect(extractImagesNative("/a.pdf", "/out")).toBeNull()
      return
    }

    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([{ index: 1, mimeType: "image/png", width: 10, height: 10, filePath: "/out/1.png", sha256: "abc" }]),
      stderr: "",
      pid: 1,
      output: [null, "", ""],
      signal: null,
      error: undefined,
    } as ReturnType<typeof spawnSync>)

    const images = extractImagesNative("/a.pdf", "/out")
    expect(images).toHaveLength(1)
    expect(images?.[0].mimeType).toBe("image/png")
  })

  it("throws on extract-images failure", () => {
    const bin = resolveNativeBinary()
    if (!bin) return

    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "pdfium missing",
      pid: 1,
      output: [null, "", "pdfium missing"],
      signal: null,
      error: undefined,
    } as ReturnType<typeof spawnSync>)

    expect(() => extractImagesNative("/a.pdf", "/out")).toThrow(/pdfium/)
  })

  it("startClipServerNative returns false without binary", () => {
    if (resolveNativeBinary()) {
      vi.mocked(spawnSync).mockReturnValue({ status: 0, pid: 99 } as ReturnType<typeof spawnSync>)
      expect(startClipServerNative(19827, "/proj")).toBe(true)
    } else {
      expect(startClipServerNative(19827, "/proj")).toBe(false)
    }
  })
})
