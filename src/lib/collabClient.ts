// Yjs session client — realtime block sync + presence awareness.
// Heavy deps (yjs/y-websocket/y-indexeddb) load via dynamic import so the
// main bundle stays lean; sessions only connect when a sync URL is configured
// (VITE_COLLAB_URL or Settings → Collaboration → wsUrl).
// Pure merge logic lives in collabSync.ts (unit-tested).

import * as Y from 'yjs'
import { create } from 'zustand'
import type { Block } from './types'
import { toSyncBlock, syncFingerprint, userColor, type SyncBlock } from './collabSync'

export interface CollabPeer {
  clientId: number
  id: string
  name: string
  color: string
  blockId: string | null
}

export type CollabStatus = 'off' | 'connecting' | 'connected' | 'disconnected'

interface CollabState {
  status: CollabStatus
  peers: CollabPeer[]
  pageId: string | null
}

export const useCollabStore = create<CollabState>(() => ({ status: 'off', peers: [], pageId: null }))

export function resolveCollabUrl(settingsWs: string): string {
  try {
    const env = (import.meta as any)?.env?.VITE_COLLAB_URL as string | undefined
    if (env && env.trim()) return env.trim()
  } catch { /* non-vite (tests) */ }
  return (settingsWs || '').trim()
}

export function collabToken(): string {
  try {
    return localStorage.getItem('nexus_token') || 'demo-token'
  } catch {
    return 'demo-token'
  }
}

interface SessionOpts {
  url: string
  pageId: string
  userId: string
  userName: string
  presence: boolean
  offline: boolean
  onRemote: (blocks: SyncBlock[]) => void
}

function readAll(yarray: Y.Array<Y.Map<unknown>>): SyncBlock[] {
  return yarray.toArray().map((m) => ({
    id: String(m.get('id') ?? ''),
    type: String(m.get('type') ?? 'paragraph'),
    content: String(m.get('content') ?? ''),
    properties: (m.get('properties') as Record<string, unknown>) ?? {},
    position: Number(m.get('position') ?? 0),
    parentId: (m.get('parentId') as string | null) ?? null,
  })).filter((b) => b.id)
}

export class CollabSession {
  private doc: Y.Doc | null = null
  private yarray: Y.Array<Y.Map<unknown>> | null = null
  private provider: any = null
  private persistence: any = null
  private lastSent = ''
  private cursorBlock: string | null = '__init__'
  private awarenessHandler: (() => void) | null = null
  destroyed = false

  constructor(private opts: SessionOpts) {}

  get pageId() {
    return this.opts.pageId
  }

  async connect() {
    const { url, pageId, userId, userName, presence, offline, onRemote } = this.opts
    const color = userColor(userId)
    const doc = new Y.Doc()
    this.doc = doc
    const yarray = doc.getArray<Y.Map<unknown>>('blocks')
    this.yarray = yarray

    useCollabStore.setState({ status: 'connecting', peers: [], pageId })

    if (offline) {
      try {
        const { IndexeddbPersistence } = await import('y-indexeddb')
        this.persistence = new IndexeddbPersistence(`nexus-page-${pageId}`, doc)
      } catch (e) {
        console.warn('[collab] IndexedDB persistence unavailable', e)
      }
    }

    const { WebsocketProvider } = await import('y-websocket')
    if (this.destroyed) return
    const provider = new WebsocketProvider(url, `nexus-page-${pageId}`, doc, {
      params: { token: collabToken() },
      connect: true,
    })
    this.provider = provider
    provider.on('status', (e: { status: string }) => {
      if (this.destroyed) return
      const s = e.status === 'connected' ? 'connected' : e.status === 'connecting' ? 'connecting' : 'disconnected'
      useCollabStore.setState({ status: s as CollabStatus })
    })

    if (presence) {
      provider.awareness.setLocalStateField('user', { id: userId, name: userName, color, blockId: null })
      const emit = () => {
        if (this.destroyed) return
        const peers: CollabPeer[] = []
        provider.awareness.getStates().forEach((st: any, clientId: number) => {
          if (clientId === provider.awareness.clientID || !st?.user) return
          peers.push({
            clientId,
            id: String(st.user.id ?? clientId),
            name: String(st.user.name ?? 'Teammate'),
            color: String(st.user.color ?? '#8b5cf6'),
            blockId: (st.user.blockId as string | null) ?? null,
          })
        })
        useCollabStore.setState({ peers })
      }
      this.awarenessHandler = emit
      provider.awareness.on('change', emit)
      emit()
    }

    yarray.observeDeep((_events, tr: any) => {
      if (this.destroyed || tr?.origin === 'local') return
      onRemote(readAll(yarray))
    })
  }

  /** Push local blocks to the shared doc (full-replace, debounced by caller). */
  pushLocal(blocks: Block[]) {
    if (!this.doc || !this.yarray || this.destroyed) return
    const sync = [...blocks].sort((a, b) => a.position - b.position).map(toSyncBlock)
    const fp = JSON.stringify(sync.map(syncFingerprint))
    if (fp === this.lastSent) return
    this.lastSent = fp
    this.doc.transact(() => {
      this.yarray!.delete(0, this.yarray!.length)
      this.yarray!.push(sync.map((s) => {
        const m = new Y.Map<unknown>()
        m.set('id', s.id)
        m.set('type', s.type)
        m.set('content', s.content)
        m.set('properties', s.properties)
        m.set('position', s.position)
        m.set('parentId', s.parentId)
        return m
      }))
    }, 'local')
  }

  /** Seed lastSent after applying a remote state so we don't echo it back. */
  markSynced(blocks: Block[]) {
    const sync = [...blocks].sort((a, b) => a.position - b.position).map(toSyncBlock)
    this.lastSent = JSON.stringify(sync.map(syncFingerprint))
  }

  setCursor(blockId: string | null) {
    if (!this.provider || blockId === this.cursorBlock) return
    this.cursorBlock = blockId
    try {
      const cur = this.provider.awareness.getLocalState()?.user ?? {}
      this.provider.awareness.setLocalStateField('user', { ...cur, blockId })
    } catch { /* not connected yet */ }
  }

  disconnect() {
    this.destroyed = true
    try {
      if (this.provider) {
        this.provider.awareness?.setLocalState(null)
        this.provider.disconnect()
        this.provider.destroy()
      }
      this.persistence?.destroy()
      this.doc?.destroy()
    } catch { /* noop */ }
    this.provider = null
    this.doc = null
    this.yarray = null
    useCollabStore.setState({ status: 'off', peers: [], pageId: null })
  }
}
