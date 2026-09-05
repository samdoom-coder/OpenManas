import { describe, it, expect, beforeEach, vi } from 'vitest'

// stub localStorage before importing modules that touch it at load
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const api = await import('../src/lib/api')

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
})

describe('session storage', () => {
  it('round-trips token + session', () => {
    expect(api.getStoredToken()).toBeNull()
    expect(api.loadSession()).toBeNull()
    api.saveSession({ user: { id: 'u9', email: 'a@b.c', name: 'Ab' }, token: 'tok123' })
    expect(api.getStoredToken()).toBe('tok123')
    expect(api.loadSession()?.user.email).toBe('a@b.c')
    api.clearSession()
    expect(api.getStoredToken()).toBeNull()
  })
  it('rejects malformed stored sessions', () => {
    mem.set('openmanas_session_v1', '{oops')
    expect(api.loadSession()).toBeNull()
    mem.set('openmanas_session_v1', JSON.stringify({ user: { id: 'x' } }))
    expect(api.loadSession()).toBeNull()
  })
  it('migrates the pre-rebrand session key', () => {
    mem.set('nexus_session_v1', JSON.stringify({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, token: 'old-tok' }))
    expect(api.loadSession()?.token).toBe('old-tok')
    expect(api.getStoredToken()).toBe('old-tok')
  })
})

describe('apiFetch', () => {
  it('sends Bearer token and returns JSON', async () => {
    api.saveSession({ user: { id: 'u', email: 'e', name: 'n' }, token: 'tok' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: 1 }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await api.apiFetch('/health')).toEqual({ hello: 1 })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })
  it('surfaces server error messages with status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid credentials' }) }))
    const err = await api.apiFetch('/api/auth/login', { method: 'POST', body: '{}' }).catch((e) => e)
    expect(err).toBeInstanceOf(api.ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('Invalid credentials')
  })
  it('maps network failure to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await api.probeBackend(50).catch((e) => e)
    expect(err).toBeNull()
  })
})

describe('store session actions', () => {
  it('signIn stores session; signOut clears to demo user', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'u9', email: 'a@b.c', name: 'Ab' }, token: 'tok123' }),
    }))
    await useAppStore.getState().signIn('a@b.c', 'password123')
    expect(useAppStore.getState().token).toBe('tok123')
    expect(useAppStore.getState().user.email).toBe('a@b.c')
    expect(useAppStore.getState().backendMode).toBe('server')
    expect(api.getStoredToken()).toBe('tok123')
    useAppStore.getState().signOut()
    expect(useAppStore.getState().token).toBeNull()
    expect(useAppStore.getState().backendMode).toBe('local')
    expect(api.getStoredToken()).toBeNull()
  })
})
