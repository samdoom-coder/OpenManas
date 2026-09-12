import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore, flushPersist } = await import('../src/stores/appStore')
const sync = await import('../src/lib/sync')

beforeEach(() => {
  mem.clear()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('bookmark reload survival', () => {
  it('persists the bookmark URL to localStorage synchronously on updateBlock', () => {
    const s = useAppStore.getState()
    const page = s.createPage('BookmarkPersist')
    const b = useAppStore.getState().addBlock(page.id, 'bookmark', '')
    // Discrete save, as BookmarkBlockView does on Add/Done — must be in
    // localStorage immediately, not after the 400ms autosave debounce.
    useAppStore.getState().updateBlock(b.id, { content: 'https://example.com' })
    const raw = mem.get('openmanas_state_v1')
    expect(raw).toBeTruthy()
    const saved = (JSON.parse(raw!) as any).blocks.find((x: any) => x.id === b.id)
    expect(saved?.content).toBe('https://example.com')
  })

  it('flushPersist writes pending edits without waiting for the debounce', () => {
    vi.useFakeTimers()
    const s = useAppStore.getState()
    const page = s.createPage('FlushPage')
    const b = useAppStore.getState().addBlock(page.id, 'paragraph', 'v1')
    // Simulate a debounced-only change: rewrite storage with stale content,
    // then mutate state directly and flush.
    useAppStore.setState((st: any) => ({
      blocks: st.blocks.map((x: any) => (x.id === b.id ? { ...x, content: 'v2' } : x)),
    }))
    flushPersist()
    const saved = (JSON.parse(mem.get('openmanas_state_v1')!) as any).blocks.find((x: any) => x.id === b.id)
    expect(saved?.content).toBe('v2')
  })

  it('flushPushes fires debounced block pushes immediately', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        calls.push(`${init?.method || 'GET'} ${url}`)
        return { ok: true, json: async () => ({}) }
      }),
    )
    // queue a debounced push directly, then flush instead of waiting 1000ms
    sync.queuePush('test:flush', () => sync.patchBlock('some-id', { content: 'x' } as any))
    sync.flushPushes()
    await new Promise((r) => setTimeout(r, 20))
    expect(calls.some((c) => c === 'PATCH /api/blocks/some-id')).toBe(true)
  })
})
