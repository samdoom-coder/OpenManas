import { describe, it, expect, beforeEach } from 'vitest'
import {
  diffBlocks,
  summarizeDiff,
  stripHtml,
  blockPreview,
  snapshotsEqual,
  buildVersion,
  nextVersionNumber,
  appendVersion,
  loadVersions,
  saveVersions,
  MAX_VERSIONS_PER_PAGE,
  VERSIONS_KEY,
} from '../src/lib/versions'
import type { Block } from '../src/lib/types'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore } = await import('../src/stores/appStore')

const blk = (over: Partial<Block> & { id: string }): Block => ({
  pageId: 'p1', parentId: null, type: 'paragraph', content: '', properties: {},
  position: 0, createdAt: 't0', updatedAt: 't0', ...over,
})

beforeEach(() => {
  mem.clear()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, versions: {} })
})

describe('stripHtml / blockPreview', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<b>Hi</b>  <i>there</i>')).toBe('Hi there')
    expect(stripHtml('')).toBe('')
  })
  it('truncates long text', () => {
    expect(stripHtml('x'.repeat(200)).endsWith('…')).toBe(true)
  })
  it('falls back to type label for empty blocks', () => {
    expect(blockPreview({ type: 'paragraph', content: '' })).toBe('(paragraph)')
    expect(blockPreview({ type: 'divider', content: '' })).toBe('───')
    expect(blockPreview({ type: 'paragraph', content: '<b>Hi</b>' })).toBe('Hi')
  })
})

describe('diffBlocks', () => {
  it('detects added and removed blocks', () => {
    const changes = diffBlocks([blk({ id: 'a', position: 0 })], [blk({ id: 'b', content: 'new', position: 0 })])
    expect(changes.find((c) => c.id === 'a')?.status).toBe('removed')
    expect(changes.find((c) => c.id === 'b')?.status).toBe('added')
    const added = changes.find((c) => c.id === 'b')!
    expect(added.oldPosition).toBeNull()
    expect(added.newText).toBe('new')
  })

  it('detects content changes', () => {
    const changes = diffBlocks(
      [blk({ id: 'a', content: 'old', position: 0 })],
      [blk({ id: 'a', content: 'new', position: 0 })],
    )
    expect(changes).toHaveLength(1)
    expect(changes[0].status).toBe('changed')
    expect(changes[0].oldText).toBe('old')
    expect(changes[0].newText).toBe('new')
  })

  it('detects property-only changes', () => {
    const changes = diffBlocks(
      [blk({ id: 'a', type: 'todo', content: 'x', properties: { checked: false }, position: 0 })],
      [blk({ id: 'a', type: 'todo', content: 'x', properties: { checked: true }, position: 0 })],
    )
    expect(changes[0].status).toBe('changed')
  })

  it('detects pure moves', () => {
    const changes = diffBlocks(
      [blk({ id: 'a', position: 0 }), blk({ id: 'b', position: 1 })],
      [blk({ id: 'b', position: 0 }), blk({ id: 'a', position: 1 })],
    )
    expect(changes.every((c) => c.status === 'moved')).toBe(true)
  })

  it('marks identical blocks unchanged', () => {
    const changes = diffBlocks(
      [blk({ id: 'a', content: 'same', position: 0 })],
      [blk({ id: 'a', content: 'same', position: 0 })],
    )
    expect(changes[0].status).toBe('unchanged')
  })

  it('summarizes counts', () => {
    const changes = diffBlocks(
      [blk({ id: 'gone', position: 0 }), blk({ id: 'edit', content: 'o', position: 1 }), blk({ id: 'same', position: 2 })],
      [blk({ id: 'edit', content: 'n', position: 0 }), blk({ id: 'same', position: 1 }), blk({ id: 'fresh', position: 2 })],
    )
    const s = summarizeDiff(changes)
    expect(s.removed).toBe(1)
    expect(s.added).toBe(1)
    expect(s.changed).toBe(1)
    expect(s.total).toBe(4)
  })
})

