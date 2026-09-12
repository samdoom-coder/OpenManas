import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const avatar = await import('../src/lib/avatar')
const sync = await import('../src/lib/sync')
const api = await import('../src/lib/api')
const { useAppStore } = await import('../src/stores/appStore')

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateAvatarFile', () => {
  it('rejects non-images', () => {
    expect(avatar.validateAvatarFile({ type: 'application/pdf', size: 100 })).toMatch(/image/i)
    expect(avatar.validateAvatarFile({ type: '', size: 100 })).toMatch(/image/i)
  })
  it('rejects empty and oversized files', () => {
    expect(avatar.validateAvatarFile({ type: 'image/png', size: 0 })).toMatch(/empty/i)
    expect(avatar.validateAvatarFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toMatch(/too large/i)
  })
  it('accepts png/jpeg/webp', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(avatar.validateAvatarFile({ type: t, size: 1024 })).toBeNull()
    }
  })
})

describe('getInitials', () => {
  it('derives initials from name or email', () => {
    expect(avatar.getInitials('Alex Rivera', '')).toBe('AR')
    expect(avatar.getInitials('', 'sam@example.com')).toBe('S')
    expect(avatar.getInitials('', '')).toBe('?')
  })
})

describe('fileToAvatarDataUrl', () => {
  it('reads an image file to a data URL (no-DOM fallback keeps it working)', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const file = new File([bytes as any], 'pic.png', { type: 'image/png' })
    const url = await avatar.fileToAvatarDataUrl(file as File)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })
  it('rejects non-image files instead of uploading', async () => {
    const file = new File(['hello'] as any, 'doc.pdf', { type: 'application/pdf' })
    await expect(avatar.fileToAvatarDataUrl(file as File)).rejects.toThrow(/image/i)
  })
  it('downscaleToAvatar is a safe no-op without DOM canvas', async () => {
    const out = await avatar.downscaleToAvatar('data:image/png;base64,AAA')
    expect(out).toBe('data:image/png;base64,AAA')
  })
})

describe('isImageIcon', () => {
  it('detects uploaded/linked images vs emoji text', () => {
    expect(avatar.isImageIcon('data:image/jpeg;base64,/9j/')).toBe(true)
    expect(avatar.isImageIcon('https://example.com/icon.png')).toBe(true)
    expect(avatar.isImageIcon('🚀')).toBe(false)
    expect(avatar.isImageIcon('⬢')).toBe(false)
    expect(avatar.isImageIcon('')).toBe(false)
    expect(avatar.isImageIcon(undefined)).toBe(false)
  })
})

describe('profile sync client', () => {
  it('PATCHes /api/users/me with name/avatar', async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ method: init?.method || 'GET', url, body: init?.body ? JSON.parse(init.body) : undefined })
      return jsonOk({ user: { id: 'u1', email: 'a@x.y', name: 'A', avatar: 'data:image/png;base64,AAA' } })
    }))
    await sync.patchProfile({ name: 'A', avatar: 'data:image/png;base64,AAA' })
    expect(calls.length).toBe(1)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toBe('/api/users/me')
    expect(calls[0].body).toEqual({ name: 'A', avatar: 'data:image/png;base64,AAA' })
  })
})

describe('store updateUser persists avatar', () => {
  it('stores avatar locally without server when logged out', () => {
    useAppStore.getState().updateUser({ avatar: 'data:image/png;base64,AAA' })
    expect(useAppStore.getState().user.avatar).toBe('data:image/png;base64,AAA')
    const saved = JSON.parse(mem.get('openmanas_state_v1') ?? '{}')
    expect(saved.user.avatar).toBe('data:image/png;base64,AAA')
  })

  it('keeps the login session in sync and pushes to /api/users/me when logged in', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ user: { id: 'u1', email: 'a@x.y', name: 'A', avatar: 'data:image/png;base64,AAA' } })
    }))
    api.saveSession({ user: { id: 'u1', email: 'a@x.y', name: 'A' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    useAppStore.getState().updateUser({ avatar: 'data:image/png;base64,AAA' })
    // session updated synchronously; server push is debounced (~1s)
    expect(api.loadSession()?.user.avatar).toBe('data:image/png;base64,AAA')
    await new Promise((r) => setTimeout(r, 1200))
    expect(calls).toContain('PATCH /api/users/me')
  })
})
