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

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  mem.clear()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('pullFromServer', () => {
  it('replaces local state with server state', async () => {
    const page = { id: UID, workspaceId: 'w9', parentId: null, title: 'Server Page', icon: '📄', isFavorite: false, isArchived: false, isTrashed: false, isShared: false, createdBy: 'u', updatedBy: 'u', createdAt: 't', updatedAt: 't' }
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/workspaces')) return jsonOk([{ id: 'w9', name: 'WS', ownerId: 'u', createdAt: 't', updatedAt: 't' }])
      if (String(url).includes('/api/pages?')) return jsonOk([page])
      if (String(url).includes('/api/databases?')) return jsonOk([])
      if (String(url).includes('/blocks')) return jsonOk([])
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    expect(await useAppStore.getState().pullFromServer()).toBe('up-to-date')
    expect(useAppStore.getState().pages.some((p) => p.id === UID)).toBe(true)
    expect(useAppStore.getState().workspace.id).toBe('w9')
    expect(useAppStore.getState().syncStatus).toBe('synced')
  })

  it('uploads local state when the backend is empty', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      if (String(url).endsWith('/api/workspaces') && !init?.method) return jsonOk([])
      if (String(url).endsWith('/api/workspaces')) return jsonOk({ id: 'w-new', name: 'W', ownerId: 'u', createdAt: 't', updatedAt: 't' })
      return jsonOk({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    // seed a page + block locally first
    const before = useAppStore.getState().pages.length
    expect(before).toBeGreaterThan(0)
    expect(await useAppStore.getState().pullFromServer()).toBe('uploaded')
    expect(calls).toContain('POST /api/workspaces')
    expect(calls.some((c) => c === 'POST /api/pages')).toBe(true)
  })

  it('is a no-op without a session', async () => {
    expect(await useAppStore.getState().pullFromServer()).toBe('local')
  })
})

describe('push-through', () => {
  it('POSTs new pages to the API when logged in', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    useAppStore.getState().createPage('Pushed Page')
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toContain('POST /api/pages')
  })

  it('stays local-only when logged out', async () => {
    const fetchMock = vi.fn(async () => jsonOk({}))
    vi.stubGlobal('fetch', fetchMock)
    useAppStore.setState({ token: null, backendMode: 'local' })
    useAppStore.getState().createPage('Local Only')
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
