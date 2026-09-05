// Pure CRDT-sync helpers for Yjs collaboration (no yjs import — unit-testable).
// Wire format per block is a plain object; the Y layer (collabClient.ts)
// stores one Y.Map per block inside a shared Y.Array named 'blocks'.

import type { Block } from './types'

export interface SyncBlock {
  id: string
  type: string
  content: string
  properties: Record<string, unknown>
  position: number
  parentId: string | null
}

export function toSyncBlock(b: Block): SyncBlock {
  return {
    id: b.id,
    type: b.type,
    content: b.content ?? '',
    properties: (b.properties ?? {}) as Record<string, unknown>,
    position: b.position ?? 0,
    parentId: b.parentId ?? null,
  }
}

export function syncFingerprint(b: SyncBlock): string {
  return JSON.stringify([b.type, b.content, b.properties, b.position, b.parentId])
}

/** Yjs room name for a page. Stable across clients + server. */
export function docNameForPage(pageId: string): string {
  return `openmanas-page-${pageId}`
}

const PALETTE = [
  '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

/** Deterministic avatar/cursor color per user id. */
export function userColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (Math.imul(h, 31) + userId.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

/**
 * Merge remote Y-state into local blocks.
 * - Blocks with local unsaved edits (dirtyIds) keep the local version and
 *   will overwrite on the next push — last-writer-wins per block.
 * - `knownIds` are block ids from the last synced state: a local-only block
 *   in knownIds that vanished remotely was peer-deleted → drop it (unless
 *   dirty, in which case the local edit wins and resurrects it on push).
 *   Local-only blocks NOT in knownIds are new/unsynced → always preserved.
 * Positions are renormalized 0..n in remote order, local-only appended.
 */
export function mergeBlocks(
  local: Block[],
  remote: SyncBlock[],
  pageId: string,
  dirtyIds: Set<string>,
  knownIds: Set<string> = new Set(),
  now = new Date().toISOString(),
): Block[] {
  const localById = new Map(local.map((b) => [b.id, b]))
  const out: Block[] = []
  for (const r of [...remote].sort((a, b) => a.position - b.position)) {
    const l = localById.get(r.id)
    if (l && dirtyIds.has(r.id)) {
      out.push(l)
    } else if (l) {
      out.push({
        ...l,
        type: r.type as Block['type'],
        content: r.content,
        properties: r.properties,
        parentId: r.parentId,
        updatedAt: now,
      })
    } else {
      out.push({
        id: r.id,
        pageId,
        parentId: r.parentId,
        type: r.type as Block['type'],
        content: r.content,
        properties: r.properties,
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
    }
    localById.delete(r.id)
  }
  // Local-only blocks: new ones survive; synced-then-peer-deleted ones drop
  // unless locally dirty (the edit wins and resurrects them on next push).
  for (const l of [...localById.values()].sort((a, b) => a.position - b.position)) {
    if (knownIds.has(l.id) && !dirtyIds.has(l.id)) continue
    out.push(l)
  }
  return out.map((b, i) => ({ ...b, position: i }))
}
