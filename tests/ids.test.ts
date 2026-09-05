import { describe, it, expect } from 'vitest'
import { newId, isUuid, migrateStateIds } from '../src/lib/ids'

describe('newId / isUuid', () => {
  it('generates valid UUIDs', () => {
    expect(isUuid(newId())).toBe(true)
    expect(isUuid(newId())).toBe(true)
  })
  it('rejects legacy ids', () => {
    expect(isUuid('k3j9x2a1b8c4')).toBe(false)
    expect(isUuid('p_name')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})

describe('migrateStateIds', () => {
  it('returns the same object when everything is already UUID', () => {
    const id = newId()
    const state = { pages: [{ id, title: 'A' }], blocks: [] }
    const { state: out, changed } = migrateStateIds(state)
    expect(changed).toBe(false)
    expect(out).toBe(state)
  })
  it('rewrites ids and cross-references consistently', () => {
    const state = {
      pages: [
        { id: 'parent1', title: 'P', parentId: null },
        { id: 'child1', title: 'C', parentId: 'parent1' },
      ],
      blocks: [
        { id: 'b1', pageId: 'child1', content: 'hi', type: 'paragraph', position: 0 },
        { id: 'b2', pageId: 'child1', content: 'parent1', type: 'page_embed', position: 1 },
      ],
      databases: [{
        id: 'db1',
        properties: [{ id: 'p_name', name: 'Name' }, { id: 'p_rel', name: 'Rel', relationDatabaseId: 'db2' }],
        views: [{ id: 'v1', type: 'table', groupBy: 'p_name', visibleProperties: ['p_name'], sort: [{ propertyId: 'p_name', direction: 'asc' }], filter: { op: 'and', conditions: [{ propertyId: 'p_name', operator: 'contains', value: 'x' }] } }],
      }, { id: 'db2', properties: [], views: [] }],
      records: [{ id: 'r1', databaseId: 'db1', properties: { p_name: 'Task', p_rel: 'other' }, pageId: 'child1' }],
      comments: [{ id: 'c1', pageId: 'child1', blockId: 'b1', recordId: 'r1', parentId: null }],
      activities: [{ id: 'a1', targetId: 'child1' }],
      selectedPageId: 'child1',
      selectedDatabaseId: 'db1',
    }
    const { state: out, changed } = migrateStateIds(state)
    expect(changed).toBe(true)
    const [np, nc] = out.pages as any[]
    expect(isUuid(np.id)).toBe(true)
    expect(nc.parentId).toBe(np.id)
    const [nb1, nb2] = out.blocks as any[]
    expect(nb1.pageId).toBe(nc.id)
    expect(nb2.content).toBe(np.id) // embed target rewritten
    const [ndb] = out.databases as any[]
    const [pname] = ndb.properties
    expect(isUuid(pname.id)).toBe(true)
    expect(ndb.views[0].groupBy).toBe(pname.id)
    expect(ndb.views[0].visibleProperties).toEqual([pname.id])
    expect(ndb.views[0].sort[0].propertyId).toBe(pname.id)
    expect(ndb.views[0].filter.conditions[0].propertyId).toBe(pname.id)
    const [nr] = out.records as any[]
    expect(nr.databaseId).toBe(ndb.id)
    expect(nr.properties[pname.id]).toBe('Task')
    expect(nr.pageId).toBe(nc.id)
    const [ncm] = out.comments as any[]
    expect(ncm.pageId).toBe(nc.id)
    expect(ncm.blockId).toBe(nb1.id)
    expect(ncm.recordId).toBe(nr.id)
    expect((out.activities as any[])[0].targetId).toBe(nc.id)
    expect(out.selectedPageId).toBe(nc.id)
    expect(out.selectedDatabaseId).toBe(ndb.id)
  })
})
