import { describe, it, expect } from 'vitest'
import { tokenize, embedText, cosineSimilarity, buildDocs, semanticSearchDocs, EMBEDDING_DIM } from '../src/lib/embeddings'
import { buildGraph, layoutGraph } from '../src/components/features/KnowledgeGraph'

describe('tokenize', () => {
  it('lowercases, strips HTML and stopwords', () => {
    expect(tokenize('<b>Website</b> Redesign for the Acme team')).toContain('website')
    expect(tokenize('the and of')).toEqual([])
  })
})

describe('embedText', () => {
  it('is deterministic with the right dim', () => {
    const a = embedText('website redesign')
    const b = embedText('website redesign')
    expect(a).toHaveLength(EMBEDDING_DIM)
    expect(a).toEqual(b)
  })
  it('is L2-normalized (self cosine = 1)', () => {
    const a = embedText('quarterly planning notes')
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5)
  })
  it('empty text embeds to zero vector', () => {
    expect(embedText('')).toEqual(new Array(EMBEDDING_DIM).fill(0))
  })
})

describe('semanticSearchDocs', () => {
  const docs = buildDocs(
    [
      { id: 'p1', title: 'Website Redesign', description: 'landing page overhaul' },
      { id: 'p2', title: 'Grocery List', description: 'milk eggs bread' },
    ],
    [{ id: 'b1', pageId: 'p1', content: '<p>Pick a <b>color palette</b> for the hero</p>' }],
    [{ id: 'r1', properties: { Name: 'Acme Corp', Status: 'Active' } }],
  )
  it('ranks the related doc first', () => {
    const res = semanticSearchDocs('landing page colors', docs, 5)
    expect(res.length).toBeGreaterThan(0)
    expect(['p1', 'b1']).toContain(res[0].id)
  })
  it('finds records by value', () => {
    const res = semanticSearchDocs('acme corporation status', docs, 5)
    expect(res.map((r) => r.id)).toContain('r1')
  })
  it('stems plurals so "colors" matches "color"', () => {
    const res = semanticSearchDocs('hero colors', docs, 5)
    expect(res.map((r) => r.id)).toContain('b1')
  })
  it('returns empty for blank queries or no overlap', () => {
    expect(semanticSearchDocs('   ', docs)).toEqual([])
    expect(semanticSearchDocs('zzzqxjkw', docs)).toEqual([])
  })
})

describe('buildGraph', () => {
  const pages = [
    { id: 'p1', title: 'Home', parentId: null },
    { id: 'p2', title: 'Child', parentId: 'p1' },
  ]
  const dbs = [{ id: 'd1', name: 'Tasks', pageId: 'p1' }]
  const blocks = [
    { id: 'b1', pageId: 'p2', type: 'page_embed', content: 'p1' },
    { id: 'b2', pageId: 'p2', type: 'database_embed', content: 'd1' },
  ]
  const records = [{ id: 'r1', databaseId: 'd1', properties: { Name: 'Todo' } }]
  it('builds nodes and typed edges', () => {
    const g = buildGraph(pages, dbs, blocks, records)
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['d1', 'p1', 'p2', 'r1'])
    const types = g.edges.map((e) => e.type).sort()
    expect(types).toContain('parent-child')
    expect(types).toContain('link')
    expect(types).toContain('relation')
    expect(types).toContain('contains')
  })
  it('skips edges to missing nodes and dedupes', () => {
    const g = buildGraph(pages, dbs, [
      { id: 'b9', pageId: 'p1', type: 'mention', content: 'ghost' },
      { id: 'b8', pageId: 'p2', type: 'page_embed', content: 'p1' },
      { id: 'b7', pageId: 'p2', type: 'page_embed', content: 'p1' },
    ])
    expect(g.edges.filter((e) => e.target === 'ghost')).toHaveLength(0)
    expect(g.edges.filter((e) => e.source === 'p2' && e.target === 'p1')).toHaveLength(1)
  })
  it('caps large workspaces and reports truncation', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, title: `Page ${i}` }))
    const g = buildGraph(many, [])
    expect(g.nodes.length).toBeLessThanOrEqual(150)
    expect(g.truncated).toBeGreaterThan(0)
  })
})

describe('layoutGraph', () => {
  it('positions every node with finite coords', () => {
    const g = buildGraph(
      [{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B', parentId: 'p1' }],
      [{ id: 'd1', name: 'DB' }],
    )
    const pos = layoutGraph(g.nodes, g.edges, 10)
    expect(pos.size).toBe(3)
    for (const p of pos.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})
