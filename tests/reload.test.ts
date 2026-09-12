import { describe, it, expect, beforeEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore, sanitizeLoadedState } = await import('../src/stores/appStore')

beforeEach(() => {
  mem.clear()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

describe('sanitizeLoadedState (blank-screen guard)', () => {
  it('coerces missing collections to empty arrays', () => {
    const out = sanitizeLoadedState({ pages: undefined, blocks: null, records: 'nope' } as any)
    expect(out.pages).toEqual([])
    expect(out.blocks).toEqual([])
    expect(out.records).toEqual([])
    expect(out.databases).toEqual([])
    expect(out.activities).toEqual([])
  })

  it('drops null entries that would crash renders', () => {
    const out = sanitizeLoadedState({ pages: [null, { id: 'p1', title: 'P' }], activities: [undefined] } as any)
    expect(out.pages).toEqual([{ id: 'p1', title: 'P' }])
    expect(out.activities).toEqual([])
  })

  it('falls back to safe user/workspace when malformed', () => {
    const out = sanitizeLoadedState({ user: { name: '' }, workspace: null } as any)
    expect(typeof out.user.name).toBe('string')
    expect(out.user.name.length).toBeGreaterThan(0)
    expect(typeof out.workspace.name).toBe('string')
    expect(out.workspace.name.length).toBeGreaterThan(0)
  })
})

describe('selection persistence across reload', () => {
  it('writes the open page synchronously on select', () => {
    useAppStore.getState().setSelectedPage('page-123')
    const raw = mem.get('openmanas_selected_v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toEqual({ pageId: 'page-123', databaseId: null })
  })

  it('writes the open database synchronously on select', () => {
    useAppStore.getState().setSelectedDatabase('db-9')
    expect(JSON.parse(mem.get('openmanas_selected_v1')!)).toEqual({ pageId: null, databaseId: 'db-9' })
  })
})
