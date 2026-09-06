// File ↔ block references — shared by FileManager (use-in-page) and
// BlockEditor (pick-from-workspace + record uploads). Pure + tested in
// tests/files.test.ts.
import type { BlockType, Page } from '@/lib/types'

/** Block type that renders a given mime (pdf/office → generic file block). */
export function blockTypeForMime(mime: string): BlockType {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * Match a file input accept attribute ("*", star-slash-star, "image/*",
 * "audio/*", ".pdf", "image/png", comma lists) against mime + filename.
 */
export function acceptMatches(accept: string | undefined, mime: string, filename: string): boolean {
  const a = (accept ?? '*/*').trim()
  if (!a || a === '*' || a === '*/*') return true
  const m = (mime || '').toLowerCase()
  const name = (filename || '').toLowerCase()
  return a.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((token) => {
    if (!token || token === '*' || token === '*/*') return true
    if (token.endsWith('/*')) return m.startsWith(token.slice(0, -1))
    if (token.startsWith('.')) return name.endsWith(token)
    return m === token
  })
}

/**
 * Resolve the destination page for "attach file to page".
 * Explicit choice wins, then the currently open page, then the most
 * recently updated non-trashed page. Null = nowhere to attach.
 */
export function resolveAttachTarget(
  pages: Page[],
  selectedPageId: string | null,
  overridePageId?: string | null,
): Page | null {
  const usable = pages.filter((p) => !p.isTrashed)
  if (overridePageId) return usable.find((p) => p.id === overridePageId) ?? null
  if (selectedPageId) {
    const current = usable.find((p) => p.id === selectedPageId)
    if (current) return current
  }
  return [...usable].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0] ?? null
}
