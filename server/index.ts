import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { usingPg, pgQuery, mapUser, mapWorkspace, mapPage, mapBlock, mapRecord } from './pg.js'
import { hashPassword, verifyPassword, signToken, authMiddleware } from './auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Persistence: Postgres when DATABASE_URL is set, else JSON file (zero-setup dev).
// Run `npm run db:migrate` once to apply migrations/001 + 002.
const DB_PATH = path.join(process.cwd(), 'server', 'db.json')
type DB = {
  users: any[]
  workspaces: any[]
  pages: any[]
  blocks: any[]
  databases: any[]
  records: any[]
  files: any[]
  comments: any[]
  activities: any[]
}

function loadDB(): DB {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
  } catch {}
  return { users:[], workspaces:[], pages:[], blocks:[], databases:[], records:[], files:[], comments:[], activities:[] }
}
let db: DB = loadDB()
function saveDB() {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive:true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)) } catch(e){ console.error('saveDB', e)}
}

// Middleware: JWT (Bearer) with stub fallback (x-user-id / demo-token)
const authStub = authMiddleware

// Validation schemas
const pageSchema = z.object({
  workspaceId: z.string(),
  parentId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  icon: z.string().max(100).optional(),
  iconType: z.enum(['emoji', 'lucide', 'custom', 'none']).optional(),
  customIcon: z.string().max(3000000).optional(),
  cover: z.string().max(3000000).optional(),
  coverPosition: z.number().min(0).max(100).optional(),
  description: z.string().max(2000).optional(),
  theme: z.string().max(50).optional(),
})

const blockSchema = z.object({
  pageId: z.string(),
  type: z.string(),
  content: z.string(),
  position: z.number(),
  parentId: z.string().nullable().optional(),
  properties: z.record(z.any()).optional(),
})

// Health
app.get('/health', (_req, res)=> res.json({ ok: true, at: new Date().toISOString(), db: usingPg ? 'postgres' : 'json' }))

