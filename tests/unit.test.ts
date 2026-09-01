import { describe, it, expect } from 'vitest'
import { BlockRegistry, detectMarkdownShortcut } from '../src/lib/blockRegistry'
import { evaluateFilter, sortRecords } from '../src/lib/databaseEngine'
import { can } from '../src/lib/permissions'

describe('BlockRegistry', ()=>{
  it('has slash commands', ()=> { expect(BlockRegistry.slashCommands().length).toBeGreaterThan(10) })
  it('detects markdown', ()=> {
    expect(detectMarkdownShortcut('# Hello')).toBe('heading1')
    expect(detectMarkdownShortcut('- item')).toBe('bulleted_list')
    expect(detectMarkdownShortcut('[] task')).toBe('todo')
    expect(detectMarkdownShortcut('> quote')).toBe('quote')
    expect(detectMarkdownShortcut('```')).toBe('code')
  })
})

describe('Database filters', ()=>{
  const rec = { id:'1', databaseId:'db', properties:{ status:'Done', priority:'High', n: 5 }, position:0, createdBy:'u', createdAt:'', updatedAt:'' } as any
  it('equals', ()=> expect(evaluateFilter(rec, { op:'and', conditions:[{ propertyId:'status', operator:'equals', value:'Done'}]})).toBe(true))
  it('AND', ()=> expect(evaluateFilter(rec, { op:'and', conditions:[{ propertyId:'status', operator:'equals', value:'Done'}, { propertyId:'priority', operator:'equals', value:'High'}]})).toBe(true))
  it('OR', ()=> expect(evaluateFilter(rec, { op:'or', conditions:[{ propertyId:'status', operator:'equals', value:'Todo'}, { propertyId:'priority', operator:'equals', value:'High'}]})).toBe(true))
  it('NOT', ()=> expect(evaluateFilter(rec, { op:'not', conditions:[{ propertyId:'status', operator:'equals', value:'Todo'}]})).toBe(true))
})

describe('Sorting', ()=>{
  it('sorts asc', ()=> {
    const recs = [{ properties:{name:'B'}}, {properties:{name:'A'}}] as any
    expect(sortRecords(recs, [{propertyId:'name', direction:'asc'}])[0].properties.name).toBe('A')
  })
})

describe('Permissions', ()=>{
  it('role hierarchy', ()=> {
    expect(can('viewer','viewer')).toBe(true)
    expect(can('viewer','editor')).toBe(false)
    expect(can('owner','viewer')).toBe(true)
    expect(can('editor','commenter')).toBe(true)
  })
})
