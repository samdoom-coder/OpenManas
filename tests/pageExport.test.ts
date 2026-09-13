import { describe, it, expect } from 'vitest'
import { stripHtml, blockToMarkdown, pageToMarkdown, pageToJson, exportFilename } from '../src/lib/pageExport'
import type { Block, Page } from '../src/lib/types'

const blk = (over: Partial<Block>): Block => ({
  id: 'b1', pageId: 'p1', parentId: null, type: 'paragraph', content: '',
  properties: {}, position: 0, createdAt: '', updatedAt: '', ...over,
})

describe('stripHtml', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<b>Hello</b> &amp; <i>world</i>')).toBe('Hello & world')
    expect(stripHtml('a<br>line')).toBe('a\nline')
    expect(stripHtml('')).toBe('')
  })
})

describe('blockToMarkdown', () => {
  it('covers headings, lists, todo, quote, divider', () => {
    expect(blockToMarkdown(blk({ type: 'heading1', content: 'Hi' }))).toBe('# Hi')
    expect(blockToMarkdown(blk({ type: 'heading3', content: 'Hi' }))).toBe('### Hi')
    expect(blockToMarkdown(blk({ type: 'bulleted_list', content: 'x' }))).toBe('- x')
    expect(blockToMarkdown(blk({ type: 'numbered_list', content: 'x' }), 3)).toBe('3. x')
    expect(blockToMarkdown(blk({ type: 'todo', content: 'do', properties: { checked: true } }))).toBe('- [x] do')
    expect(blockToMarkdown(blk({ type: 'todo', content: 'do' }))).toBe('- [ ] do')
    expect(blockToMarkdown(blk({ type: 'quote', content: 'a<br>b' }))).toBe('> a\n> b')
    expect(blockToMarkdown(blk({ type: 'divider', content: '' }))).toBe('---')
  })
  it('covers code, media, bookmark, chart, table', () => {
    expect(blockToMarkdown(blk({ type: 'code', content: 'x=1' }))).toBe('```\nx=1\n```')
    expect(blockToMarkdown(blk({ type: 'image', content: 'https://x/y.png' }))).toBe('![](https://x/y.png)')
    expect(blockToMarkdown(blk({ type: 'bookmark', content: 'https://x', properties: { title: 'T' } }))).toBe('[T](https://x)')
    expect(blockToMarkdown(blk({ type: 'chart', content: JSON.stringify({ title: 'S', type: 'bar', rows: [] }) }))).toContain('S')
    const table = JSON.stringify({ columns: [{ label: 'A' }, { label: 'B' }], rows: [{ cells: ['1', '2'] }] })
    const md = blockToMarkdown(blk({ type: 'table', content: table }))
    expect(md).toContain('| A | B |')
    expect(md).toContain('| 1 | 2 |')
  })
  it('returns empty for empty blocks', () => {
    expect(blockToMarkdown(blk({ type: 'paragraph', content: '' }))).toBe('')
    expect(blockToMarkdown(blk({ type: 'heading1', content: '' }))).toBe('')
  })
})

describe('pageToMarkdown / pageToJson / exportFilename', () => {
  const page = { id: 'p1', title: 'My Page', description: 'desc' } as Page
  const blocks = [
    blk({ id: 'b1', type: 'heading1', content: 'H', position: 0 }),
    blk({ id: 'b2', type: 'paragraph', content: 'body', position: 1 }),
  ]
  it('builds a markdown doc in position order', () => {
    const md = pageToMarkdown(page, blocks)
    expect(md.startsWith('# My Page')).toBe(true)
    expect(md).toContain('# H')
    expect(md).toContain('body')
    expect(md.endsWith('\n')).toBe(true)
  })
  it('ignores other pages blocks and serializes JSON', () => {
    const other = blk({ id: 'bx', pageId: 'p9', type: 'paragraph', content: 'nope', position: 0 })
    expect(pageToMarkdown(page, [...blocks, other])).not.toContain('nope')
    const j = JSON.parse(pageToJson(page, blocks))
    expect(j.blocks).toHaveLength(2)
  })
  it('sanitizes filenames', () => {
    expect(exportFilename('My Page: v2!', 'md')).toBe('My-Page-v2.md')
    expect(exportFilename('', 'json')).toBe('page.json')
  })
})
