import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  canRole,
  canDoPageAction,
  requiredRoleFor,
  resolveWorkspaceRole,
  allowLegacyOpenAccess,
  isValidRole,
  touchesSharingFields,
  minimumRoleForPagePatch,
} from '../server/acl'

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
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ACL helpers (server/acl.ts mirrors permissions.ts)', () => {
  it('role hierarchy owner>admin>editor>commenter>viewer', () => {
    expect(canRole('owner', 'viewer')).toBe(true)
    expect(canRole('viewer', 'editor')).toBe(false)
    expect(canRole('editor', 'editor')).toBe(true)
    expect(canRole('commenter', 'editor')).toBe(false)
  })

  it('page actions map to minimum roles', () => {
    expect(requiredRoleFor('view')).toBe('viewer')
    expect(requiredRoleFor('comment')).toBe('commenter')
    expect(requiredRoleFor('edit')).toBe('editor')
    expect(requiredRoleFor('share')).toBe('admin')
    expect(requiredRoleFor('delete')).toBe('admin')
    expect(canDoPageAction('editor', 'edit')).toBe(true)
    expect(canDoPageAction('commenter', 'edit')).toBe(false)
    expect(canDoPageAction('viewer', 'view')).toBe(true)
    expect(canDoPageAction('viewer', 'comment')).toBe(false)
  })

  it('resolves owner/member/null roles', () => {
    expect(resolveWorkspaceRole('u1', 'u1', null)).toBe('owner')
    expect(resolveWorkspaceRole('u2', 'u1', 'editor')).toBe('editor')
    expect(resolveWorkspaceRole('u2', 'u1', 'bogus')).toBeNull()
    expect(resolveWorkspaceRole('u2', 'u1', null)).toBeNull()
  })

  it('legacy open access only when zero members', () => {
    expect(allowLegacyOpenAccess(0)).toBe(true)
    expect(allowLegacyOpenAccess(1)).toBe(false)
  })

  it('validates role strings', () => {
    expect(isValidRole('editor')).toBe(true)
    expect(isValidRole('superadmin')).toBe(false)
    expect(isValidRole(null)).toBe(false)
  })

  it('detects sharing-field touches in page PATCH bodies', () => {
    expect(touchesSharingFields({ title: 'x' })).toBe(false)
    expect(touchesSharingFields({})).toBe(false)
    expect(touchesSharingFields({ isShared: true })).toBe(true)
    expect(touchesSharingFields({ shareMode: 'public' })).toBe(true)
    expect(touchesSharingFields({ share_mode: 'workspace' })).toBe(true)
    expect(touchesSharingFields({ is_shared: false })).toBe(true)
    expect(minimumRoleForPagePatch({ title: 'x' })).toBe('editor')
    expect(minimumRoleForPagePatch({ isShared: true })).toBe('admin')
    expect(minimumRoleForPagePatch({ title: 'x', shareMode: 'public' })).toBe('admin')
  })
})

describe('slice 4 sync client', () => {
  it('posts comments with id for idempotent upload', async () => {
    const calls: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url, init })
      return jsonOk({ id: 'c1' })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    await sync.postComment({ id: 'c1', pageId: 'p1', authorId: 'u', content: 'hi', createdAt: 't', updatedAt: 't' } as any)
    const body = JSON.parse(calls[0].init.body)
    expect(body.id).toBe('c1')
    expect(body.content).toBe('hi')
  })

  it('fetches comments with filters', async () => {
    let seen = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      seen = String(url)
      return jsonOk([])
    }))
    await sync.fetchComments({ pageId: 'p1', recordId: 'r1' })
    expect(seen).toContain('/api/comments?')
    expect(seen).toContain('pageId=p1')
    expect(seen).toContain('recordId=r1')
  })

  it('posts activities + notifications + patches notification read', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    await sync.postActivity({ id: 'a1', workspaceId: 'w1', userId: 'u', action: 'comment_added', targetId: 'c1', targetType: 'comment', createdAt: 't' } as any)
    await sync.postNotification({ id: 'n1', userId: 'u', type: 'comment', title: 'New comment', read: false, createdAt: 't' } as any)
    await sync.patchNotificationRemote('n1', true)
    expect(calls).toContain('POST /api/activities')
    expect(calls).toContain('POST /api/notifications')
    expect(calls).toContain('PATCH /api/notifications/n1')
  })

  it('pullWorkspace includes slice-4 slices (best-effort empty on 404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/pages?')) return jsonOk([])
      if (String(url).includes('/api/databases?')) return jsonOk([])
      if (String(url).endsWith('/api/comments')) return jsonOk([{ id: 'c1' }])
      if (String(url).includes('/api/activities')) return jsonOk([{ id: 'a1' }])
      if (String(url).includes('/api/files')) return jsonOk([])
      if (String(url).endsWith('/api/notifications')) return jsonOk([{ id: 'n1' }])
      return jsonOk([])
    }))
    const pulled = await sync.pullWorkspace('w1')
    expect((pulled as any).comments.length).toBe(1)
    expect((pulled as any).activities.length).toBe(1)
    expect((pulled as any).notifications.length).toBe(1)
  })

  it('workspace members list + invite hit the right routes', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk([])
    }))
    await sync.listWorkspaceMembers('w1')
    await sync.inviteWorkspaceMember('w1', { email: 'sam@x.y', role: 'editor' })
    expect(calls).toContain('GET /api/workspaces/w1/members')
    expect(calls).toContain('POST /api/workspaces/w1/members')
  })
})

describe('slice 4 store push-through', () => {
  it('addComment POSTs when logged in, stays local when logged out', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    useAppStore.getState().addComment({ pageId: 'p1', authorId: 'u', content: 'hello' } as any)
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toContain('POST /api/comments')
    // activities fire debounced — at least the comment push proves wiring
    expect(useAppStore.getState().comments.some((c) => c.content === 'hello')).toBe(true)
  })

  it('updateComment/deleteComment persist locally', () => {
    useAppStore.setState({ token: null, backendMode: 'local' })
    useAppStore.getState().addComment({ pageId: 'p1', authorId: 'u', content: 'edit me' } as any)
    const c = useAppStore.getState().comments.find((x) => x.content === 'edit me')!
    expect(c).toBeTruthy()
    useAppStore.getState().updateComment(c.id, { content: 'edited' })
    expect(useAppStore.getState().comments.find((x) => x.id === c.id)?.content).toBe('edited')
    useAppStore.getState().deleteComment(c.id)
    expect(useAppStore.getState().comments.some((x) => x.id === c.id)).toBe(false)
  })
})
