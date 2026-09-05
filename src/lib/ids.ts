// UUID identity — Postgres requires UUID primary keys, so every synced
// entity id must be a UUID. newId() is the only generator; legacy
// timestamp-suffixed ids are rewritten once at boot (migrateStateIds).

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fallback below */ }
  // Fallback: 122 random bits, v4 layout.
  const b = new Uint8Array(16)
  const rnd = (arr: Uint8Array) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(arr)
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
    return arr
  }
  rnd(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}

type AnyRec = Record<string, any>

function remapFilter(group: any, propMap: Map<string, string>): any {
  if (!group || !Array.isArray(group.conditions)) return group
  return {
    ...group,
    conditions: group.conditions.map((c: any) =>
      c && Array.isArray((c as any).conditions)
        ? remapFilter(c, propMap)
        : { ...c, propertyId: propMap.get(c.propertyId) ?? c.propertyId },
    ),
  }
}

/**
 * Rewrite every non-UUID entity id in a persisted state snapshot to a UUID,
 * fixing all cross-references (page parents, block pages, record properties
 * keyed by property id, view filters/sorts, comment threads).
 * Returns the same object when nothing needed rewriting.
 */
export function migrateStateIds<T extends AnyRec>(state: T): { state: T; changed: boolean } {
  const pages: AnyRec[] = Array.isArray(state.pages) ? state.pages : []
  const blocks: AnyRec[] = Array.isArray(state.blocks) ? state.blocks : []
  const databases: AnyRec[] = Array.isArray(state.databases) ? state.databases : []
  const records: AnyRec[] = Array.isArray(state.records) ? state.records : []
  const comments: AnyRec[] = Array.isArray(state.comments) ? state.comments : []
  const activities: AnyRec[] = Array.isArray(state.activities) ? state.activities : []

  const needs =
    [...pages, ...blocks, ...databases, ...records, ...comments].some((e) => e && !isUuid(e.id)) ||
    databases.some((d) => (d.properties ?? []).some((p: any) => !isUuid(p?.id)))
  if (!needs) return { state, changed: false }

  const pageMap = new Map<string, string>()
  const blockMap = new Map<string, string>()
  const dbMap = new Map<string, string>()
  const recordMap = new Map<string, string>()
  const commentMap = new Map<string, string>()
  const propMaps = new Map<string, Map<string, string>>() // dbId -> (oldPropId -> newPropId)

  const fresh = (m: Map<string, string>, oldId: string) => {
    if (!oldId || isUuid(oldId)) return oldId
    let next = m.get(oldId)
    if (!next) { next = newId(); m.set(oldId, next) }
    return next
  }

  for (const p of pages) fresh(pageMap, p.id)
  for (const b of blocks) fresh(blockMap, b.id)
  for (const d of databases) {
    fresh(dbMap, d.id)
    const pm = new Map<string, string>()
    for (const prop of d.properties ?? []) {
      if (prop?.id && !isUuid(prop.id)) pm.set(prop.id, newId())
    }
    propMaps.set(d.id, pm)
  }
  for (const r of records) fresh(recordMap, r.id)
  for (const c of comments) fresh(commentMap, c.id)

  const out: AnyRec = { ...state }
  out.pages = pages.map((p) => ({
    ...p,
    id: fresh(pageMap, p.id),
    parentId: p.parentId ? (pageMap.get(p.parentId) ?? p.parentId) : p.parentId,
  }))
  out.blocks = blocks.map((b) => {
    // Embed blocks (page_embed/database_embed/relation/mention) store the
    // target id as the entire content — rewrite exact matches so embeds survive.
    const raw = typeof b.content === 'string' ? b.content : ''
    const target = pageMap.get(raw) ?? dbMap.get(raw)
    return {
      ...b,
      id: fresh(blockMap, b.id),
      pageId: pageMap.get(b.pageId) ?? b.pageId,
      content: target ?? b.content,
    }
  })
  out.databases = databases.map((d) => {
    const pm = propMaps.get(d.id) ?? new Map()
    const propId = (id: string) => pm.get(id) ?? id
    return {
      ...d,
      id: fresh(dbMap, d.id),
      properties: (d.properties ?? []).map((p: any) => ({
        ...p,
        id: propId(p.id),
        relationDatabaseId: p.relationDatabaseId ? (dbMap.get(p.relationDatabaseId) ?? p.relationDatabaseId) : p.relationDatabaseId,
      })),
      views: (d.views ?? []).map((v: any) => ({
        ...v,
        groupBy: v.groupBy ? propId(v.groupBy) : v.groupBy,
        visibleProperties: Array.isArray(v.visibleProperties) ? v.visibleProperties.map(propId) : v.visibleProperties,
        filter: v.filter ? remapFilter(v.filter, pm) : v.filter,
        sort: Array.isArray(v.sort) ? v.sort.map((s: any) => ({ ...s, propertyId: propId(s.propertyId) })) : v.sort,
      })),
    }
  })
  out.records = records.map((r) => {
    const pm = propMaps.get(r.databaseId) ?? new Map()
    const props: AnyRec = {}
    for (const [k, v] of Object.entries(r.properties ?? {})) {
      // Relation values point at records — rewrite exact id matches.
      const rewriteVal = (val: unknown): unknown => {
        if (typeof val === 'string') return recordMap.get(val) ?? val
        if (Array.isArray(val)) return val.map(rewriteVal)
        return val
      }
      props[pm.get(k) ?? k] = rewriteVal(v)
    }
    return {
      ...r,
      id: fresh(recordMap, r.id),
      databaseId: dbMap.get(r.databaseId) ?? r.databaseId,
      properties: props,
      pageId: r.pageId ? (pageMap.get(r.pageId) ?? r.pageId) : r.pageId,
    }
  })
  out.comments = comments.map((c) => ({
    ...c,
    id: fresh(commentMap, c.id),
    pageId: c.pageId ? (pageMap.get(c.pageId) ?? c.pageId) : c.pageId,
    blockId: c.blockId ? (blockMap.get(c.blockId) ?? c.blockId) : c.blockId,
    recordId: c.recordId ? (recordMap.get(c.recordId) ?? c.recordId) : c.recordId,
    parentId: c.parentId ? (commentMap.get(c.parentId) ?? c.parentId) : c.parentId,
  }))
  out.activities = activities.map((a) => {
    if (!a?.targetId || typeof a.targetId !== 'string') return a
    const t = pageMap.get(a.targetId) ?? blockMap.get(a.targetId) ?? recordMap.get(a.targetId) ?? dbMap.get(a.targetId)
    return t ? { ...a, targetId: t } : a
  })
  if (typeof state.selectedPageId === 'string') out.selectedPageId = pageMap.get(state.selectedPageId) ?? state.selectedPageId
  if (typeof state.selectedDatabaseId === 'string') out.selectedDatabaseId = dbMap.get(state.selectedDatabaseId) ?? state.selectedDatabaseId

  return { state: out as T, changed: true }
}
