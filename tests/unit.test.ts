import { describe, it, expect } from 'vitest'
import { BlockRegistry, detectMarkdownShortcut } from '../src/lib/blockRegistry'
import { evaluateFilter, sortRecords } from '../src/lib/databaseEngine'
import { can } from '../src/lib/permissions'
import { coercePropertyValue, displayPropertyValue, isOptionType, isReadOnlyType, propertyDefFor } from '../src/lib/propertyDefs'

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

describe('Property types (Notion-like columns)', ()=>{
  it('has a def for every PropertyType', ()=> {
    for (const t of ['text','number','select','multi_select','status','checkbox','date','person','url','email','phone','relation','formula'] as any[]) {
      expect(propertyDefFor(t).type).toBe(t)
    }
  })
  it('flags option and read-only types', ()=> {
    expect(isOptionType('select')).toBe(true)
    expect(isOptionType('status')).toBe(true)
    expect(isOptionType('text')).toBe(false)
    expect(isReadOnlyType('formula')).toBe(true)
    expect(isReadOnlyType('created_time')).toBe(true)
    expect(isReadOnlyType('text')).toBe(false)
  })
  it('coerces values per type', ()=> {
    expect(coercePropertyValue({ id:'p', name:'Done', type:'checkbox' } as any, 'yes')).toBe(true)
    expect(coercePropertyValue({ id:'p', name:'N', type:'number' } as any, '42')).toBe(42)
    expect(coercePropertyValue({ id:'p', name:'N', type:'number' } as any, '')).toBe('')
    expect(coercePropertyValue({ id:'p', name:'M', type:'multi_select' } as any, 'a')).toEqual(['a'])
    expect(coercePropertyValue({ id:'p', name:'M', type:'multi_select' } as any, ['a','b'])).toEqual(['a','b'])
    expect(coercePropertyValue({ id:'p', name:'S', type:'select' } as any, 'High')).toBe('High')
  })
  it('displays values per type', ()=> {
    expect(displayPropertyValue({ id:'p', name:'M', type:'multi_select' } as any, ['a','b'])).toBe('a, b')
    expect(displayPropertyValue({ id:'p', name:'C', type:'checkbox' } as any, true)).toBe('Yes')
    expect(displayPropertyValue({ id:'p', name:'T', type:'text' } as any, undefined)).toBe('')
  })
})
