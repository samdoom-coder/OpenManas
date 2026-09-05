import { describe, it, expect, beforeEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore } = await import('../src/stores/appStore')

beforeEach(() => {
  mem.clear()
  // reset selection so tests don't leak route state
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null })
})

describe('createPageFromTemplate', () => {
  it('creates a page with the template blocks (not an empty page)', () => {
    const before = useAppStore.getState().blocks.length
    const page = useAppStore.getState().createPageFromTemplate('Meeting Notes')
    expect(page.title).toBe('Meeting Notes')
    const blocks = useAppStore.getState().blocks.filter(b => b.pageId === page.id)
    expect(blocks.length).toBeGreaterThan(3)
    expect(blocks.map(b => b.type)).toContain('heading1')
    expect(useAppStore.getState().blocks.length).toBeGreaterThan(before)
  })

  it('falls back to a blank page for unknown templates', () => {
    const page = useAppStore.getState().createPageFromTemplate('Nope')
    const blocks = useAppStore.getState().blocks.filter(b => b.pageId === page.id)
    expect(blocks.length).toBe(1)
  })
})

describe('movePage', () => {
  it('moves a page and rejects cycles', () => {
    const s = useAppStore.getState()
    const parent = s.createPage('MoveParent')
    const child = s.createPage('MoveChild', parent.id)
    // move child to top level — ok
    expect(useAppStore.getState().movePage(child.id, null)).toBe(true)
    expect(useAppStore.getState().pages.find(p => p.id === child.id)?.parentId).toBeNull()
    // move parent under child — ok now (no cycle)
    expect(useAppStore.getState().movePage(parent.id, child.id)).toBe(true)
    // move child under parent — would cycle (child is now parent's parent) — reject
    expect(useAppStore.getState().movePage(child.id, parent.id)).toBe(false)
    // self-parent — reject
    expect(useAppStore.getState().movePage(parent.id, parent.id)).toBe(false)
  })
})

describe('restorePageBlocks (undo backbone)', () => {
  it('replaces page blocks and bumps historyRev so focused editors resync', () => {
    const s = useAppStore.getState()
    const page = s.createPage('HistPage')
    const rev0 = useAppStore.getState().historyRev
    const snapshot = useAppStore.getState().blocks.filter(b => b.pageId === page.id)
    useAppStore.getState().addBlock(page.id, 'paragraph', 'hello')
    expect(useAppStore.getState().blocks.filter(b => b.pageId === page.id).length).toBe(snapshot.length + 1)
    useAppStore.getState().restorePageBlocks(page.id, snapshot)
    const after = useAppStore.getState().blocks.filter(b => b.pageId === page.id)
    expect(after.length).toBe(snapshot.length)
    expect(useAppStore.getState().historyRev).toBe(rev0 + 1)
  })
})

describe('database management (rename/icon/favorite/delete)', () => {
  it('renames and rejects blank names', () => {
    const s = useAppStore.getState()
    const db = s.createDatabase('RenameMe')
    useAppStore.getState().updateDatabase(db.id, { name: '  Renamed  ' })
    expect(useAppStore.getState().databases.find(d => d.id === db.id)?.name).toBe('Renamed')
    useAppStore.getState().updateDatabase(db.id, { name: '   ' })
    expect(useAppStore.getState().databases.find(d => d.id === db.id)?.name).toBe('Renamed')
  })

  it('sets icon and description', () => {
    const db = useAppStore.getState().createDatabase('IconDb')
    useAppStore.getState().updateDatabase(db.id, { icon: '🚀', description: 'Shiny' })
    const after = useAppStore.getState().databases.find(d => d.id === db.id)
    expect(after?.icon).toBe('🚀')
    expect(after?.description).toBe('Shiny')
  })

  it('toggles favorite', () => {
    const db = useAppStore.getState().createDatabase('FavDb')
    expect(useAppStore.getState().databases.find(d => d.id === db.id)?.isFavorite).toBeFalsy()
    useAppStore.getState().toggleDatabaseFavorite(db.id)
    expect(useAppStore.getState().databases.find(d => d.id === db.id)?.isFavorite).toBe(true)
    useAppStore.getState().toggleDatabaseFavorite(db.id)
    expect(useAppStore.getState().databases.find(d => d.id === db.id)?.isFavorite).toBe(false)
  })

  it('deletes the database with its records and clears selection', () => {
    const s = useAppStore.getState()
    const db = s.createDatabase('DoomedDb')
    useAppStore.getState().createRecord(db.id, { [db.properties[0].id]: 'x' })
    expect(useAppStore.getState().selectedDatabaseId).toBe(db.id)
    useAppStore.getState().deleteDatabase(db.id)
    expect(useAppStore.getState().databases.some(d => d.id === db.id)).toBe(false)
    expect(useAppStore.getState().records.some(r => r.databaseId === db.id)).toBe(false)
    expect(useAppStore.getState().selectedDatabaseId).toBeNull()
  })
})

describe('importRecords', () => {
  it('bulk-inserts rows with sequential positions', () => {
    const s = useAppStore.getState()
    const db = s.createDatabase('ImportDb')
    const created = useAppStore.getState().importRecords(db.id, [
      { [db.properties[0].id]: 'A' },
      { [db.properties[0].id]: 'B' },
    ])
    expect(created.length).toBe(2)
    expect(created[1].position).toBe(created[0].position + 1)
    expect(useAppStore.getState().records.filter(r => r.databaseId === db.id).length).toBe(2)
  })
})
