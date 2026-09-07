import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore } = await import('../src/stores/appStore')
const api = await import('../src/lib/api')
const sync = await import('../src/lib/sync')

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
  useAppStore.setState({
    selectedPageId: null, selectedDatabaseId: null,
    token: null, backendMode: 'local', syncStatus: 'local',
    versions: {},
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('page versions sync client', () => {
  it('fetches, posts, and deletes by page id', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      if ((init?.method || 'GET') === 'GET') return jsonOk([])
      return jsonOk({ ok: true })
    }))
    await sync.fetchPageVersions('p1')
    await sync.postPageVersion('p1', { id: 'v1', blocksSnapshot: [], message: 'hi' })
    await sync.deletePageVersionRemote('p1', 'v1')
    expect(calls).toContain('GET /api/pages/p1/versions')
    expect(calls).toContain('POST /api/pages/p1/versions')
    expect(calls).toContain('DELETE /api/pages/p1/versions/v1')
  })

  it('fetchVersionsForPages merges per-page lists best-effort', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/pages/p1/versions')) {
        return jsonOk([{ id: 'v1', pageId: 'p1', version: 1, blocksSnapshot: [], createdBy: 'u', createdAt: 't' }])
      }
      if (String(url).includes('/api/pages/p2/versions')) {
        return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) } as any
      }
      throw new Error(`unexpected ${url}`)
    }))
    const out = await sync.fetchVersionsForPages(['p1', 'p2'])
    expect(Object.keys(out)).toContain('p1')
    expect(out.p1).toHaveLength(1)
  })
})

describe('store versions', () => {
  it('captureVersion stays local-only when logged out', async () => {
    const fetchMock = vi.fn(async () => jsonOk({}))
    vi.stubGlobal('fetch', fetchMock)
    const page = useAppStore.getState().createPage('Local Versions')
    useAppStore.getState().addBlock(page.id, 'paragraph', 'hello')
    // addBlock may already have taken an auto snapshot — don't assume numbering.
    const before = useAppStore.getState().versions[page.id]?.length ?? 0
    const v = useAppStore.getState().captureVersion(page.id, 'first')
    expect(v?.id).toBeTruthy()
    expect(useAppStore.getState().versions[page.id]).toHaveLength(before + 1)
    await new Promise((r) => setTimeout(r, 60))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('captureVersion POSTs when logged in', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    const page = useAppStore.getState().createPage('Synced Versions')
    await new Promise((r) => setTimeout(r, 60))
    calls.length = 0
    const v = useAppStore.getState().captureVersion(page.id, 'manual')
    expect(v?.message).toBe('manual')
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toContain(`POST /api/pages/${page.id}/versions`)
  })

  it('refreshVersions pulls remote into the store when logged in', async () => {
    const remote = [{ id: 'vr1', pageId: 'p9', version: 1, blocksSnapshot: [], message: 'srv', createdBy: 'u', createdAt: 't' }]
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(remote)))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    await useAppStore.getState().refreshVersions('p9')
    expect(useAppStore.getState().versions['p9']).toHaveLength(1)
    expect(useAppStore.getState().versions['p9'][0].id).toBe('vr1')
  })

  it('refreshVersions is a no-op when logged out', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]))
    vi.stubGlobal('fetch', fetchMock)
    await useAppStore.getState().refreshVersions('p1')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