describe('snapshotsEqual', () => {
  it('compares order-insensitively by id but respects positions', () => {
    const a = [blk({ id: 'x', content: '1', position: 0 })]
    expect(snapshotsEqual(a, [blk({ id: 'x', content: '1', position: 0 })])).toBe(true)
    expect(snapshotsEqual(a, [blk({ id: 'x', content: '2', position: 0 })])).toBe(false)
    expect(snapshotsEqual(a, [blk({ id: 'x', content: '1', position: 1 })])).toBe(false)
    expect(snapshotsEqual(a, [])).toBe(false)
  })
})

describe('version numbering + cap', () => {
  it('increments monotonically', () => {
    expect(nextVersionNumber([])).toBe(1)
    const v1 = buildVersion('p1', [], 1, { id: 'v1', createdBy: 'u', createdAt: 't' })
    expect(nextVersionNumber([v1])).toBe(2)
  })
  it('caps at MAX_VERSIONS_PER_PAGE (FIFO)', () => {
    let list = Array.from({ length: MAX_VERSIONS_PER_PAGE }, (_, i) =>
      buildVersion('p1', [], i + 1, { id: `v${i}`, createdBy: 'u', createdAt: 't' }))
    list = appendVersion(list, buildVersion('p1', [], MAX_VERSIONS_PER_PAGE + 1, { id: 'new', createdBy: 'u', createdAt: 't' }))
    expect(list).toHaveLength(MAX_VERSIONS_PER_PAGE)
    expect(list[0].id).toBe('v1')
    expect(list[list.length - 1].id).toBe('new')
    expect(nextVersionNumber(list)).toBe(MAX_VERSIONS_PER_PAGE + 2)
  })
  it('sorts snapshots by position', () => {
    const v = buildVersion('p1', [blk({ id: 'b', position: 1 }), blk({ id: 'a', position: 0 })], 1, { id: 'v', createdBy: 'u', createdAt: 't' })
    expect(v.blocksSnapshot.map((b) => b.id)).toEqual(['a', 'b'])
  })
})

describe('versions storage', () => {
  it('round-trips through localStorage', () => {
    saveVersions({ p1: [buildVersion('p1', [blk({ id: 'a' })], 1, { id: 'v1', createdBy: 'u', createdAt: 't' })] })
    const loaded = loadVersions()
    expect(loaded.p1).toHaveLength(1)
    expect(loaded.p1[0].blocksSnapshot[0].id).toBe('a')
  })
  it('returns {} on corrupt cache', () => {
    mem.set(VERSIONS_KEY, '{oops')
    expect(loadVersions()).toEqual({})
    mem.set(VERSIONS_KEY, JSON.stringify({ p1: [{ nope: true }] }))
    expect(loadVersions()).toEqual({})
  })
})

describe('store capture/restore', () => {
  it('captures the current blocks and restores them (with safety snapshot)', () => {
    const page = useAppStore.getState().createPage('Versioned')
    useAppStore.getState().addBlock(page.id, 'paragraph', 'v1 text')
    // Note: addBlock may already have taken an auto snapshot, so don't assume numbering.
    const before = useAppStore.getState().versions[page.id]?.length ?? 0
    const v1 = useAppStore.getState().captureVersion(page.id, 'first')
    expect(v1?.blocksSnapshot.some((b) => b.content === 'v1 text')).toBe(true)
    expect(useAppStore.getState().versions[page.id]).toHaveLength(before + 1)

    useAppStore.getState().addBlock(page.id, 'paragraph', 'v2 text')
    expect(useAppStore.getState().restoreVersion(page.id, v1!.id)).toBe(true)
    const contents = useAppStore.getState().blocks.filter((b) => b.pageId === page.id).map((b) => b.content)
    expect(contents).toContain('v1 text')
    expect(contents).not.toContain('v2 text')
    // safety snapshot ("Before restore…") is added on top of the restore target
    expect(useAppStore.getState().versions[page.id].some((v) => v.message?.startsWith('Before restore'))).toBe(true)
  })

  it('restore returns false for unknown versions', () => {
    const page = useAppStore.getState().createPage('Nope')
    expect(useAppStore.getState().restoreVersion(page.id, 'missing')).toBe(false)
  })
})
