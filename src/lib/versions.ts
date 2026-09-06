// Page version history — local-first snapshots + block-level diff.
// v1 scope: snapshots live in localStorage (`openmanas_versions_v1`), capped
// per page so the keystroke-level editor can't blow the quota. Restore reuses
// `restorePageBlocks` (undo backbone) so server reconcile + historyRev come
// free. Server persistence (`page_versions` table) is a queued follow-up.
// Pure helpers (diffBlocks, stripHtml, summarizeDiff) are unit-tested in
// tests/versions.test.ts.

import type { Block, PageVersion } from '@/lib/types'

export const VERSIONS_KEY = 'openmanas_versions_v1'
/** Max snapshots kept per page (FIFO — oldest drops). */
export const MAX_VERSIONS_PER_PAGE = 20
/** Minimum gap between automatic snapshots of the same page. */
export const AUTO_CAPTURE_MIN_MS = 10 * 60 * 1000

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
    return (globalThis as unknown as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

export type VersionMap = Record<string, PageVersion[]>

export function loadVersions(): VersionMap {
  try {
    const raw = storage()?.getItem(VERSIONS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as VersionMap
    if (!parsed || typeof parsed !== 'object') return {}
    // Sanitize: keep only well-formed entries so a corrupt cache can't break boot.
    const out: VersionMap = {}
    for (const [pageId, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue
      const clean = list.filter((v) => v && typeof v.id === 'string' && Array.isArray((v as PageVersion).blocksSnapshot))
      if (clean.length) out[pageId] = clean.slice(-MAX_VERSIONS_PER_PAGE)
    }
    return out
  } catch {
    return {}
  }
}

export function saveVersions(map: VersionMap) {
  try {
    storage()?.setItem(VERSIONS_KEY, JSON.stringify(map))
  } catch { /* quota — caller trims and retries */ }
}

function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, properties: { ...(b.properties ?? {}) } }))
}

/** Build a snapshot version object (caller assigns id/createdBy/createdAt). */
export function buildVersion(
  pageId: string,
  blocks: Block[],
  version: number,
  meta: { id: string; createdBy: string; createdAt: string; message?: string },
): PageVersion {
  return {
    id: meta.id,
    pageId,
    version,
    blocksSnapshot: cloneBlocks([...blocks].sort((a, b) => a.position - b.position)),
    createdBy: meta.createdBy,
    createdAt: meta.createdAt,
    message: meta.message,
  }
}

/** Next version number for a page (monotonic even after trims). */
export function nextVersionNumber(existing: PageVersion[]): number {
  const max = existing.reduce((m, v) => Math.max(m, typeof v.version === 'number' ? v.version : 0), 0)
  return max + 1
}

/** Append a version, enforcing the per-page cap (drops oldest). */
export function appendVersion(existing: PageVersion[], v: PageVersion): PageVersion[] {
  return [...existing, v].slice(-MAX_VERSIONS_PER_PAGE)
}

// --- text preview ---

/** Strip HTML for one-line diff previews (ContentEditable stores HTML). */
export function stripHtml(html: string, max = 120): string {
  const text = String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function blockPreview(b: Pick<Block, 'type' | 'content'>): string {
  const text = stripHtml(b.content ?? '')
  if (text) return text
  return b.type === 'divider' ? '───' : `(${b.type})`
}

// --- diff ---

export type BlockChangeStatus = 'added' | 'removed' | 'changed' | 'moved' | 'unchanged'

export interface BlockChange {
  id: string
  type: string
  status: BlockChangeStatus
  oldPosition: number | null
  newPosition: number | null
  oldText: string
  newText: string
}

function signature(b: Block): string {
  return `${b.type}::${b.content ?? ''}::${JSON.stringify(b.properties ?? {})}`
}

/**
 * Block-level diff, old → new. Identity is the block id; content/type/
 * properties differences mark `changed`, pure position shifts mark `moved`
 * (a block can be both — `changed` wins, positions still reported).
 */
export function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockChange[] {
  const oldById = new Map(oldBlocks.map((b) => [b.id, b]))
  const newById = new Map(newBlocks.map((b) => [b.id, b]))
  const out: BlockChange[] = []
  for (const nb of newBlocks) {
    const ob = oldById.get(nb.id)
    if (!ob) {
      out.push({ id: nb.id, type: nb.type, status: 'added', oldPosition: null, newPosition: nb.position, oldText: '', newText: blockPreview(nb) })
      continue
    }
    const moved = ob.position !== nb.position
    if (signature(ob) !== signature(nb)) {
      out.push({ id: nb.id, type: nb.type, status: 'changed', oldPosition: ob.position, newPosition: nb.position, oldText: blockPreview(ob), newText: blockPreview(nb) })
    } else if (moved) {
      out.push({ id: nb.id, type: nb.type, status: 'moved', oldPosition: ob.position, newPosition: nb.position, oldText: blockPreview(ob), newText: blockPreview(nb) })
    } else {
      out.push({ id: nb.id, type: nb.type, status: 'unchanged', oldPosition: ob.position, newPosition: nb.position, oldText: blockPreview(ob), newText: blockPreview(nb) })
    }
  }
  for (const ob of oldBlocks) {
    if (!newById.has(ob.id)) {
      out.push({ id: ob.id, type: ob.type, status: 'removed', oldPosition: ob.position, newPosition: null, oldText: blockPreview(ob), newText: '' })
    }
  }
  return out
}

export interface DiffSummary {
  added: number
  removed: number
  changed: number
  moved: number
  unchanged: number
  total: number
}

export function summarizeDiff(changes: BlockChange[]): DiffSummary {
  const s: DiffSummary = { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0, total: changes.length }
  for (const c of changes) s[c.status] += 1
  return s
}

/** True when two snapshots hold identical block content (skip no-op captures). */
export function snapshotsEqual(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((x) => [x.id, x]))
  return a.every((x) => {
    const y = byId.get(x.id)
    return !!y && y.position === x.position && signature(x) === signature(y)
  })
}
