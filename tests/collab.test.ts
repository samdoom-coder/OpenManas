import { describe, it, expect } from 'vitest'
import { toSyncBlock, mergeBlocks, userColor, docNameForPage, type SyncBlock } from '../src/lib/collabSync'
import type { Block } from '../src/lib/types'

const blk = (over: Partial<Block> & { id: string }): Block => ({
  pageId: 'p1', parentId: null, type: 'paragraph', content: '', properties: {},
  position: 0, createdAt: 't0', updatedAt: 't0', ...over,
})
const sync = (over: Partial<SyncBlock> & { id: string }): SyncBlock => ({
  type: 'paragraph', content: '', properties: {}, position: 0, parentId: null, ...over,
})

describe('docNameForPage', () => {
  it('is stable and namespaced', () => {
    expect(docNameForPage('abc')).toBe('openmanas-page-abc')
    expect(docNameForPage('abc')).toBe(docNameForPage('abc'))
  })
})

describe('userColor', () => {
  it('is deterministic and varied', () => {
    expect(userColor('u1')).toBe(userColor('u1'))
    const colors = new Set(['u1', 'u2', 'u3', 'alex', 'sam'].map(userColor))
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('mergeBlocks', () => {
  it('applies remote edits to clean blocks', () => {
    const local = [blk({ id: 'a', content: 'old', position: 0 })]
    const remote = [sync({ id: 'a', content: 'new', position: 0 })]
    const out = mergeBlocks(local, remote, 'p1', new Set())
    expect(out[0].content).toBe('new')
  })
  it('dirty blocks keep local content (last-writer-wins on push)', () => {
    const local = [blk({ id: 'a', content: 'typing…', position: 0 })]
    const remote = [sync({ id: 'a', content: 'peer', position: 0 })]
    const out = mergeBlocks(local, remote, 'p1', new Set(['a']))
    expect(out[0].content).toBe('typing…')
  })
  it('remote adds appear, peer-deleted synced blocks vanish', () => {
    const local = [blk({ id: 'a', position: 0 }), blk({ id: 'gone', position: 1 })]
    const remote = [sync({ id: 'a', position: 0 }), sync({ id: 'b', content: 'hi', position: 1 })]
    const out = mergeBlocks(local, remote, 'p1', new Set(), new Set(['a', 'gone']))
    expect(out.map((b) => b.id)).toEqual(['a', 'b'])
  })
  it('peer-deleted-but-dirty blocks are kept (edit wins)', () => {
    const local = [blk({ id: 'gone', content: 'mine', position: 0 })]
    const out = mergeBlocks(local, [], 'p1', new Set(['gone']), new Set(['gone']))
    expect(out.map((b) => b.id)).toEqual(['gone'])
  })
  it('local-only blocks survive (new or peer-deleted-but-dirty)', () => {
    const local = [blk({ id: 'fresh', content: 'n', position: 0 })]
    const out = mergeBlocks(local, [], 'p1', new Set())
    expect(out.map((b) => b.id)).toEqual(['fresh'])
  })
  it('renormalizes positions in remote order', () => {
    const local = [blk({ id: 'a', position: 5 }), blk({ id: 'b', position: 9 })]
    const remote = [sync({ id: 'b', position: 0 }), sync({ id: 'a', position: 1 })]
    const out = mergeBlocks(local, remote, 'p1', new Set())
    expect(out.map((b) => [b.id, b.position])).toEqual([['b', 0], ['a', 1]])
  })
  it('new remote blocks get pageId + timestamps', () => {
    const out = mergeBlocks([], [sync({ id: 'n', content: 'x', position: 0 })], 'p9', new Set(), new Set(), 'now')
    expect(out[0].pageId).toBe('p9')
    expect(out[0].createdAt).toBe('now')
  })
  it('toSyncBlock round-trips fields', () => {
    const b = blk({ id: 'a', type: 'heading1', content: '<b>Hi</b>', properties: { checked: true }, position: 3, parentId: 'par' })
    expect(toSyncBlock(b)).toEqual({ id: 'a', type: 'heading1', content: '<b>Hi</b>', properties: { checked: true }, position: 3, parentId: 'par' })
  })
})
