import { describe, it, expect } from "vitest"
import {
  normalizePath,
  joinPath,
  getFileName,
  getFileStem,
  getRelativePath,
  isAbsolutePath,
} from "./path-utils.js"

describe("normalizePath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizePath("C:\\Users\\me\\a")).toBe("C:/Users/me/a")
  })

  it("leaves forward slashes unchanged", () => {
    expect(normalizePath("/usr/local/bin")).toBe("/usr/local/bin")
  })

  it("handles empty strings", () => {
    expect(normalizePath("")).toBe("")
  })
})

describe("joinPath", () => {
  it("joins segments with forward slashes", () => {
    expect(joinPath("a", "b", "c")).toBe("a/b/c")
  })

  it("normalizes backslashes in inputs", () => {
    expect(joinPath("a\\b", "c\\d")).toBe("a/b/c/d")
  })

  it("collapses duplicate slashes", () => {
    expect(joinPath("a/", "/b/", "/c")).toBe("a/b/c")
  })

  it("collapses many duplicate slashes", () => {
    expect(joinPath("a///", "//b")).toBe("a/b")
  })
})

describe("getFileName", () => {
  it("returns the trailing segment", () => {
    expect(getFileName("/foo/bar/baz.md")).toBe("baz.md")
  })

  it("works with Windows-style paths", () => {
    expect(getFileName("C:\\Users\\me\\a.txt")).toBe("a.txt")
  })

  it("returns the string itself when no separator present", () => {
    expect(getFileName("plain.md")).toBe("plain.md")
  })

  it("returns the empty string for trailing-slash paths", () => {
    expect(getFileName("foo/bar/")).toBe("")
  })
})

describe("getFileStem", () => {
  it("strips the extension", () => {
    expect(getFileStem("/foo/bar/baz.md")).toBe("baz")
  })

  it("only strips the final extension", () => {
    expect(getFileStem("foo.tar.gz")).toBe("foo.tar")
  })

  it("returns the whole name when there is no dot", () => {
    expect(getFileStem("README")).toBe("README")
  })

  it("treats dotfiles as having no extension", () => {
    expect(getFileStem(".gitignore")).toBe(".gitignore")
  })
})

describe("getRelativePath", () => {
  it("strips the base prefix", () => {
    expect(getRelativePath("/proj/wiki/page.md", "/proj")).toBe("wiki/page.md")
  })

  it("handles trailing slash in base", () => {
    expect(getRelativePath("/proj/wiki/page.md", "/proj/")).toBe("wiki/page.md")
  })

  it("returns the full path when it is not under base", () => {
    expect(getRelativePath("/other/path", "/proj")).toBe("/other/path")
  })

  it("normalizes backslashes", () => {
    expect(getRelativePath("C:\\proj\\wiki\\a.md", "C:\\proj")).toBe("wiki/a.md")
  })
})

describe("isAbsolutePath", () => {
  it("recognizes POSIX absolute paths", () => {
    expect(isAbsolutePath("/usr/bin")).toBe(true)
  })

  it("recognizes Windows drive-letter paths", () => {
    expect(isAbsolutePath("C:\\Users")).toBe(true)
    expect(isAbsolutePath("c:/Users")).toBe(true)
  })

  it("recognizes Windows UNC paths", () => {
    expect(isAbsolutePath("\\\\server\\share")).toBe(true)
    expect(isAbsolutePath("//server/share")).toBe(true)
  })

  it("rejects relative paths", () => {
    expect(isAbsolutePath("a/b/c")).toBe(false)
    expect(isAbsolutePath("./a")).toBe(false)
    expect(isAbsolutePath("../a")).toBe(false)
    expect(isAbsolutePath("")).toBe(false)
  })

  it("rejects drive letters without trailing separator", () => {
    expect(isAbsolutePath("C:")).toBe(false)
  })
})
