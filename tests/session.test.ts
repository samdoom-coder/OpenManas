import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
const baseStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}
;(globalThis as any).localStorage = { ...baseStorage }

const { useAppStore } = await import('../src/stores/appStore')
const api = await import('../src/lib/api')

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

const userA = { id: 'uA', email: 'a@x.y', name: 'User A' }
const userB = { id: 'uB', email: 'b@x.y', name: 'User B' }

beforeEach(() => {
  mem.clear()
  ;(globalThis as any).localStorage.setItem = baseStorage.setItem
  vi.unstubAllGlobals()
  useAppStore.setState({
    user: { ...userA, createdAt: 't', updatedAt: 't' } as any,
    token: null, backendMode: 'local', syncStatus: 'local',
    selectedPageId: null, selectedDatabaseId: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  ;(globalThis as any).localStorage.setItem = baseStorage.setItem
})

describe('account switching isolates data', () => {
  it('sign-in as a different user drops the previous account pages (no leak, no cross-upload)', async () => {
    // previous account had local content
    const mine = useAppStore.getState().createPage('User A secret')
    expect(useAppStore.getState().pages.some((p) => p.id === mine.id)).toBe(true)

    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      if (String(url).endsWith('/api/auth/login')) {
        return jsonOk({ user: userB, token: 'tokB' })
      }
      if (String(url).endsWith('/api/workspaces') && !init?.method) return jsonOk([])
      if (String(url).endsWith('/api/workspaces')) {
        return jsonOk({ id: 'wB', name: 'W', ownerId: 'uB', createdAt: 't', updatedAt: 't' })
      }
      return jsonOk({ ok: true })
    }))

    await useAppStore.getState().signIn('b@x.y', 'password123')
    // identity replaced (not merged) and old pages gone immediately
    expect(useAppStore.getState().user.id).toBe('uB')
    expect(useAppStore.getState().pages.some((p) => p.id === mine.id)).toBe(false)
    expect(useAppStore.getState().token).toBe('tokB')

    // let the fire-and-forget first-run sync finish, then confirm it did
    // NOT upload the previous account's pages into the new account
    await new Promise((r) => setTimeout(r, 150))
    expect(calls).toContain('POST /api/workspaces')
    expect(calls.some((c) => c === 'POST /api/pages')).toBe(false)
  })

  it('sign-out clears the account data and returns to a fresh local demo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/auth/login')) return jsonOk({ user: userB, token: 'tokB' })
      if (String(url).endsWith('/api/workspaces')) return jsonOk([])
      return jsonOk({ ok: true })
    }))
    await useAppStore.getState().signIn('b@x.y', 'password123')
    useAppStore.getState().createPage('Should vanish on logout')

    useAppStore.getState().signOut()
    expect(useAppStore.getState().token).toBeNull()
    expect(api.getStoredToken()).toBeNull()
    expect(api.loadSession()).toBeNull()
    expect(useAppStore.getState().backendMode).toBe('local')
    // local demo seed restored, account pages gone
    expect(useAppStore.getState().user.email).toBe('alex@openmanas.app')
    expect(useAppStore.getState().pages.length).toBeGreaterThan(0)
    expect(useAppStore.getState().pages.some((p) => p.title === 'Should vanish on logout')).toBe(false)
  })
})

describe('session persistence is quota-safe', () => {
  it('saveSession evicts the stale backup copy and retries instead of dropping the login', () => {
    mem.set('openmanas_state_backup', JSON.stringify({ huge: 'x'.repeat(1000) }))
    let failOnce = true
    ;(globalThis as any).localStorage.setItem = (k: string, v: string) => {
      if (failOnce && k === 'openmanas_session_v1') {
        failOnce = false
        throw new Error('QuotaExceededError')
      }
      return baseStorage.setItem(k, v)
    }
    expect(api.saveSession({ user: userB, token: 'tokB' })).toBe(true)
    expect(api.loadSession()?.token).toBe('tokB')
    expect(mem.has('openmanas_state_backup')).toBe(false)
  })
})

