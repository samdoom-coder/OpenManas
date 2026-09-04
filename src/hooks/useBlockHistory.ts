import { useCallback, useEffect, useRef, useState } from 'react'
import type { Block } from '@/lib/types'
import { useAppStore } from '@/stores/appStore'

function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map(b => ({ ...b, properties: { ...(b.properties || {}) } }))
}

function sorted(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.position - b.position)
}

function structureKey(blocks: Block[]): string {
  return sorted(blocks).map(b => `${b.id}:${b.type}:${b.position}`).join('|')
}

function contentKey(blocks: Block[]): string {
  return sorted(blocks)
    .map(b => `${b.id}:${b.type}:${b.position}:${b.content}:${JSON.stringify(b.properties ?? {})}`)
    .join('|')
}

const MAX_HISTORY = 50
const CONTENT_DEBOUNCE_MS = 1200

/**
 * Per-page undo/redo for blocks.
 * - Structural changes (add/delete/move/duplicate/type/reorder) push immediately.
 * - Content typing is debounced so Ctrl+Z doesn't step through every keystroke.
 * - History is in-memory per page (cleared on page switch).
 */
export function useBlockHistory(pageId: string, pageBlocks: Block[]) {
  const past = useRef<Block[][]>([])
  const future = useRef<Block[][]>([])
  // last blocks we have reconciled (what's currently displayed)
  const prev = useRef<{ content: string; structure: string; snapshot: Block[] } | null>(null)
  // snapshot at the start of the current typing burst (undo target)
  const burstBase = useRef<Block[] | null>(null)
  const burstTimer = useRef<any>(null)
  const lastPushAt = useRef(0)
  const applying = useRef(false)
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick(t => t + 1), [])

  const pushSnapshot = useCallback((snapshot: Block[]) => {
    past.current.push(cloneBlocks(snapshot))
    if (past.current.length > MAX_HISTORY) past.current.shift()
    future.current = []
    lastPushAt.current = Date.now()
    rerender()
  }, [rerender])

  // reset on page switch
  useEffect(() => {
    past.current = []
    future.current = []
    prev.current = {
      content: contentKey(pageBlocks),
      structure: structureKey(pageBlocks),
      snapshot: cloneBlocks(sorted(pageBlocks)),
    }
    burstBase.current = null
    lastPushAt.current = 0
    if (burstTimer.current) clearTimeout(burstTimer.current)
    rerender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // reconcile every pageBlocks change
  useEffect(() => {
    const curContent = contentKey(pageBlocks)
    const curStructure = structureKey(pageBlocks)
    const curSnap = cloneBlocks(sorted(pageBlocks))

    if (!prev.current) {
      prev.current = { content: curContent, structure: curStructure, snapshot: curSnap }
      return
    }
    if (curContent === prev.current.content) return

    // our own undo/redo just applied — resync without pushing
    if (applying.current) {
      applying.current = false
      prev.current = { content: curContent, structure: curStructure, snapshot: curSnap }
      burstBase.current = null
      if (burstTimer.current) clearTimeout(burstTimer.current)
      rerender()
      return
    }

    const structural = curStructure !== prev.current.structure

    if (structural) {
      // flush any pending typing burst first so we don't lose it
      if (burstBase.current) {
        pushSnapshot(burstBase.current)
        burstBase.current = null
        if (burstTimer.current) clearTimeout(burstTimer.current)
      }
      // undo should return to the state before this structural change
      pushSnapshot(prev.current.snapshot)
    } else {
      // content-only typing: group into bursts
      if (!burstBase.current) {
        burstBase.current = cloneBlocks(prev.current.snapshot)
        burstTimer.current = setTimeout(() => {
          // burst ended — commit it as one undo step
          if (burstBase.current) {
            pushSnapshot(burstBase.current)
            burstBase.current = null
          }
          burstTimer.current = null
        }, CONTENT_DEBOUNCE_MS)
      }
      // if user keeps typing, the timer keeps the original burstBase —
      // undo jumps to before the burst, not through each keystroke.
    }

    prev.current = { content: curContent, structure: curStructure, snapshot: curSnap }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageBlocks])

  const currentPageBlocks = useCallback(() => {
    return sorted(useAppStore.getState().blocks.filter(b => b.pageId === pageId))
  }, [pageId])

  const undo = useCallback(() => {
    // flush pending burst so undo includes in-progress typing
    if (burstBase.current) {
      pushSnapshot(burstBase.current)
      burstBase.current = null
      if (burstTimer.current) clearTimeout(burstTimer.current)
    }
    const prevSnap = past.current.pop()
    if (!prevSnap) return false
    future.current.push(cloneBlocks(currentPageBlocks()))
    applying.current = true
    useAppStore.getState().restorePageBlocks(pageId, prevSnap)
    prev.current = {
      content: contentKey(prevSnap),
      structure: structureKey(prevSnap),
      snapshot: cloneBlocks(sorted(prevSnap)),
    }
    rerender()
    return true
  }, [pageId, currentPageBlocks, pushSnapshot, rerender])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return false
    past.current.push(cloneBlocks(currentPageBlocks()))
    applying.current = true
    useAppStore.getState().restorePageBlocks(pageId, next)
    prev.current = {
      content: contentKey(next),
      structure: structureKey(next),
      snapshot: cloneBlocks(sorted(next)),
    }
    rerender()
    return true
  }, [pageId, currentPageBlocks, rerender])

  // keyboard shortcuts — skip native inputs so their own undo still works.
  // Only hijack Ctrl+Z/Y when we actually have history; otherwise let the
  // browser's native contentEditable undo run instead of swallowing it.
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select')) return
      if (key === 'z' && !e.shiftKey) {
        if (past.current.length === 0) return
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (future.current.length === 0) return
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [undo, redo])

  // A pending typing burst (not yet flushed to `past`) is still undoable —
  // undo() flushes it first — so report it to keep the toolbar in sync.
  return { canUndo: past.current.length > 0 || burstBase.current !== null, canRedo: future.current.length > 0, undo, redo }
}
