import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// In-memory DB with file persistence
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

// Middleware: simple auth stub (header x-user-id)
const authStub = (req:any, _res:any, next:any)=> {
  req.userId = req.headers['x-user-id'] || 'u1'
  next()
}

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
app.get('/health', (_req, res)=> res.json({ ok: true, at: new Date().toISOString() }))

// Workspaces
app.get('/api/workspaces', authStub, (_req, res)=> res.json(db.workspaces))
app.post('/api/workspaces', authStub, (req:any, res)=> {
  const parsed = z.object({ name: z.string().min(1), icon: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const ws = { id: uuid(), name: parsed.data.name, icon: parsed.data.icon, ownerId: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.workspaces.push(ws); saveDB()
  res.status(201).json(ws)
})

// Pages
app.get('/api/pages', authStub, (req, res)=> {
  const workspaceId = req.query.workspaceId as string
  let pages = db.pages
  if (workspaceId) pages = pages.filter(p=> p.workspaceId===workspaceId)
  res.json(pages)
})
app.post('/api/pages', authStub, (req:any, res)=> {
  const parsed = pageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const page = { id: uuid(), ...parsed.data, isFavorite:false, isArchived:false, isTrashed:false, isShared:false, createdBy: (req as any).userId, updatedBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.pages.push(page); saveDB()
  db.activities.unshift({ id: uuid(), workspaceId: page.workspaceId, userId: (req as any).userId, action:'page_created', targetId: page.id, targetType:'page', createdAt: new Date().toISOString() })
  res.status(201).json(page)
})
app.patch('/api/pages/:id', authStub, (req:any, res)=> {
  const page = db.pages.find(p=> p.id===req.params.id)
  if (!page) return res.status(404).json({ error:'Not found' })
  Object.assign(page, req.body, { updatedAt: new Date().toISOString(), updatedBy: (req as any).userId })
  saveDB()
  res.json(page)
})
app.delete('/api/pages/:id', authStub, (req, res)=> {
  const page = db.pages.find(p=> p.id===req.params.id)
  if (!page) return res.status(404).json({ error:'Not found' })
  page.isTrashed = true; page.updatedAt = new Date().toISOString()
  saveDB()
  res.json({ ok:true })
})
app.post('/api/pages/:id/duplicate', authStub, (req, res)=> {
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
app.get('/api/pages/:id/blocks', authStub, (req,res)=> {
  const blocks = db.blocks.filter(b=> b.pageId===req.params.id).sort((a,b)=> a.position-b.position)
  res.json(blocks)
})
app.post('/api/blocks', authStub, (req,res)=> {
  const parsed = blockSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const block = { id: uuid(), ...parsed.data, properties: parsed.data.properties||{}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.blocks.push(block); saveDB()
  res.status(201).json(block)
})
app.patch('/api/blocks/:id', authStub, (req,res)=> {
  const b = db.blocks.find(x=> x.id===req.params.id)
  if (!b) return res.status(404).json({ error:'Not found' })
  Object.assign(b, req.body, { updatedAt: new Date().toISOString() })
  saveDB()
  res.json(b)
})
app.delete('/api/blocks/:id', authStub, (req,res)=> {
  const idx = db.blocks.findIndex(x=> x.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  db.blocks.splice(idx,1); saveDB()
  res.json({ ok:true })
})
app.post('/api/blocks/reorder', authStub, (req,res)=> {
  const { pageId, orderedIds } = req.body as { pageId:string, orderedIds:string[] }
  orderedIds.forEach((id, idx)=> {
    const b = db.blocks.find(x=> x.id===id && x.pageId===pageId)
    if (b) b.position = idx
  })
  saveDB()
  res.json({ ok:true })
})

// Databases
app.get('/api/databases', authStub, (req,res)=> {
  const ws = req.query.workspaceId as string
  let dbs = db.databases
  if (ws) dbs = dbs.filter(d=> d.workspaceId===ws)
  res.json(dbs)
})
app.post('/api/databases', authStub, (req:any,res)=> {
  const schema = z.object({ workspaceId: z.string(), name: z.string().min(1), properties: z.array(z.any()).optional(), views: z.array(z.any()).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const d = { id: uuid(), ...parsed.data, properties: parsed.data.properties||[], views: parsed.data.views||[{ id: uuid(), name:'Table', type:'table'}], createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.databases.push(d); saveDB()
  res.status(201).json(d)
})
app.get('/api/databases/:id/records', authStub, (req,res)=> {
  // Postgres-ready pagination: ?page=1&pageSize=50 mirrors LIMIT/OFFSET.
  // Postgres: SELECT *, COUNT(*) OVER() AS total FROM database_records
  //   WHERE database_id=$1 ORDER BY position, id LIMIT $2 OFFSET $3
  const all = db.records.filter(r=> r.databaseId===req.params.id)
  const pageRaw = req.query.page as string | undefined
  const sizeRaw = req.query.pageSize as string | undefined
  if (pageRaw === undefined && sizeRaw === undefined) return res.json(all)
  const parsed = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }).safeParse({ page: pageRaw ?? 1, pageSize: sizeRaw ?? 50 })
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { page, pageSize } = parsed.data
  const start = (page - 1) * pageSize
  res.json({ rows: all.slice(start, start + pageSize), total: all.length, page, pageSize })
})
app.post('/api/databases/:id/records', authStub, (req:any,res)=> {
  const rec = { id: uuid(), databaseId: req.params.id, properties: req.body.properties||{}, pageId: req.body.pageId, position: db.records.filter(r=> r.databaseId===req.params.id).length, createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.records.push(rec); saveDB()
  res.status(201).json(rec)
})
app.patch('/api/records/:id', authStub, (req,res)=> {
  const r = db.records.find(x=> x.id===req.params.id)
  if (!r) return res.status(404).json({ error:'Not found' })
  r.properties = { ...r.properties, ...(req.body.properties||req.body) }
  if (req.body.pageId !== undefined) r.pageId = req.body.pageId
  r.updatedAt = new Date().toISOString()
  saveDB()
  res.json(r)
})
app.delete('/api/records/:id', authStub, (req,res)=> {
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

// Auth stubs
app.post('/api/auth/login', (req,res)=> {
  res.json({ user: { id:'u1', email:req.body.email||'alex@nexus.so', name:'Alex Rivera' }, token:'demo-token' })
})
app.post('/api/auth/register', (req,res)=> {
  const user = { id: uuid(), email:req.body.email, name:req.body.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.users.push(user); saveDB()
  res.status(201).json({ user, token:'demo-token' })
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

app.listen(PORT, ()=> console.log(`API server listening on http://localhost:${PORT}`))