describe('validateSession (boot check)', () => {  it('refreshes the profile when the backend is reachable', async () => {
    api.saveSession({ user: userB, token: 'tokB' })
    useAppStore.setState({ token: 'tokB', backendMode: 'server' })
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk({ user: { ...userB, name: 'User B New', avatar: 'data:image/png;base64,AAA' } })))
    expect(await useAppStore.getState().validateSession()).toBe('valid')
    expect(useAppStore.getState().user.name).toBe('User B New')
    expect(useAppStore.getState().token).toBe('tokB')
  })

  it('signs out on 401 with a real token (expired JWT) instead of serving stale identity', async () => {
    api.saveSession({ user: userB, token: 'jwt-expired' })
    useAppStore.setState({ token: 'jwt-expired', backendMode: 'server' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'expired' }) })))
    expect(await useAppStore.getState().validateSession()).toBe('signed-out')
    expect(useAppStore.getState().token).toBeNull()
    expect(api.loadSession()).toBeNull()
  })

  it('keeps the session when the backend is unreachable (offline)', async () => {
    api.saveSession({ user: userB, token: 'tokB' })
    useAppStore.setState({ token: 'tokB', backendMode: 'server' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect(await useAppStore.getState().validateSession()).toBe('offline')
    expect(useAppStore.getState().token).toBe('tokB')
    expect(api.loadSession()?.token).toBe('tokB')
  })
})

describe('in-flight sync cannot leak across accounts', () => {
  it('pending debounced pushes from the old account never fire after sign-in', async () => {
    // logged in as A, make an edit (queues a PATCH ~1s out)
    api.saveSession({ user: userA, token: 'tokA' })
    useAppStore.setState({ token: 'tokA', backendMode: 'server' })
    const seedPage = useAppStore.getState().pages[0]
    useAppStore.getState().updatePage(seedPage.id, { title: 'A last-second edit' })

    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      if (String(url).endsWith('/api/auth/login')) return jsonOk({ user: userB, token: 'tokB' })
      if (String(url).endsWith('/api/workspaces') && !init?.method) return jsonOk([])
      if (String(url).endsWith('/api/workspaces')) {
        return jsonOk({ id: 'wB', name: 'W', ownerId: 'uB', createdAt: 't', updatedAt: 't' })
      }
      return jsonOk({ ok: true })
    }))

    await useAppStore.getState().signIn('b@x.y', 'password123')
    await new Promise((r) => setTimeout(r, 1300)) // past the debounce window
    expect(calls.some((c) => c.startsWith('PATCH'))).toBe(false)
    expect(calls.some((c) => c.includes(seedPage.id))).toBe(false)
  })

  it('a slow pull started by the old account cannot overwrite the new session', async () => {
    const PAGE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
    api.saveSession({ user: userA, token: 'tokA' })
    useAppStore.setState({ token: 'tokA', backendMode: 'server' })
    const pageA = { id: PAGE_A, workspaceId: 'wA', parentId: null, title: 'A server page', icon: 'x', isFavorite: false, isArchived: false, isTrashed: false, isShared: false, createdBy: 'uA', updatedBy: 'uA', createdAt: 't', updatedAt: 't' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      await new Promise((r) => setTimeout(r, 80)) // slow backend
      if (String(url).endsWith('/api/workspaces')) return jsonOk([{ id: 'wA', name: 'WA', ownerId: 'uA', createdAt: 't', updatedAt: 't' }])
      if (String(url).includes('/api/pages?')) return jsonOk([pageA])
      if (String(url).includes('/api/databases?')) return jsonOk([])
      return jsonOk([])
    }))

    const pull = useAppStore.getState().pullFromServer()
    await new Promise((r) => setTimeout(r, 20))
    useAppStore.getState().signOut() // account gone mid-pull
    await pull
    await new Promise((r) => setTimeout(r, 150))
    expect(useAppStore.getState().token).toBeNull()
    expect(useAppStore.getState().pages.some((p) => p.id === PAGE_A)).toBe(false)
  })
})