// Workspaces
app.get('/api/workspaces', authStub, async (_req, res)=> {
  if (usingPg) {
    try { return res.json((await pgQuery('SELECT * FROM workspaces ORDER BY created_at')).map(mapWorkspace)) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json(db.workspaces)
})
app.post('/api/workspaces', authStub, async (req:any, res)=> {
  const parsed = z.object({ name: z.string().min(1), icon: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const rows = await pgQuery('INSERT INTO workspaces(name, icon, owner_id) VALUES ($1,$2,$3) RETURNING *', [parsed.data.name, parsed.data.icon ?? null, (req as any).userId])
      return res.status(201).json(mapWorkspace(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const ws = { id: uuid(), name: parsed.data.name, icon: parsed.data.icon, ownerId: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.workspaces.push(ws); saveDB()
  res.status(201).json(ws)
})

// Pages
app.get('/api/pages', authStub, async (req, res)=> {
  const workspaceId = req.query.workspaceId as string
  if (usingPg) {
    try {
      const rows = workspaceId
        ? await pgQuery('SELECT * FROM pages WHERE workspace_id=$1 ORDER BY updated_at DESC', [workspaceId])
        : await pgQuery('SELECT * FROM pages ORDER BY updated_at DESC')
      return res.json(rows.map(mapPage))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  let pages = db.pages
  if (workspaceId) pages = pages.filter(p=> p.workspaceId===workspaceId)
  res.json(pages)
})
app.post('/api/pages', authStub, async (req:any, res)=> {
  const parsed = pageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const d = parsed.data
      const rows = await pgQuery(
        'INSERT INTO pages(workspace_id, parent_id, title, icon, cover, description, properties) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [d.workspaceId, d.parentId ?? null, d.title, (d as any).icon ?? null, (d as any).cover ?? null, (d as any).description ?? null, JSON.stringify((d as any).properties ?? {})],
      )
      const page = mapPage(rows[0])
      await pgQuery('INSERT INTO activities(workspace_id, user_id, action, target_id, target_type) VALUES ($1,$2,$3,$4,$5)', [page.workspaceId, (req as any).userId, 'page_created', page.id, 'page']).catch(()=>{})
      return res.status(201).json(page)
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const page = { id: uuid(), ...parsed.data, isFavorite:false, isArchived:false, isTrashed:false, isShared:false, createdBy: (req as any).userId, updatedBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.pages.push(page); saveDB()
  db.activities.unshift({ id: uuid(), workspaceId: page.workspaceId, userId: (req as any).userId, action:'page_created', targetId: page.id, targetType:'page', createdAt: new Date().toISOString() })
  res.status(201).json(page)
})
app.patch('/api/pages/:id', authStub, async (req:any, res)=> {
  if (usingPg) {
    try {
      const allowed = ['title','icon','cover','description','properties','is_favorite','is_archived','is_trashed','is_shared','share_mode','parent_id'] as const
      const sets: string[] = []
      const vals: any[] = []
      const body = req.body as Record<string, any>
      // accept both camelCase (client) and snake_case
      const norm: Record<string, any> = {
        title: body.title, icon: body.icon, cover: body.cover, description: body.description,
        properties: body.properties !== undefined ? JSON.stringify(body.properties) : undefined,
        is_favorite: body.isFavorite ?? body.is_favorite, is_archived: body.isArchived ?? body.is_archived,
        is_trashed: body.isTrashed ?? body.is_trashed, is_shared: body.isShared ?? body.is_shared,
        share_mode: body.shareMode ?? body.share_mode, parent_id: body.parentId ?? body.parent_id,
      }
      for (const k of allowed) {
        if (norm[k] !== undefined) { sets.push(`${k}=$${vals.length + 1}`); vals.push(norm[k]) }
      }
      if (sets.length === 0) {
        const rows = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapPage(rows[0]))
      }
      const params: any[] = [...vals]
      params.push((req as any).userId); const byIdx = params.length
      params.push(req.params.id); const idIdx = params.length
      const out = await pgQuery(`UPDATE pages SET ${sets.join(', ')}, updated_at=NOW(), updated_by=$${byIdx} WHERE id=$${idIdx} RETURNING *`, params)
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json(mapPage(out[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const page = db.pages.find(p=> p.id===req.params.id)
  if (!page) return res.status(404).json({ error:'Not found' })
  Object.assign(page, req.body, { updatedAt: new Date().toISOString(), updatedBy: (req as any).userId })
  saveDB()
  res.json(page)
})
app.delete('/api/pages/:id', authStub, async (req, res)=> {
  if (usingPg) {
    try {
      const out = await pgQuery('UPDATE pages SET is_trashed=true, updated_at=NOW() WHERE id=$1 RETURNING id', [req.params.id])
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const page = db.pages.find(p=> p.id===req.params.id)
  if (!page) return res.status(404).json({ error:'Not found' })
  page.isTrashed = true; page.updatedAt = new Date().toISOString()
  saveDB()
  res.json({ ok:true })
})
app.post('/api/pages/:id/duplicate', authStub, async (req, res)=> {
  if (usingPg) {
    try {
      const orig = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
      if (!orig[0]) return res.status(404).json({ error:'Not found' })
      const copy = await pgQuery('INSERT INTO pages(workspace_id, parent_id, title, icon, cover, description, properties, is_favorite, is_archived, is_trashed, is_shared, share_mode, created_by, updated_by) SELECT workspace_id, parent_id, title || \' (copy)\', icon, cover, description, properties, false, false, false, false, share_mode, $2, $2 FROM pages WHERE id=$1 RETURNING *', [req.params.id, (req as any).userId])
      await pgQuery('INSERT INTO blocks(page_id, parent_id, type, content, properties, position) SELECT $1, parent_id, type, content, properties, position FROM blocks WHERE page_id=$2 ORDER BY position', [copy[0].id, req.params.id])
      return res.json(mapPage(copy[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const orig = db.pages.find(p=> p.id===req.params.id)
  if (!orig) return res.status(404).json({ error:'Not found' })
  const copy = { ...orig, id: uuid(), title: orig.title+' (copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.pages.push(copy)
  const blocks = db.blocks.filter(b=> b.pageId===orig.id)
  blocks.forEach(b=> db.blocks.push({ ...b, id: uuid(), pageId: copy.id }))
  saveDB()
  res.json(copy)
})

// Blocks
app.get('/api/pages/:id/blocks', authStub, async (req,res)=> {
  if (usingPg) {
    try { return res.json((await pgQuery('SELECT * FROM blocks WHERE page_id=$1 ORDER BY position, id', [req.params.id])).map(mapBlock)) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const blocks = db.blocks.filter(b=> b.pageId===req.params.id).sort((a,b)=> a.position-b.position)
  res.json(blocks)
})
app.post('/api/blocks', authStub, async (req,res)=> {
  const parsed = blockSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const rows = await pgQuery('INSERT INTO blocks(page_id, parent_id, type, content, properties, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [parsed.data.pageId, parsed.data.parentId ?? null, parsed.data.type, parsed.data.content, JSON.stringify(parsed.data.properties ?? {}), parsed.data.position])
      return res.status(201).json(mapBlock(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const block = { id: uuid(), ...parsed.data, properties: parsed.data.properties||{}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.blocks.push(block); saveDB()
  res.status(201).json(block)
})
app.patch('/api/blocks/:id', authStub, async (req,res)=> {
  if (usingPg) {
    try {
      const b = req.body as Record<string, any>
      const sets: string[] = []
      const vals: any[] = []
      if (b.content !== undefined) { vals.push(b.content); sets.push(`content=$${vals.length}`) }
      if (b.type !== undefined) { vals.push(b.type); sets.push(`type=$${vals.length}`) }
      if (b.position !== undefined) { vals.push(b.position); sets.push(`position=$${vals.length}`) }
      if (b.parentId !== undefined || b.parent_id !== undefined) { vals.push(b.parentId ?? b.parent_id); sets.push(`parent_id=$${vals.length}`) }
      if (b.properties !== undefined) { vals.push(JSON.stringify(b.properties)); sets.push(`properties=$${vals.length}`) }
      if (sets.length === 0) {
        const rows = await pgQuery('SELECT * FROM blocks WHERE id=$1', [req.params.id])
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
        return res.json(mapBlock(rows[0]))
      }
      vals.push(req.params.id)
      const rows = await pgQuery(`UPDATE blocks SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
      if (!rows[0]) return res.status(404).json({ error:'Not found' })
      return res.json(mapBlock(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const b = db.blocks.find(x=> x.id===req.params.id)
  if (!b) return res.status(404).json({ error:'Not found' })
  Object.assign(b, req.body, { updatedAt: new Date().toISOString() })
  saveDB()
  res.json(b)
})
app.delete('/api/blocks/:id', authStub, async (req,res)=> {
  if (usingPg) {
    try {
      const out = await pgQuery('DELETE FROM blocks WHERE id=$1 RETURNING id', [req.params.id])
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const idx = db.blocks.findIndex(x=> x.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  db.blocks.splice(idx,1); saveDB()
  res.json({ ok:true })
})
app.post('/api/blocks/reorder', authStub, async (req,res)=> {
  const { pageId, orderedIds } = req.body as { pageId:string, orderedIds:string[] }
  if (usingPg) {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await pgQuery('UPDATE blocks SET position=$1, updated_at=NOW() WHERE id=$2 AND page_id=$3', [i, orderedIds[i], pageId])
      }
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  orderedIds.forEach((id, idx)=> {
    const b = db.blocks.find(x=> x.id===id && x.pageId===pageId)
    if (b) b.position = idx
  })
  saveDB()
  res.json({ ok:true })
})

// Databases
app.get('/api/databases', authStub, async (req,res)=> {
  const ws = req.query.workspaceId as string
  if (usingPg) {
    try {
      const rows = ws
        ? await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d WHERE workspace_id=$1 ORDER BY updated_at DESC', [ws])
        : await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d ORDER BY updated_at DESC')
      return res.json(rows.map((d: any) => ({
        id: d.id, workspaceId: d.workspace_id, pageId: d.page_id ?? undefined, name: d.name, icon: d.icon, description: d.description,
        properties: (d.props ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? undefined, relationDatabaseId: p.relation_database_id ?? undefined, width: p.width ?? undefined, visible: p.visible ?? true })),
        views: (d.views ?? []).map((v: any) => ({ id: v.id, name: v.name, type: v.type, filter: v.filter ?? undefined, sort: v.sort ?? undefined, groupBy: v.group_by ?? undefined, visibleProperties: v.visible_properties ?? undefined })),
        createdBy: d.created_by, createdAt: d.created_at, updatedAt: d.updated_at,
      })))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const wsq = req.query.workspaceId as string
  let dbs = db.databases
  if (wsq) dbs = dbs.filter(d=> d.workspaceId===wsq)
  res.json(dbs)
})
app.post('/api/databases', authStub, async (req:any,res)=> {
  const schema = z.object({ workspaceId: z.string(), name: z.string().min(1), properties: z.array(z.any()).optional(), views: z.array(z.any()).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const d = await pgQuery('INSERT INTO databases(workspace_id, name, created_by) VALUES ($1,$2,$3) RETURNING *', [parsed.data.workspaceId, parsed.data.name, (req as any).userId])
      const dbId = (d[0] as any).id
      for (const p of parsed.data.properties ?? []) {
        await pgQuery('INSERT INTO database_properties(database_id, name, type, options, relation_database_id, width, visible) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [dbId, p.name, p.type, p.options ? JSON.stringify(p.options) : null, p.relationDatabaseId ?? null, p.width ?? null, p.visible ?? true])
      }
      const views = parsed.data.views?.length ? parsed.data.views : [{ name: 'Table', type: 'table' }]
      for (const v of views) {
        await pgQuery('INSERT INTO database_views(database_id, name, type, filter, sort, group_by, visible_properties) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [dbId, v.name, v.type, v.filter ? JSON.stringify(v.filter) : null, v.sort ? JSON.stringify(v.sort) : null, v.groupBy ?? null, v.visibleProperties ? JSON.stringify(v.visibleProperties) : null])
      }
      const out = await pgQuery('SELECT * FROM databases WHERE id=$1', [dbId])
      return res.status(201).json({ id: out[0].id, workspaceId: out[0].workspace_id, name: out[0].name, properties: parsed.data.properties ?? [], views, createdBy: out[0].created_by, createdAt: out[0].created_at, updatedAt: out[0].updated_at })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const d = { id: uuid(), ...parsed.data, properties: parsed.data.properties||[], views: parsed.data.views||[{ id: uuid(), name:'Table', type:'table'}], createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.databases.push(d); saveDB()
  res.status(201).json(d)
})
app.get('/api/databases/:id/records', authStub, async (req,res)=> {
  // Pagination contract (both backends): ?page&pageSize → {rows,total,page,pageSize},
  // else bare array. Postgres: COUNT(*) OVER() + LIMIT/OFFSET, stable ORDER BY.
  const pageRaw = req.query.page as string | undefined
  const sizeRaw = req.query.pageSize as string | undefined
  const paginated = pageRaw !== undefined || sizeRaw !== undefined
  const parsed = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }).safeParse({ page: pageRaw ?? 1, pageSize: sizeRaw ?? 50 })
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { page, pageSize } = parsed.data
  if (usingPg) {
    try {
      if (!paginated) {
        const rows = await pgQuery('SELECT * FROM database_records WHERE database_id=$1 ORDER BY position NULLS LAST, id', [req.params.id])
        return res.json(rows.map(mapRecord))
      }
      const rows = await pgQuery(
        'SELECT *, COUNT(*) OVER() AS total FROM database_records WHERE database_id=$1 ORDER BY position NULLS LAST, id LIMIT $2 OFFSET $3',
        [req.params.id, pageSize, (page - 1) * pageSize],
      )
      const total = rows[0] ? Number((rows[0] as any).total) : 0
      return res.json({ rows: rows.map(mapRecord), total, page, pageSize })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const all = db.records.filter(r=> r.databaseId===req.params.id)
  if (!paginated) return res.json(all)
  const start = (page - 1) * pageSize
  res.json({ rows: all.slice(start, start + pageSize), total: all.length, page, pageSize })
})
app.post('/api/databases/:id/records', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const cnt = await pgQuery('SELECT COUNT(*) AS n FROM database_records WHERE database_id=$1', [req.params.id])
      const pos = Number((cnt[0] as any)?.n ?? 0)
      const rows = await pgQuery('INSERT INTO database_records(database_id, properties, page_id, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.id, JSON.stringify(req.body.properties ?? {}), req.body.pageId ?? null, pos, (req as any).userId])
      return res.status(201).json(mapRecord(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const rec = { id: uuid(), databaseId: req.params.id, properties: req.body.properties||{}, pageId: req.body.pageId, position: db.records.filter(r=> r.databaseId===req.params.id).length, createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.records.push(rec); saveDB()
  res.status(201).json(rec)
})
app.patch('/api/records/:id', authStub, async (req,res)=> {
  if (usingPg) {
    try {
      const props = req.body.properties ?? req.body
      const rows = await pgQuery(
        'UPDATE database_records SET properties = properties || $1::jsonb, page_id = COALESCE($2, page_id), updated_at=NOW() WHERE id=$3 RETURNING *',
        [JSON.stringify(props), req.body.pageId ?? null, req.params.id],
      )
      if (!rows[0]) return res.status(404).json({ error:'Not found' })
      return res.json(mapRecord(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const r = db.records.find(x=> x.id===req.params.id)
  if (!r) return res.status(404).json({ error:'Not found' })
  r.properties = { ...r.properties, ...(req.body.properties||req.body) }
  if (req.body.pageId !== undefined) r.pageId = req.body.pageId
  r.updatedAt = new Date().toISOString()
  saveDB()
  res.json(r)
})
app.delete('/api/records/:id', authStub, async (req,res)=> {
  if (usingPg) {
    try {
      const out = await pgQuery('DELETE FROM database_records WHERE id=$1 RETURNING id', [req.params.id])
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const idx = db.records.findIndex(x=> x.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  db.records.splice(idx,1); saveDB()
  res.json({ ok:true })
})

// Search
app.get('/api/search', authStub, (req,res)=> {
  const q = (req.query.q as string||'').toLowerCase()
  if (!q) return res.json([])
  const pages = db.pages.filter(p=> p.title.toLowerCase().includes(q)).slice(0,5).map(p=> ({ id:p.id, title:p.title, type:'page', breadcrumb:'', updatedAt:p.updatedAt }))
  const blocks = db.blocks.filter(b=> b.content.toLowerCase().includes(q)).slice(0,5).map(b=> ({ id:b.id, title:b.content.slice(0,40), type:'block', snippet:b.content.slice(0,80), updatedAt:b.updatedAt }))
  res.json([...pages, ...blocks])
})

// Comments
app.get('/api/comments', (req,res)=> {
  const pageId = req.query.pageId as string
  let c = db.comments
  if (pageId) c = c.filter(x=> x.pageId===pageId)
  res.json(c)
})
app.post('/api/comments', authStub, (req:any,res)=> {
  const c = { id: uuid(), ...req.body, authorId: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.comments.push(c); saveDB()
  res.status(201).json(c)
})

// Files (stub)
app.post('/api/files', authStub, (req:any,res)=> {
  const f = { id: uuid(), filename: req.body.filename||'file', mimeType: req.body.mimeType||'application/octet-stream', size: req.body.size||0, storageKey:`files/${uuid()}`, uploadedBy: (req as any).userId, createdAt: new Date().toISOString() }
  db.files.push(f); saveDB()
  res.status(201).json(f)
})

// Activities
app.get('/api/activities', (req,res)=> {
  const ws = req.query.workspaceId as string
  let acts = db.activities
  if (ws) acts = acts.filter(a=> a.workspaceId===ws)
  res.json(acts.slice(0,20))
})

// Auth: bcrypt + JWT when Postgres is configured, stub-compatible otherwise.
// Login accepts legacy users without password_hash (returns demo-token path);
// new registrations always store bcrypt hashes. Clients send
// `Authorization: Bearer <jwt>`; `demo-token` + `x-user-id` still works.
app.post('/api/auth/login', async (req,res)=> {
  const parsed = z.object({ email: z.string().email(), password: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { email, password } = parsed.data
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])
      const u = rows[0] as any
      if (!u) return res.status(401).json({ error: 'Invalid credentials' })
      if (u.password_hash) {
        if (!password || !(await verifyPassword(password, u.password_hash))) {
          return res.status(401).json({ error: 'Invalid credentials' })
        }
        return res.json({ user: mapUser(u), token: signToken(u.id) })
      }
      // legacy row without hash (seeded before bcrypt): allow, then set hash if provided
      if (password) {
        const hash = await hashPassword(password)
        await pgQuery('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, u.id])
        return res.json({ user: mapUser(u), token: signToken(u.id) })
      }
      return res.json({ user: mapUser(u), token: 'demo-token' })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const user = db.users.find((x: any) => x.email === email)
  if (user && (user as any).passwordHash) {
    if (!password || !(await verifyPassword(password, (user as any).passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    return res.json({ user, token: signToken(user.id) })
  }
  res.json({ user: user ?? { id:'u1', email, name:'Alex Rivera' }, token:'demo-token' })
})
app.post('/api/auth/register', async (req,res)=> {
  const parsed = z.object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(8).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { email, name, password } = parsed.data
  const hash = password ? await hashPassword(password) : null
  if (usingPg) {
    try {
      const existing = await pgQuery('SELECT id FROM users WHERE email=$1', [email.toLowerCase()])
      if (existing[0]) return res.status(409).json({ error: 'Email already registered' })
      const rows = await pgQuery('INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING *', [email.toLowerCase(), name, hash])
      const user = mapUser(rows[0])
      return res.status(201).json({ user, token: hash ? signToken(user.id) : 'demo-token' })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  if (db.users.some((x: any) => x.email === email)) return res.status(409).json({ error: 'Email already registered' })
  const user = { id: uuid(), email, name, passwordHash: hash, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.users.push(user); saveDB()
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name }, token: hash ? signToken(user.id) : 'demo-token' })
})

// Notifications
app.get('/api/notifications', authStub, (req:any,res)=> {
  res.json([
    { id: uuid(), userId: (req as any).userId, type:'mention', title:'You were mentioned in Website Redesign', read:false, createdAt: new Date().toISOString() }
  ])
})

// Templates
app.get('/api/templates', (_req,res)=> {
  res.json([
    { id: uuid(), name:'Project', category:'Work', icon:'◈', description:'Kick off a new project' },
    { id: uuid(), name:'Meeting Notes', category:'Work', icon:'◐', description:'Structured notes' },
  ])
})

// AI stub
app.post('/api/ai/generate', async (req,res)=> {
  const { prompt, task } = req.body
  await new Promise(r=> setTimeout(r, 500))
  res.json({ result: `✨ [${task||'default'}] Simulated AI response for: "${String(prompt).slice(0,100)}"\n\nThis is a stub. Configure provider in Settings → AI.` })
})

// Error handler
app.use((err:any,_req:any,res:any,_next:any)=> {
  console.error(err)
  res.status(500).json({ error:'Internal server error', details: String(err?.message||err) })
})

// Serve frontend in production
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(path.join(__dirname,'..','dist')))

app.listen(PORT, ()=> console.log(`API server listening on http://localhost:${PORT} (db: ${usingPg ? 'postgres' : 'json'})`))
