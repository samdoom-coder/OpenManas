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

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  mem.clear()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('updateWorkspace', () => {
  it('applies name + icon locally and persists synchronously', () => {
    useAppStore.getState().updateWorkspace({ name: 'New Name', icon: '🚀' })
    const s = useAppStore.getState()
    expect(s.workspace.name).toBe('New Name')
    expect(s.workspace.icon).toBe('🚀')
    const raw = mem.get('openmanas_state_v1')
    expect(raw).toBeTruthy()
    const saved = JSON.parse(raw!) as any
    expect(saved.workspace.name).toBe('New Name')
    expect(saved.workspace.icon).toBe('🚀')
  })

  it('PATCHes the server workspace when signed in', async () => {
    const calls: string[] = []
    let body: any = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        calls.push(`${init?.method || 'GET'} ${url}`)
        try { body = JSON.parse(init?.body ?? 'null') } catch { body = null }
        return jsonOk({ ok: true })
      }),
    )
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    const wsId = useAppStore.getState().workspace.id
    useAppStore.getState().updateWorkspace({ icon: '◈' })
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toContain(`PATCH /api/workspaces/${wsId}`)
    expect(body?.icon).toBe('◈')
  })

  it('stays local-only when logged out', async () => {
    const fetchMock = vi.fn(async () => jsonOk({}))
    vi.stubGlobal('fetch', fetchMock)
    useAppStore.setState({ token: null, backendMode: 'local' })
    useAppStore.getState().updateWorkspace({ icon: '🎯' })
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAppStore.getState().workspace.icon).toBe('🎯')
  })
})
