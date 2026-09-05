// Per-page collaboration hook: owns a CollabSession, pushes local edits
// (debounced, dirty-aware) and merges remote Y-state into the store.
// Connects only when a sync URL is configured (VITE_COLLAB_URL or
// Settings → Collaboration → wsUrl); otherwise a no-op (status 'off').

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { CollabSession, resolveCollabUrl, useCollabStore } from '@/lib/collabClient'
import { toSyncBlock, syncFingerprint, mergeBlocks, type SyncBlock } from '@/lib/collabSync'
import type { Block } from '@/lib/types'

const PUSH_DEBOUNCE_MS = 800

function fingerprintAll(blocks: Block[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const b of blocks) {
    const s = toSyncBlock(b)
    m.set(s.id, syncFingerprint(s))
  }
  return m
}

export function useCollabPage(pageId: string, blocks: Block[]) {
  const user = useAppStore((s) => s.user)
  const settings = useAppStore((s) => s.settings)
  const restorePageBlocks = useAppStore((s) => s.restorePageBlocks)

  const sessionRef = useRef<CollabSession | null>(null)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  // Fingerprints of the last state known to be in sync (pushed or applied).
  const baseRef = useRef<Map<string, string> | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const url = resolveCollabUrl(settings?.collaboration?.wsUrl ?? '')
  const presence = settings?.collaboration?.presence ?? false
  const offline = settings?.collaboration?.offlineQueue ?? true

  // Session lifecycle
  useEffect(() => {
    if (!url) {
      useCollabStore.setState({ status: 'off', peers: [], pageId: null })
      return
    }
    const session = new CollabSession({
      url,
      pageId,
      userId: user.id,
      userName: user.name || 'Teammate',
      presence,
      offline,
      onRemote: (remote: SyncBlock[]) => handleRemote(remote),
    })
    sessionRef.current = session
    baseRef.current = null
    void session.connect().catch((e) => console.warn('[collab] connect failed', e))
    return () => {
      session.disconnect()
      if (sessionRef.current === session) sessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pageId, user.id, presence, offline])

  const computeDirty = (current: Block[]): Set<string> => {
    const base = baseRef.current
    const dirty = new Set<string>()
    if (!base) {
      // No baseline yet: treat everything as dirty so the first local edit
      // seeds the doc — but do NOT push until something actually changes
      // (handled by comparing against lastPushed below).
      return dirty
    }
    const cur = fingerprintAll(current)
    for (const [id, fp] of cur) {
      if (base.get(id) !== fp) dirty.add(id)
    }
    return dirty
  }

  const handleRemote = (remote: SyncBlock[]) => {
    const session = sessionRef.current
    const current = blocksRef.current
    const dirty = computeDirty(current)
    const known = new Set(baseRef.current?.keys() ?? [])
    const merged = mergeBlocks(current, remote, pageId, dirty, known)
    if (JSON.stringify(merged.map((b) => toSyncBlock(b))) !== JSON.stringify(current.map((b) => toSyncBlock(b)))) {
      restorePageBlocks(pageId, merged)
    }
    baseRef.current = fingerprintAll(merged)
    session?.markSynced(merged)
  }

  // Push local edits (debounced)
  useEffect(() => {
    const session = sessionRef.current
    if (!session || !url) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      const s = sessionRef.current
      if (!s) return
      const current = blocksRef.current
      const base = baseRef.current
      if (!base) {
        // First change since connect: seed baseline WITHOUT pushing, so we
        // never clobber a live doc on join. The next edit pushes the delta.
        baseRef.current = fingerprintAll(current)
        return
      }
      const cur = fingerprintAll(current)
      let changed = cur.size !== base.size
      if (!changed) {
        for (const [id, fp] of cur) {
          if (base.get(id) !== fp || !base.has(id)) { changed = true; break }
        }
        if (!changed) for (const id of base.keys()) if (!cur.has(id)) { changed = true; break }
      }
      if (!changed) return
      s.pushLocal(current)
      baseRef.current = cur
    }, PUSH_DEBOUNCE_MS)
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [blocks, url, pageId])

  return {
    setCursor: (blockId: string | null) => sessionRef.current?.setCursor(blockId),
  }
}
