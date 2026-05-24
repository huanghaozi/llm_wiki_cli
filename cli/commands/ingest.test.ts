import { describe, it, expect, beforeEach, vi } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ingestCommand } from "./ingest.js"
import { createTempDir } from "../test-helpers/setup.js"
import * as configStore from "../lib/config-store.js"
import * as llmClient from "../lib/llm-client.js"
import * as vectorStore from "../lib/vector-store.js"
import { checkIngestCache, saveIngestCache } from "../lib/ingest-cache.js"

const FAKE_ANALYSIS = `## Key Entities
- Foo (entity)

## Key Concepts
- Bar concept

## Recommendations
Create entity page for Foo, concept page for Bar.`

function makeGeneration(opts: { sourceSummary?: string; review?: boolean } = {}): string {
  const blocks: string[] = []
  blocks.push(`---FILE: wiki/entities/foo.md---
---
type: entity
title: Foo
sources: ["foo.md"]
tags: [demo]
related: [bar]
---
# Foo
Foo is related to [[Bar]].
---END FILE---`)
  blocks.push(`---FILE: wiki/concepts/bar.md---
---
type: concept
title: Bar
sources: ["foo.md"]
tags: [demo]
related: [foo]
---
# Bar
Bar is connected to [[Foo]].
---END FILE---`)
  blocks.push(`---FILE: ${opts.sourceSummary ?? "wiki/sources/foo.md"}---
---
type: source
title: "Source: foo.md"
sources: ["foo.md"]
tags: [source]
related: [foo, bar]
---
# Source Summary
A summary of foo.md.
---END FILE---`)
  if (opts.review) {
    blocks.push(`---REVIEW: suggestion | Verify Foo definition---
The definition seems incomplete.
OPTIONS: Approve|Skip
PAGES: wiki/entities/foo.md
---END REVIEW---`)
  }
  return blocks.join("\n\n")
}

function stubStreamChat(analysis: string, generation: string) {
  let call = 0
  return vi.spyOn(llmClient, "streamChat").mockImplementation(
    async (_config, _messages, callbacks) => {
      call++
      const output = call === 1 ? analysis : generation
      for (const ch of output) callbacks.onToken(ch)
      callbacks.onDone()
    },
  )
}

function setupTestProject(): string {
  const root = createTempDir()
  mkdirSync(join(root, "raw", "sources"), { recursive: true })
  mkdirSync(join(root, "wiki"), { recursive: true })
  mkdirSync(join(root, ".llm-wiki"), { recursive: true })
  writeFileSync(join(root, "raw", "sources", "foo.md"), "# Foo source\n\nFoo content here.")
  writeFileSync(join(root, "wiki", "index.md"), "# Wiki Index\n")
  writeFileSync(join(root, "wiki", "log.md"), "# Wiki Log\n")
  writeFileSync(join(root, "schema.md"), "# Schema\n")
  writeFileSync(join(root, "purpose.md"), "# Purpose\n")
  return root
}

describe("ingestCommand", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o",
      maxContextSize: 128000,
    })
    vi.spyOn(vectorStore, "vectorUpsertChunks").mockResolvedValue(undefined)
  })

  it("parses FILE blocks and writes wiki pages", async () => {
    const root = setupTestProject()
    stubStreamChat(FAKE_ANALYSIS, makeGeneration())

    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    expect(existsSync(join(root, "wiki", "entities", "foo.md"))).toBe(true)
    expect(existsSync(join(root, "wiki", "concepts", "bar.md"))).toBe(true)
  })

  it("sanitizes outer-fenced LLM output", async () => {
    const root = setupTestProject()
    const fenced = "```yaml\n" + makeGeneration() + "\n```"
    stubStreamChat(FAKE_ANALYSIS, fenced)

    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    const fooPage = readFileSync(join(root, "wiki", "entities", "foo.md"), "utf-8")
    expect(fooPage.startsWith("---")).toBe(true)
    expect(fooPage).not.toContain("```yaml")
  })

  it("backs up and merges sources on re-ingest", async () => {
    const root = setupTestProject()
    // First ingest writes the initial page.
    stubStreamChat(FAKE_ANALYSIS, makeGeneration())
    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    // Modify the source so cache misses, then re-ingest with a different
    // generation result that lists only ["new-source.pdf"].
    writeFileSync(join(root, "raw", "sources", "foo.md"), "# Foo source v2\n\nUpdated.")
    const reGeneration = `---FILE: wiki/entities/foo.md---
---
type: entity
title: Foo
sources: ["new-source.pdf"]
tags: [demo]
related: []
---
# Foo
Updated foo.
---END FILE---`
    vi.restoreAllMocks()
    vi.spyOn(configStore, "loadConfig").mockReturnValue({
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4o",
      maxContextSize: 128000,
    })
    vi.spyOn(vectorStore, "vectorUpsertChunks").mockResolvedValue(undefined)
    stubStreamChat(FAKE_ANALYSIS, reGeneration)

    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    const foo = readFileSync(join(root, "wiki", "entities", "foo.md"), "utf-8")
    // Both old and new sources should be present (merge unions the lists).
    expect(foo).toContain("foo.md")
    expect(foo).toContain("new-source.pdf")
    // A backup snapshot was made.
    expect(existsSync(join(root, ".llm-wiki", "page-history"))).toBe(true)
  })

  it("respects cache on second identical ingest", async () => {
    const root = setupTestProject()
    stubStreamChat(FAKE_ANALYSIS, makeGeneration())
    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })
    // The cache should now have an entry for the source. Read the actual
    // file the source had at ingest time (handles any normalization the
    // OS / fs layer may have applied).
    const actualSourceContent = readFileSync(join(root, "raw", "sources", "foo.md"), "utf-8")
    const cached = checkIngestCache(root, "foo.md", actualSourceContent)
    expect(cached).not.toBeNull()
    expect(cached?.length).toBeGreaterThan(0)
  })

  it("rejects unsafe file paths emitted by the LLM", async () => {
    const root = setupTestProject()
    const evil = `---FILE: ../etc/passwd---
should not be written
---END FILE---
---FILE: wiki/CON.md---
windows reserved
---END FILE---
---FILE: wiki/entities/safe.md---
---
type: entity
title: Safe
---
# Safe
---END FILE---`
    stubStreamChat(FAKE_ANALYSIS, evil)

    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    expect(existsSync(join(root, "wiki", "entities", "safe.md"))).toBe(true)
    expect(existsSync(join(root, "wiki", "CON.md"))).toBe(false)
  })

  it("pushes REVIEW blocks into the review queue", async () => {
    const root = setupTestProject()
    stubStreamChat(FAKE_ANALYSIS, makeGeneration({ review: true }))

    await ingestCommand({
      files: [join(root, "raw", "sources", "foo.md")],
      projectPath: root,
    })

    const reviewFile = join(root, ".llm-wiki", "review.json")
    expect(existsSync(reviewFile)).toBe(true)
    const items = JSON.parse(readFileSync(reviewFile, "utf-8"))
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((i: { type: string }) => i.type === "suggestion")).toBe(true)
  })
})
