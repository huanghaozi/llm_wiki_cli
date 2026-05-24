/**
 * Filename generation for user-initiated wiki writes (`/save` in chat,
 * deep-research saves).
 *
 * Slug rules:
 *   - Unicode-aware: keeps letters & digits across all scripts
 *     (Latin, CJK, Cyrillic, Arabic …) plus ASCII hyphens.
 *   - NFKC-normalized so full-width characters don't drift from
 *     half-width equivalents.
 *   - Whitespace → hyphen, collapsed runs of hyphens.
 *   - Truncated to 50 characters.
 *   - Falls back to `"query"` when nothing usable remains.
 *
 * The previous ASCII-only slugify collapsed every CJK title to an
 * empty slug → same-day saves overwrote each other. Filename shape
 * is `{slug}-{YYYY-MM-DD}-{HHMMSS}.md` so even identical slugs from
 * different conversations stay distinct.
 */

export function makeQuerySlug(title: string): string {
  const slug = title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 50)
  return slug.length > 0 ? slug : "query"
}

export function makeQueryFileName(
  title: string,
  now: Date = new Date(),
): { slug: string; fileName: string; date: string; time: string } {
  const slug = makeQuerySlug(title)
  const iso = now.toISOString()
  const date = iso.slice(0, 10)
  const time = iso.slice(11, 19).replace(/:/g, "")
  return {
    slug,
    date,
    time,
    fileName: `${slug}-${date}-${time}.md`,
  }
}
