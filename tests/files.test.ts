import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { formatSize, kindOf, previewUrl } = await import('../src/components/features/FileManager')
const { blockTypeForMime, acceptMatches, resolveAttachTarget } = await import('../src/lib/fileRefs')
const { BlockRegistry } = await import('../src/lib/blockRegistry')
const { useAppStore } = await import('../src/stores/appStore')

describe('file/audio slash commands', () => {
  it('registers /file and /audio so every upload block is creatable', () => {
    const ids = BlockRegistry.slashCommands().map((c) => c.blockType)
    for (const t of ['image', 'video', 'audio', 'file'] as const) {
      expect(ids).toContain(t)
    }
  })
})
const api = await import('../src/lib/api')
const sync = await import('../src/lib/sync')

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local', files: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('formatSize', () => {
  it('formats bytes human-readably', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(2.4 * 1024 * 1024)).toBe('2.4 MB')
    expect(formatSize(NaN)).toBe('0 B')
  })
})

describe('kindOf', () => {
  it('classifies mime types', () => {
    expect(kindOf('image/png')).toBe('image')
    expect(kindOf('video/mp4')).toBe('video')
    expect(kindOf('audio/mpeg')).toBe('audio')
    expect(kindOf('application/pdf')).toBe('pdf')
    expect(kindOf('application/zip')).toBe('file')
    expect(kindOf('')).toBe('file')
  })
})

describe('previewUrl', () => {
  it('prefers the stored url, falls back to provider lookup', () => {
    const f = { id: 'f1', workspaceId: 'w1', filename: 'a.png', mimeType: 'image/png', size: 10, storageKey: 'files/x', url: 'blob:abc', uploadedBy: 'u', createdAt: 't' }
    expect(previewUrl(f as never)).toBe('blob:abc')
    expect(previewUrl({ ...f, url: undefined } as never)).toBe('')
  })
})

describe('blockTypeForMime', () => {
  it('maps mime to the rendering block type', () => {
    expect(blockTypeForMime('image/png')).toBe('image')
    expect(blockTypeForMime('video/mp4')).toBe('video')
    expect(blockTypeForMime('audio/mpeg')).toBe('audio')
    expect(blockTypeForMime('application/pdf')).toBe('file')
    expect(blockTypeForMime('')).toBe('file')
  })
})

describe('acceptMatches', () => {
  it('matches wildcards, prefixes, extensions, and lists', () => {
    expect(acceptMatches(undefined, 'image/png', 'a.png')).toBe(true)
    expect(acceptMatches('*/*', 'video/mp4', 'v.mp4')).toBe(true)
    expect(acceptMatches('image/*', 'image/jpeg', 'a.jpg')).toBe(true)
    expect(acceptMatches('image/*', 'application/pdf', 'a.pdf')).toBe(false)
    expect(acceptMatches('audio/*', 'audio/mpeg', 's.mp3')).toBe(true)
    expect(acceptMatches('.pdf', 'application/pdf', 'doc.PDF')).toBe(true)
    expect(acceptMatches('.pdf', 'application/pdf', 'doc.txt')).toBe(false)
    expect(acceptMatches('image/png, application/pdf', 'application/pdf', 'd.pdf')).toBe(true)
    expect(acceptMatches('image/png', 'image/jpeg', 'a.jpg')).toBe(false)
  })
})

describe('resolveAttachTarget', () => {  const mk = (id: string, updatedAt: string, isTrashed = false) => ({
    id, workspaceId: 'w1', parentId: null, title: id, isFavorite: false,
    isArchived: false, isTrashed, isShared: false,
    createdBy: 'u', updatedBy: 'u', createdAt: updatedAt, updatedAt,
  })
  const pages = [mk('old', '2024-01-01T00:00:00Z'), mk('new', '2024-06-01T00:00:00Z'), mk('trash', '2024-07-01T00:00:00Z', true)]

  it('prefers the explicit override', () => {
    expect(resolveAttachTarget(pages as never, 'new', 'old')?.id).toBe('old')
    expect(resolveAttachTarget(pages as never, null, 'missing')).toBeNull()
    expect(resolveAttachTarget(pages as never, null, 'trash')).toBeNull()
  })

  it('falls back to the open page, then most recent', () => {
    expect(resolveAttachTarget(pages as never, 'old', null)?.id).toBe('old')
    expect(resolveAttachTarget(pages as never, null, null)?.id).toBe('new')
    expect(resolveAttachTarget([], null, null)).toBeNull()
  })
})

describe('files sync client', () => {
  it('posts metadata and deletes by id', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    await sync.postFileMeta({ id: 'f1', workspaceId: 'w1', filename: 'a.png', mimeType: 'image/png', size: 10, storageKey: 'files/x', uploadedBy: 'u', createdAt: 't' })
    await sync.deleteFileRemote('f1')
    expect(calls).toContain('POST /api/files')
    expect(calls).toContain('DELETE /api/files/f1')
  })
})

describe('store files', () => {
  it('addFile records metadata locally without server when logged out', () => {
    const f = useAppStore.getState().addFile({ filename: 'a.png', mimeType: 'image/png', size: 100, storageKey: 'files/k1', url: 'blob:u' })
    expect(f.id).toBeTruthy()
    expect(f.workspaceId).toBe(useAppStore.getState().workspace.id)
    expect(useAppStore.getState().files.some((x) => x.id === f.id)).toBe(true)
  })

  it('addFile POSTs metadata when logged in', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    useAppStore.getState().addFile({ filename: 'b.pdf', mimeType: 'application/pdf', size: 200, storageKey: 'files/k2' })
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toContain('POST /api/files')
  })

  it('removeFile drops the record (and DELETEs remotely when logged in)', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      return jsonOk({ ok: true })
    }))
    api.saveSession({ user: { id: 'u', email: 'e@x.y', name: 'U' }, token: 'tok' })
    useAppStore.setState({ token: 'tok', backendMode: 'server' })
    const f = useAppStore.getState().addFile({ filename: 'c.txt', mimeType: 'text/plain', size: 5, storageKey: 'files/k3' })
    useAppStore.getState().removeFile(f.id)
    expect(useAppStore.getState().files.some((x) => x.id === f.id)).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toContain(`DELETE /api/files/${f.id}`)
  })

  it('refreshFiles is a no-op when logged out', async () => {
    const fetchMock = vi.fn(async () => jsonOk([]))
    vi.stubGlobal('fetch', fetchMock)
    await useAppStore.getState().refreshFiles()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
