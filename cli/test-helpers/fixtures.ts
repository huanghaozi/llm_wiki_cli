import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export function createMinimalWikiProject(root: string) {
  mkdirSync(join(root, "wiki", "entities"), { recursive: true })
  mkdirSync(join(root, "wiki", "concepts"), { recursive: true })
  mkdirSync(join(root, "raw", "sources"), { recursive: true })
  mkdirSync(join(root, ".llm-wiki"), { recursive: true })

  writeFileSync(
    join(root, "wiki", "index.md"),
    "# Wiki Index\n\n- [[Alpha Entity]]\n",
  )
  writeFileSync(
    join(root, "wiki", "log.md"),
    "# Wiki Log\n",
  )
  writeFileSync(
    join(root, "purpose.md"),
    "A demo knowledge base for CLI testing.\n",
  )
  writeFileSync(
    join(root, "wiki", "entities", "alpha-entity.md"),
    [
      "---",
      "type: entity",
      "title: Alpha Entity",
      "tags: [demo]",
      "---",
      "",
      "# Alpha Entity",
      "",
      "Alpha connects to [[beta-concept]].",
      "",
    ].join("\n"),
  )
  writeFileSync(
    join(root, "wiki", "concepts", "beta-concept.md"),
    [
      "---",
      "type: concept",
      "title: Beta Concept",
      "tags: [demo]",
      "---",
      "",
      "# Beta Concept",
      "",
      "Beta relates to Alpha Entity.",
      "",
    ].join("\n"),
  )
  writeFileSync(
    join(root, "wiki", "orphan-page.md"),
    [
      "---",
      "type: entity",
      "title: Orphan Page",
      "---",
      "",
      "# Orphan Page",
      "",
      "No links here.",
      "",
    ].join("\n"),
  )
  writeFileSync(
    join(root, "raw", "sources", "notes.md"),
    "# Source notes\n\nSome raw material.\n",
  )
}
