import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const api = await import('../src/lib/api')
const sync = await import('../src/lib/sync')

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('share links (client)', () => {
  it('creates, lists, resolves, and revokes', async () => {
    const link = { id: 's1', pageId: 'p1', permission: 'view', visibility: 'workspace', token: 'abc123', createdAt: 't' }
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      if (String(url).endsWith('/shares') && init?.method === 'POST') return jsonOk(link)
      if (String(url).endsWith('/shares') && !init?.method) return jsonOk([link])
      if (String(url).includes('/api/shares/') && init?.method === 'DELETE') return jsonOk({ ok: true })
      if (String(url).endsWith('/shares/abc123')) return jsonOk({ pageId: 'p1', permission: 'view', visibility: 'workspace' })
      throw new Error(`unexpected ${init?.method} ${url}`)
    }))
    expect(await sync.createShareLink('p1', 'view', 'workspace')).toEqual(link)
    expect(await sync.listShareLinks('p1')).toEqual([link])
    expect(await sync.resolveShareToken('abc123')).toEqual({ pageId: 'p1', permission: 'view', visibility: 'workspace' })
    expect(await sync.revokeShareLink('abc123')).toEqual({ ok: true })
    expect(calls).toContain('POST /api/pages/p1/shares')
    expect(calls).toContain('DELETE /api/shares/abc123')
  })

  it('shareUrl embeds the join hash', () => {
    expect(sync.shareUrl('tok')).toContain('#/join/tok')
  })
})
