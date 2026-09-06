import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import crypto from 'crypto'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { usingPg, pgQuery, pgOk, mapUser, mapWorkspace, mapPage, mapBlock, mapRecord, mapFile, mapComment, mapActivity, mapNotification } from './pg.js'
import { hashPassword, verifyPassword, signToken, authMiddleware } from './auth.js'
import { canDoPageAction, resolveWorkspaceRole, allowLegacyOpenAccess, minimumRoleForPagePatch, type Role, type PageAction } from './acl.js'
import { getCorsOrigin, generalLimiter, authLimiter, aiLimiter, validateFileInput, sanitizeFilename, MAX_BLOCK_CONTENT, MAX_COMMENT_CONTENT, MAX_AI_PROMPT, jwtSecretIsDefault } from './security.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.disable('x-powered-by')
// Trust one proxy hop (Render/Fly/Nginx) so rate limiting sees the real IP.
app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Editor embeds user images/video via blob:/data: URLs.
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'data:', 'blob:'],
    },
  },
}))
app.use(cors({ origin: getCorsOrigin() }))
app.use(express.json({ limit: '10mb' }))
app.use(generalLimiter)

if (process.env.NODE_ENV === 'production' && jwtSecretIsDefault()) {
  console.warn('[security] JWT_SECRET is unset or default — set a long random value in production.')
}

// Persistence: Postgres when DATABASE_URL is set, else JSON file (zero-setup dev).
// Run `npm run db:migrate` once to apply migrations/001 through 006.
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
  notifications: any[]
  shares: any[]
}

function loadDB(): DB {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
      if (!Array.isArray(parsed.notifications)) parsed.notifications = []
      return parsed
    }
  } catch {}
  return { users:[], workspaces:[], pages:[], blocks:[], databases:[], records:[], files:[], comments:[], activities:[], notifications:[], shares:[] }
}
let db: DB = loadDB()
if (!Array.isArray((db as any).shares)) (db as any).shares = []
if (!Array.isArray((db as any).notifications)) (db as any).notifications = []
function saveDB() {
  try { fs.mkdirSync(path.dirname(DB_PATH), { recursive:true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)) } catch(e){ console.error('saveDB', e)}
}

// Middleware: JWT (Bearer) with stub fallback (x-user-id / demo-token)
const authStub = authMiddleware

// --- Slice 4: per-user workspace ACL (v1) ---
// Resolves the caller's role in a workspace. Legacy single-user workspaces
// with zero explicit members stay open (editor-equivalent) so zero-setup dev,
// existing seeds, and old clients keep working. Returns null when the
// workspace doesn't exist (callers → 404) or when membership is required
// but missing (callers → 403).
async function getWorkspaceRole(workspaceId: string | null | undefined, userId: string): Promise<{ role: Role | null, missing: boolean }> {
  if (!workspaceId) return { role: null, missing: true }
  if (usingPg) {
    try {
      const ws = await pgQuery('SELECT owner_id FROM workspaces WHERE id=$1', [workspaceId])
      if (!ws[0]) return { role: null, missing: true }
      const member = await pgQuery('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, userId]).catch(() => [])
      const role = resolveWorkspaceRole(userId, (ws[0] as any).owner_id, (member[0] as any)?.role ?? null)
      if (role) return { role, missing: false }
      const cnt = await pgQuery('SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id=$1', [workspaceId]).catch(() => [{ n: 0 }])
      if (allowLegacyOpenAccess(Number((cnt[0] as any)?.n ?? 0))) return { role: 'editor', missing: false }
      return { role: null, missing: false }
    } catch {
      return { role: 'editor', missing: false }
    }
  }
  const ws = db.workspaces.find((w: any) => w.id === workspaceId)
  if (!ws) return { role: null, missing: true }
  const role = resolveWorkspaceRole(userId, ws.ownerId, null)
  if (role) return { role, missing: false }
  return { role: 'editor', missing: false }
}

async function workspaceIdForPage(pageId: string | null | undefined): Promise<string | null> {
  if (!pageId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT workspace_id FROM pages WHERE id=$1', [pageId])
      return ((rows[0] as any)?.workspace_id as string) ?? null
    } catch { return null }
  }
  return (db.pages.find((p: any) => p.id === pageId)?.workspaceId as string) ?? null
}

async function workspaceIdForBlock(blockId: string | null | undefined): Promise<string | null> {
  if (!blockId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT page_id FROM blocks WHERE id=$1', [blockId])
      const pageId = (rows[0] as any)?.page_id as string | undefined
      return workspaceIdForPage(pageId ?? null)
    } catch { return null }
  }
  const pageId = db.blocks.find((b: any) => b.id === blockId)?.pageId
  return workspaceIdForPage(pageId ?? null)
}

async function workspaceIdForDatabase(dbId: string | null | undefined): Promise<string | null> {
  if (!dbId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT workspace_id FROM databases WHERE id=$1', [dbId])
      return ((rows[0] as any)?.workspace_id as string) ?? null
    } catch { return null }
  }
  return (db.databases.find((d: any) => d.id === dbId)?.workspaceId as string) ?? null
}

async function workspaceIdForRecord(recordId: string | null | undefined): Promise<string | null> {
  if (!recordId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT database_id FROM database_records WHERE id=$1', [recordId])
      const dbId = (rows[0] as any)?.database_id as string | undefined
      return workspaceIdForDatabase(dbId ?? null)
    } catch { return null }
  }
  const dbId = db.records.find((r: any) => r.id === recordId)?.databaseId
  return workspaceIdForDatabase(dbId ?? null)
}

// Workspaces the caller may see: owned, explicitly membered, or legacy-open
// (zero members — single-user dev workspaces stay usable without invites).
async function accessibleWorkspaceIds(userId: string): Promise<Set<string>> {
  if (usingPg) {
    try {
      const owned = await pgQuery('SELECT id FROM workspaces WHERE owner_id=$1', [userId])
      const membered = await pgQuery('SELECT workspace_id AS id FROM workspace_members WHERE user_id=$1', [userId])
      const open = await pgQuery(
        'SELECT w.id FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id)',
      ).catch(() => [])
      return new Set([...owned, ...membered, ...open].map((r: any) => String(r.id ?? r.workspace_id)))
    } catch { return new Set() }
  }
  // JSON fallback has no workspace_members table, so every workspace is
  // legacy-open (visible to all authenticated callers). Real membership
  // hiding applies on the Postgres path once members rows exist.
  return new Set(db.workspaces.map((w: any) => String(w.id)))
}

// Enforce a page-action minimum inside a workspace. Sends 404 (unknown
// workspace) or 403 (not a member / role too low) and returns null, else the
// caller's role. Legacy-open workspaces resolve every caller to 'editor'.
async function requireWorkspaceAction(
  res: any, workspaceId: string | null | undefined, userId: string, action: PageAction,
): Promise<Role | null> {
  const { role, missing } = await getWorkspaceRole(workspaceId, userId)
  if (missing) { res.status(404).json({ error: 'Workspace not found' }); return null }
  if (!role || !canDoPageAction(role, action)) { res.status(403).json({ error: 'Insufficient permission' }); return null }
  return role
}

const isUuidLike = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Validation schemas
const uuidOrAbsent = z.string().uuid().optional()
const pageSchema = z.object({
  id: uuidOrAbsent,
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
  id: uuidOrAbsent,
  pageId: z.string(),
  type: z.string(),
  content: z.string().max(MAX_BLOCK_CONTENT),
  position: z.number(),
  parentId: z.string().nullable().optional(),
  properties: z.record(z.any()).optional(),
})

// Health — db is the configured backend; dbOk is live reachability
// (false + fast beats hanging when DATABASE_URL points nowhere).
app.get('/health', async (_req, res)=> {
  const dbOk = await pgOk()
  res.json({ ok: true, at: new Date().toISOString(), db: usingPg ? 'postgres' : 'json', dbOk })
})

// Workspaces — list only what the caller can access (owned, membered,
// or legacy-open). Creating is open to any authenticated user (they become
// owner via owner_id).
app.get('/api/workspaces', authStub, async (req:any, res)=> {
  const allowed = await accessibleWorkspaceIds((req as any).userId)
  if (usingPg) {
    try { return res.json((await pgQuery('SELECT * FROM workspaces ORDER BY created_at')).map(mapWorkspace).filter((w: any)=> allowed.has(String(w.id)))) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json(db.workspaces.filter((w: any)=> allowed.has(String(w.id))))
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

// Workspace members — per-user ACL backing (slice 4).
// Owner + admins manage; any member can list. Legacy open workspaces
// (zero members) skip checks so single-user flows keep working.
app.get('/api/workspaces/:id/members', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT id, workspace_id, user_id, role, joined_at FROM workspace_members WHERE workspace_id=$1 ORDER BY joined_at', [req.params.id])
      return res.json(rows.map((r: any)=> ({ id: r.id, workspaceId: r.workspace_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at })))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json([])
})
app.post('/api/workspaces/:id/members', authStub, async (req:any,res)=> {
  const parsed = z.object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'editor', 'commenter', 'viewer']).default('editor'),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (!parsed.data.userId && !parsed.data.email) return res.status(400).json({ error: 'userId or email is required' })
  const { role: callerRole, missing } = await getWorkspaceRole(req.params.id, (req as any).userId)
  if (missing) return res.status(404).json({ error: 'Workspace not found' })
  if (!callerRole || !(callerRole === 'owner' || callerRole === 'admin')) {
    // Legacy open workspace: first invite is allowed to bootstrap membership.
    if (callerRole !== 'editor') return res.status(403).json({ error: 'Only owners/admins can invite members' })
  }
  if (usingPg) {
    try {
      let targetId = parsed.data.userId ?? null
      if (!targetId && parsed.data.email) {
        const u = await pgQuery('SELECT id FROM users WHERE email=$1', [parsed.data.email.toLowerCase()])
        if (!u[0]) return res.status(404).json({ error: 'User not found' })
        targetId = (u[0] as any).id
      }
      const rows = await pgQuery(
        'INSERT INTO workspace_members(workspace_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role=EXCLUDED.role RETURNING id, workspace_id, user_id, role, joined_at',
        [req.params.id, targetId, parsed.data.role],
      )
      const r: any = rows[0]
      return res.status(201).json({ id: r.id, workspaceId: r.workspace_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.status(201).json({ id: uuid(), workspaceId: req.params.id, userId: parsed.data.userId ?? parsed.data.email, role: parsed.data.role, joinedAt: new Date().toISOString() })
})

// Pages — reads need viewer+, writes editor+, sharing changes + deletes admin.
// Unfiltered lists are scoped to accessible workspaces (never cross-workspace).
app.get('/api/pages', authStub, async (req:any, res)=> {
  const workspaceId = req.query.workspaceId as string | undefined
  const userId = (req as any).userId as string
  if (workspaceId) {
    if (!await requireWorkspaceAction(res, workspaceId, userId, 'view')) return
    if (usingPg) {
      try {
        const rows = await pgQuery('SELECT * FROM pages WHERE workspace_id=$1 ORDER BY updated_at DESC', [workspaceId])
        return res.json(rows.map(mapPage))
      } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
    }
    return res.json(db.pages.filter(p=> p.workspaceId===workspaceId))
  }
  const allowed = await accessibleWorkspaceIds(userId)
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT * FROM pages ORDER BY updated_at DESC')
      return res.json(rows.map(mapPage).filter((p: any)=> allowed.has(String(p.workspaceId))))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json(db.pages.filter((p: any)=> allowed.has(String(p.workspaceId))))
})
app.post('/api/pages', authStub, async (req:any, res)=> {
  const parsed = pageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (!await requireWorkspaceAction(res, parsed.data.workspaceId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const d = parsed.data
      const withId = !!d.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO pages(id, workspace_id, parent_id, title, icon, cover, description, properties, theme) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *'
          : 'INSERT INTO pages(workspace_id, parent_id, title, icon, cover, description, properties, theme) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        withId
          ? [d.id, d.workspaceId, d.parentId ?? null, d.title, (d as any).icon ?? null, (d as any).cover ?? null, (d as any).description ?? null, JSON.stringify((d as any).properties ?? {}), (d as any).theme ?? 'default']
          : [d.workspaceId, d.parentId ?? null, d.title, (d as any).icon ?? null, (d as any).cover ?? null, (d as any).description ?? null, JSON.stringify((d as any).properties ?? {}), (d as any).theme ?? 'default'],
      )
      const page = mapPage(rows[0])
      await pgQuery('INSERT INTO activities(workspace_id, user_id, action, target_id, target_type) VALUES ($1,$2,$3,$4,$5)', [page.workspaceId, (req as any).userId, 'page_created', page.id, 'page']).catch(()=>{})
      return res.status(201).json(page)
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const page = { ...parsed.data, id: parsed.data.id ?? uuid(), isFavorite:false, isArchived:false, isTrashed:false, isShared:false, createdBy: (req as any).userId, updatedBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.pages.push(page); saveDB()
  db.activities.unshift({ id: uuid(), workspaceId: page.workspaceId, userId: (req as any).userId, action:'page_created', targetId: page.id, targetType:'page', createdAt: new Date().toISOString() })
  res.status(201).json(page)
})
app.patch('/api/pages/:id', authStub, async (req:any, res)=> {
  const wsId = await workspaceIdForPage(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  // Sharing/visibility changes need admin (share), content edits need editor.
  const action: PageAction = minimumRoleForPagePatch(req.body as Record<string, unknown>) === 'admin' ? 'share' : 'edit'
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, action)) return
  if (usingPg) {
    try {
      const allowed = ['title','icon','cover','description','properties','theme','is_favorite','is_archived','is_trashed','is_shared','share_mode','parent_id'] as const
      const sets: string[] = []
      const vals: any[] = []
      const body = req.body as Record<string, any>
      // accept both camelCase (client) and snake_case
      const norm: Record<string, any> = {
        title: body.title, icon: body.icon, cover: body.cover, description: body.description, theme: body.theme,
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
app.delete('/api/pages/:id', authStub, async (req:any, res)=> {
  const wsId = await workspaceIdForPage(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'delete')) return
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
app.post('/api/pages/:id/duplicate', authStub, async (req:any, res)=> {
  const wsId = await workspaceIdForPage(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const orig = await pgQuery('SELECT * FROM pages WHERE id=$1', [req.params.id])
      if (!orig[0]) return res.status(404).json({ error:'Not found' })
      const copy = await pgQuery('INSERT INTO pages(workspace_id, parent_id, title, icon, cover, description, properties, theme, is_favorite, is_archived, is_trashed, is_shared, share_mode, created_by, updated_by) SELECT workspace_id, parent_id, title || \' (copy)\', icon, cover, description, properties, theme, false, false, false, false, share_mode, $2, $2 FROM pages WHERE id=$1 RETURNING *', [req.params.id, (req as any).userId])
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

// Blocks — reads need viewer+, all writes need editor+ in the owning workspace.
app.get('/api/pages/:id/blocks', authStub, async (req:any,res)=> {
  const wsId = await workspaceIdForPage(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'view')) return
  if (usingPg) {
    try { return res.json((await pgQuery('SELECT * FROM blocks WHERE page_id=$1 ORDER BY position, id', [req.params.id])).map(mapBlock)) } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const blocks = db.blocks.filter(b=> b.pageId===req.params.id).sort((a,b)=> a.position-b.position)
  res.json(blocks)
})
app.post('/api/blocks', authStub, async (req:any,res)=> {
  const parsed = blockSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const wsId = await workspaceIdForPage(parsed.data.pageId)
  if (!wsId) return res.status(404).json({ error: 'Page not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const withId = !!parsed.data.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO blocks(id, page_id, parent_id, type, content, properties, position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *'
          : 'INSERT INTO blocks(page_id, parent_id, type, content, properties, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        withId
          ? [parsed.data.id, parsed.data.pageId, parsed.data.parentId ?? null, parsed.data.type, parsed.data.content, JSON.stringify(parsed.data.properties ?? {}), parsed.data.position]
          : [parsed.data.pageId, parsed.data.parentId ?? null, parsed.data.type, parsed.data.content, JSON.stringify(parsed.data.properties ?? {}), parsed.data.position])
      return res.status(201).json(mapBlock(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const block = { ...parsed.data, id: parsed.data.id ?? uuid(), properties: parsed.data.properties||{}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.blocks.push(block); saveDB()
  res.status(201).json(block)
})
app.patch('/api/blocks/:id', authStub, async (req:any,res)=> {
  if (typeof (req.body as any)?.content === 'string' && (req.body as any).content.length > MAX_BLOCK_CONTENT) {
    return res.status(400).json({ error: `content too large (max ${MAX_BLOCK_CONTENT} chars)` })
  }
  const wsId = await workspaceIdForBlock(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
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
app.delete('/api/blocks/:id', authStub, async (req:any,res)=> {
  const wsId = await workspaceIdForBlock(req.params.id)
  if (!wsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
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
app.post('/api/blocks/reorder', authStub, async (req:any,res)=> {
  const { pageId, orderedIds } = req.body as { pageId:string, orderedIds:string[] }
  const wsId = await workspaceIdForPage(pageId)
  if (!wsId) return res.status(404).json({ error: 'Page not found' })
  if (!await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
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

// Databases — reads need viewer+, schema writes editor+, deletes admin.
// Unfiltered lists are scoped to accessible workspaces (never cross-workspace).
app.get('/api/databases', authStub, async (req:any,res)=> {
  const ws = req.query.workspaceId as string | undefined
  const userId = (req as any).userId as string
  if (ws) {
    if (!await requireWorkspaceAction(res, ws, userId, 'view')) return
  }
  const allowed = ws ? null : await accessibleWorkspaceIds(userId)
  if (usingPg) {
    try {
      const rows = ws
        ? await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d WHERE workspace_id=$1 ORDER BY updated_at DESC', [ws])
        : await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d ORDER BY updated_at DESC')
      return res.json(rows.map((d: any) => ({
        id: d.id, workspaceId: d.workspace_id, pageId: d.page_id ?? undefined, name: d.name, icon: d.icon, description: d.description,
        isFavorite: d.is_favorite ?? false,
        properties: (d.props ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? undefined, relationDatabaseId: p.relation_database_id ?? undefined, width: p.width ?? undefined, visible: p.visible ?? true })),
        views: (d.views ?? []).map((v: any) => ({ id: v.id, name: v.name, type: v.type, filter: v.filter ?? undefined, sort: v.sort ?? undefined, groupBy: v.group_by ?? undefined, visibleProperties: v.visible_properties ?? undefined })),
        createdBy: d.created_by, createdAt: d.created_at, updatedAt: d.updated_at,
      })).filter((d: any)=> !allowed || allowed.has(String(d.workspaceId))))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const wsq = req.query.workspaceId as string
  let dbs = db.databases
  if (wsq) dbs = dbs.filter(d=> d.workspaceId===wsq)
  else if (allowed) dbs = dbs.filter((d: any)=> allowed.has(String(d.workspaceId)))
  res.json(dbs)
})
app.post('/api/databases', authStub, async (req:any,res)=> {
  const schema = z.object({ id: uuidOrAbsent, workspaceId: z.string(), name: z.string().min(1).max(100), icon: z.string().max(50).optional(), description: z.string().max(2000).optional(), properties: z.array(z.any()).optional(), views: z.array(z.any()).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (!await requireWorkspaceAction(res, parsed.data.workspaceId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const withId = !!parsed.data.id
      const d = await pgQuery(
        withId
          ? 'INSERT INTO databases(id, workspace_id, name, icon, description, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *'
          : 'INSERT INTO databases(workspace_id, name, icon, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        withId
          ? [parsed.data.id, parsed.data.workspaceId, parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, (req as any).userId]
          : [parsed.data.workspaceId, parsed.data.name, parsed.data.icon ?? null, parsed.data.description ?? null, (req as any).userId])
      const dbId = (d[0] as any).id
      for (const p of parsed.data.properties ?? []) {
        await pgQuery('INSERT INTO database_properties(id, database_id, name, type, options, relation_database_id, width, visible) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
          [isUuidLike(p.id) ? p.id : null, dbId, p.name, p.type, p.options ? JSON.stringify(p.options) : null, p.relationDatabaseId ?? null, p.width ?? null, p.visible ?? true])
      }
      const views = parsed.data.views?.length ? parsed.data.views : [{ name: 'Table', type: 'table' }]
      for (const v of views) {
        await pgQuery('INSERT INTO database_views(id, database_id, name, type, filter, sort, group_by, visible_properties) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
          [isUuidLike(v.id) ? v.id : null, dbId, v.name, v.type, v.filter ? JSON.stringify(v.filter) : null, v.sort ? JSON.stringify(v.sort) : null, v.groupBy ?? null, v.visibleProperties ? JSON.stringify(v.visibleProperties) : null])
      }
      const full = await pgQuery('SELECT d.*, (SELECT json_agg(p.*) FROM database_properties p WHERE p.database_id=d.id) AS props, (SELECT json_agg(v.*) FROM database_views v WHERE v.database_id=d.id) AS views FROM databases d WHERE d.id=$1', [dbId])
      const fd: any = full[0]
      return res.status(201).json({
        id: fd.id, workspaceId: fd.workspace_id, name: fd.name, icon: fd.icon, description: fd.description, isFavorite: fd.is_favorite ?? false,
        properties: (fd.props ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, options: p.options ?? undefined, relationDatabaseId: p.relation_database_id ?? undefined, width: p.width ?? undefined, visible: p.visible ?? true })),
        views: (fd.views ?? []).map((v: any) => ({ id: v.id, name: v.name, type: v.type, filter: v.filter ?? undefined, sort: v.sort ?? undefined, groupBy: v.group_by ?? undefined, visibleProperties: v.visible_properties ?? undefined })),
        createdBy: fd.created_by, createdAt: fd.created_at, updatedAt: fd.updated_at,
      })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const d = { ...parsed.data, id: parsed.data.id ?? uuid(), isFavorite: false, properties: parsed.data.properties||[], views: parsed.data.views||[{ id: uuid(), name:'Table', type:'table'}], createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.databases.push(d); saveDB()
  res.status(201).json(d)
})
app.patch('/api/databases/:id', authStub, async (req:any,res)=> {
  const parsed = z.object({
    name: z.string().min(1).max(100).optional(),
    icon: z.string().max(50).optional(),
    description: z.string().max(2000).optional(),
    isFavorite: z.boolean().optional(),
    properties: z.array(z.any()).optional(),
    views: z.array(z.any()).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const dbWsId = await workspaceIdForDatabase(req.params.id)
  if (!dbWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, dbWsId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const sets: string[] = []
      const vals: any[] = []
      if (parsed.data.name !== undefined) { vals.push(parsed.data.name); sets.push(`name=$${vals.length}`) }
      if (parsed.data.icon !== undefined) { vals.push(parsed.data.icon); sets.push(`icon=$${vals.length}`) }
      if (parsed.data.description !== undefined) { vals.push(parsed.data.description); sets.push(`description=$${vals.length}`) }
      if (parsed.data.isFavorite !== undefined) { vals.push(parsed.data.isFavorite); sets.push(`is_favorite=$${vals.length}`) }
      if (sets.length > 0) {
        vals.push(req.params.id)
        const rows = await pgQuery(`UPDATE databases SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
        if (!rows[0]) return res.status(404).json({ error:'Not found' })
      } else {
        const exists = await pgQuery('SELECT id FROM databases WHERE id=$1', [req.params.id])
        if (!exists[0]) return res.status(404).json({ error:'Not found' })
      }
      // Wholesale schema replace (column add/rename/reorder from any client).
      if (parsed.data.properties !== undefined) {
        await pgQuery('DELETE FROM database_properties WHERE database_id=$1', [req.params.id])
        for (const p of parsed.data.properties) {
          await pgQuery('INSERT INTO database_properties(id, database_id, name, type, options, relation_database_id, width, visible) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
            [isUuidLike(p.id) ? p.id : null, req.params.id, p.name, p.type, p.options ? JSON.stringify(p.options) : null, p.relationDatabaseId ?? null, p.width ?? null, p.visible ?? true])
        }
      }
      if (parsed.data.views !== undefined) {
        await pgQuery('DELETE FROM database_views WHERE database_id=$1', [req.params.id])
        for (const v of parsed.data.views) {
          await pgQuery('INSERT INTO database_views(id, database_id, name, type, filter, sort, group_by, visible_properties) VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)',
            [isUuidLike(v.id) ? v.id : null, req.params.id, v.name, v.type, v.filter ? JSON.stringify(v.filter) : null, v.sort ? JSON.stringify(v.sort) : null, v.groupBy ?? null, v.visibleProperties ? JSON.stringify(v.visibleProperties) : null])
        }
      }
      const rows = await pgQuery('SELECT * FROM databases WHERE id=$1', [req.params.id])
      return res.json(rows[0])
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const found = db.databases.find(x=> x.id===req.params.id)
  if (!found) return res.status(404).json({ error:'Not found' })
  Object.assign(found, parsed.data, { updatedAt: new Date().toISOString() })
  saveDB()
  res.json(found)
})
app.delete('/api/databases/:id', authStub, async (req:any,res)=> {
  const dbWsId = await workspaceIdForDatabase(req.params.id)
  if (!dbWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, dbWsId, (req as any).userId, 'delete')) return
  if (usingPg) {
    try {
      // properties/views/records cascade via FK; record page links SET NULL.
      const out = await pgQuery('DELETE FROM databases WHERE id=$1 RETURNING id', [req.params.id])
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const idx = db.databases.findIndex(x=> x.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  db.databases.splice(idx,1)
  db.records = db.records.filter(r=> r.databaseId!==req.params.id)
  saveDB()
  res.json({ ok:true })
})
app.get('/api/databases/:id/records', authStub, async (req:any,res)=> {
  // Pagination contract (both backends): ?page&pageSize → {rows,total,page,pageSize},
  // else bare array. Postgres: COUNT(*) OVER() + LIMIT/OFFSET, stable ORDER BY.
  const recWsId = await workspaceIdForDatabase(req.params.id)
  if (!recWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, recWsId, (req as any).userId, 'view')) return
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
  const parsed = z.object({ id: uuidOrAbsent, properties: z.record(z.any()).optional(), pageId: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const postWsId = await workspaceIdForDatabase(req.params.id)
  if (!postWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, postWsId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const cnt = await pgQuery('SELECT COUNT(*) AS n FROM database_records WHERE database_id=$1', [req.params.id])
      const pos = Number((cnt[0] as any)?.n ?? 0)
      const withId = !!parsed.data.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO database_records(id, database_id, properties, page_id, position, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *'
          : 'INSERT INTO database_records(database_id, properties, page_id, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        withId
          ? [parsed.data.id, req.params.id, JSON.stringify(parsed.data.properties ?? {}), parsed.data.pageId ?? null, pos, (req as any).userId]
          : [req.params.id, JSON.stringify(parsed.data.properties ?? {}), parsed.data.pageId ?? null, pos, (req as any).userId])
      return res.status(201).json(mapRecord(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const rec = { id: parsed.data.id ?? uuid(), databaseId: req.params.id, properties: parsed.data.properties||{}, pageId: parsed.data.pageId, position: db.records.filter(r=> r.databaseId===req.params.id).length, createdBy: (req as any).userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.records.push(rec); saveDB()
  res.status(201).json(rec)
})
app.patch('/api/records/:id', authStub, async (req:any,res)=> {
  const recWsId = await workspaceIdForRecord(req.params.id)
  if (!recWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, recWsId, (req as any).userId, 'edit')) return
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
app.delete('/api/records/:id', authStub, async (req:any,res)=> {
  const delWsId = await workspaceIdForRecord(req.params.id)
  if (!delWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, delWsId, (req as any).userId, 'edit')) return
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

// Sharing — bearer invite links per page. Creating/revoking needs admin
// (share); listing needs editor+ (tokens are bearer secrets).
app.post('/api/pages/:id/shares', authStub, async (req:any,res)=> {
  const parsed = z.object({
    permission: z.enum(['view', 'comment', 'edit']).default('view'),
    visibility: z.enum(['private', 'workspace', 'public']).default('workspace'),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const shareWsId = await workspaceIdForPage(req.params.id)
  if (!shareWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, shareWsId, (req as any).userId, 'share')) return
  const token = crypto.randomBytes(24).toString('hex')
  if (usingPg) {
    try {
      const exists = await pgQuery('SELECT id FROM pages WHERE id=$1', [req.params.id])
      if (!exists[0]) return res.status(404).json({ error:'Not found' })
      const rows = await pgQuery(
        'INSERT INTO share_links(page_id, permission, visibility, token, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, page_id, permission, visibility, token, created_at',
        [req.params.id, parsed.data.permission, parsed.data.visibility, token, (req as any).userId],
      )
      const r: any = rows[0]
      return res.status(201).json({ id: r.id, pageId: r.page_id, permission: r.permission, visibility: r.visibility, token: r.token, createdAt: r.created_at })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const page = db.pages.find(p=> p.id===req.params.id)
  if (!page) return res.status(404).json({ error:'Not found' })
  const link = { id: uuid(), pageId: req.params.id, permission: parsed.data.permission, visibility: parsed.data.visibility, token, createdBy: (req as any).userId, createdAt: new Date().toISOString() }
  db.shares.push(link); saveDB()
  res.status(201).json(link)
})
app.get('/api/pages/:id/shares', authStub, async (req:any,res)=> {
  const listWsId = await workspaceIdForPage(req.params.id)
  if (!listWsId) return res.status(404).json({ error:'Not found' })
  if (!await requireWorkspaceAction(res, listWsId, (req as any).userId, 'edit')) return
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT id, page_id, permission, visibility, token, created_at FROM share_links WHERE page_id=$1 ORDER BY created_at DESC', [req.params.id])
      return res.json(rows.map((r: any) => ({ id: r.id, pageId: r.page_id, permission: r.permission, visibility: r.visibility, token: r.token, createdAt: r.created_at })))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json(db.shares.filter(s=> s.pageId===req.params.id))
})
// Public: validate an invite token (no auth — the token IS the credential).
app.get('/api/shares/:token', async (req,res)=> {
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT page_id, permission, visibility FROM share_links WHERE token=$1', [req.params.token])
      if (!rows[0]) return res.status(404).json({ error:'Invalid or revoked link' })
      const r: any = rows[0]
      return res.json({ pageId: r.page_id, permission: r.permission, visibility: r.visibility })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const link = db.shares.find(s=> s.token===req.params.token)
  if (!link) return res.status(404).json({ error:'Invalid or revoked link' })
  res.json({ pageId: link.pageId, permission: link.permission, visibility: link.visibility })
})
app.delete('/api/shares/:token', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const cur = await pgQuery('SELECT page_id FROM share_links WHERE token=$1', [req.params.token])
      if (!cur[0]) return res.status(404).json({ error:'Not found' })
      const revokeWsId = await workspaceIdForPage((cur[0] as any).page_id)
      if (revokeWsId && !await requireWorkspaceAction(res, revokeWsId, (req as any).userId, 'share')) return
      const out = await pgQuery('DELETE FROM share_links WHERE token=$1 RETURNING id', [req.params.token])
      if (!out[0]) return res.status(404).json({ error:'Not found' })
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const link = db.shares.find(s=> s.token===req.params.token)
  if (!link) return res.status(404).json({ error:'Not found' })
  const revokeWsId = await workspaceIdForPage(link.pageId)
  if (revokeWsId && !await requireWorkspaceAction(res, revokeWsId, (req as any).userId, 'share')) return
  const idx = db.shares.findIndex(s=> s.token===req.params.token)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  db.shares.splice(idx,1); saveDB()
  res.json({ ok:true })
})

// Search — scoped to accessible workspaces (never cross-workspace). Optional
// workspaceId narrows further (checked). Unused by the current client (local
// Fuse search) but kept for API consumers.
app.get('/api/search', authStub, async (req:any,res)=> {
  const q = (req.query.q as string||'').toLowerCase()
  if (!q) return res.json([])
  const userId = (req as any).userId as string
  const wsFilter = req.query.workspaceId as string | undefined
  if (wsFilter && !await requireWorkspaceAction(res, wsFilter, userId, 'view')) return
  const allowed = wsFilter ? new Set([wsFilter]) : await accessibleWorkspaceIds(userId)
  if (usingPg) {
    try {
      const like = `%${q}%`
      const ids = [...allowed]
      const pages = ids.length
        ? await pgQuery('SELECT id, title, updated_at FROM pages WHERE LOWER(title) LIKE $1 AND workspace_id = ANY($2) ORDER BY updated_at DESC LIMIT 5', [like, ids])
        : []
      const blocks = ids.length
        ? await pgQuery('SELECT b.id, b.content, b.updated_at FROM blocks b JOIN pages p ON p.id=b.page_id WHERE LOWER(b.content) LIKE $1 AND p.workspace_id = ANY($2) ORDER BY b.updated_at DESC LIMIT 5', [like, ids])
        : []
      return res.json([
        ...(pages as any[]).map(p=> ({ id: p.id, title: p.title, type:'page', breadcrumb:'', updatedAt: p.updated_at })),
        ...(blocks as any[]).map(b=> ({ id: b.id, title: String(b.content ?? '').slice(0,40), type:'block', snippet: String(b.content ?? '').slice(0,80), updatedAt: b.updated_at })),
      ])
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const pages = db.pages.filter(p=> allowed.has(String(p.workspaceId)) && p.title.toLowerCase().includes(q)).slice(0,5).map(p=> ({ id:p.id, title:p.title, type:'page', breadcrumb:'', updatedAt:p.updatedAt }))
  const pageWs = new Map(db.pages.map(p=> [p.id, String(p.workspaceId)]))
  const blocks = db.blocks.filter(b=> (pageWs.get(b.pageId) !== undefined && allowed.has(pageWs.get(b.pageId)!)) && b.content.toLowerCase().includes(q)).slice(0,5).map(b=> ({ id:b.id, title:b.content.slice(0,40), type:'block', snippet:b.content.slice(0,80), updatedAt:b.updatedAt }))
  res.json([...pages, ...blocks])
})

// Comments — synced across users (slice 4). authorId is always the caller;
// clients may pass `id` (UUID) for idempotent first-run uploads.
// Reads need viewer+ in the owning workspace; unfiltered pulls are scoped to
// accessible workspaces (never cross-workspace).
app.get('/api/comments', authStub, async (req:any,res)=> {
  const pageId = req.query.pageId as string | undefined
  const blockId = req.query.blockId as string | undefined
  const recordId = req.query.recordId as string | undefined
  const userId = (req as any).userId as string
  const filterWsId = pageId
    ? await workspaceIdForPage(pageId)
    : blockId
      ? await workspaceIdForBlock(blockId)
      : recordId
        ? await workspaceIdForRecord(recordId)
        : null
  if ((pageId || blockId || recordId) && !filterWsId) return res.json([])
  if (filterWsId && !await requireWorkspaceAction(res, filterWsId, userId, 'view')) return
  if (usingPg) {
    try {
      if (filterWsId) {
        const conds: string[] = []
        const vals: any[] = []
        if (pageId) { vals.push(pageId); conds.push(`page_id=$${vals.length}`) }
        if (blockId) { vals.push(blockId); conds.push(`block_id=$${vals.length}`) }
        if (recordId) { vals.push(recordId); conds.push(`record_id=$${vals.length}`) }
        const rows = await pgQuery(`SELECT * FROM comments WHERE ${conds.join(' AND ')} ORDER BY created_at`, vals)
        return res.json(rows.map(mapComment))
      }
      const allowed = [...await accessibleWorkspaceIds(userId)]
      if (!allowed.length) return res.json([])
      const rows = await pgQuery(
        `SELECT c.* FROM comments c
         LEFT JOIN pages p ON p.id = c.page_id
         LEFT JOIN blocks b ON b.id = c.block_id
         LEFT JOIN pages bp ON bp.id = b.page_id
         LEFT JOIN database_records r ON r.id = c.record_id
         LEFT JOIN databases d ON d.id = r.database_id
         WHERE (c.page_id IS NULL AND c.block_id IS NULL AND c.record_id IS NULL)
            OR p.workspace_id = ANY($1) OR bp.workspace_id = ANY($1) OR d.workspace_id = ANY($1)
         ORDER BY c.created_at DESC LIMIT 200`, [allowed])
      return res.json(rows.map(mapComment))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  let c = db.comments
  if (pageId) c = c.filter(x=> x.pageId===pageId)
  if (blockId) c = c.filter(x=> x.blockId===blockId)
  if (recordId) c = c.filter(x=> x.recordId===recordId)
  if (!pageId && !blockId && !recordId) {
    const allowed = await accessibleWorkspaceIds(userId)
    const pageWs = new Map(db.pages.map((p: any)=> [p.id, String(p.workspaceId)]))
    const blockPage = new Map(db.blocks.map((b: any)=> [b.id, b.pageId]))
    const recDb = new Map(db.records.map((r: any)=> [r.id, r.databaseId]))
    const dbWs = new Map(db.databases.map((d: any)=> [d.id, String(d.workspaceId)]))
    const wsOf = (x: any): string | null => {
      if (x.pageId) return pageWs.get(x.pageId) ?? null
      if (x.blockId) { const pid = blockPage.get(x.blockId); return (pid && pageWs.get(pid)) ?? null }
      if (x.recordId) { const did = recDb.get(x.recordId); return (did && dbWs.get(did)) ?? null }
      return null
    }
    c = c.filter(x=> { const w = wsOf(x); return w === null || allowed.has(w) }).slice(-200)
  }
  res.json(c)
})
app.post('/api/comments', authStub, async (req:any,res)=> {
  const parsed = z.object({
    id: uuidOrAbsent,
    pageId: z.string().optional(),
    blockId: z.string().optional(),
    recordId: z.string().optional(),
    content: z.string().min(1).max(MAX_COMMENT_CONTENT),
    mentions: z.any().optional(),
    parentId: z.string().nullable().optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const b = parsed.data as Record<string, any>
  // v1 ACL: commenting needs at least commenter rights in the owning workspace,
  // resolved via page → block → record (first link wins).
  const commentWsId = b.pageId
    ? await workspaceIdForPage(b.pageId)
    : b.blockId
      ? await workspaceIdForBlock(b.blockId)
      : b.recordId
        ? await workspaceIdForRecord(b.recordId)
        : null
  if ((b.pageId || b.blockId || b.recordId) && !commentWsId) {
    return res.status(404).json({ error: 'Target not found' })
  }
  if (commentWsId && !await requireWorkspaceAction(res, commentWsId, (req as any).userId, 'comment')) return
  if (usingPg) {
    try {
      const withId = !!b.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO comments(id, page_id, block_id, record_id, author_id, content, mentions, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING *'
          : 'INSERT INTO comments(page_id, block_id, record_id, author_id, content, mentions, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        withId
          ? [b.id, b.pageId ?? null, b.blockId ?? null, b.recordId ?? null, (req as any).userId, b.content, b.mentions ? JSON.stringify(b.mentions) : null, b.parentId ?? null]
          : [b.pageId ?? null, b.blockId ?? null, b.recordId ?? null, (req as any).userId, b.content, b.mentions ? JSON.stringify(b.mentions) : null, b.parentId ?? null],
      )
      if (!rows[0] && withId) {
        const existing = await pgQuery('SELECT * FROM comments WHERE id=$1', [b.id])
        if (existing[0]) return res.status(200).json(mapComment(existing[0]))
      }
      return res.status(201).json(mapComment(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  if (b.id && db.comments.some(x=> x.id===b.id)) return res.status(200).json(db.comments.find(x=> x.id===b.id))
  const c = { id: b.id ?? uuid(), ...b, authorId: (req as any).userId, resolved: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  db.comments.push(c); saveDB()
  res.status(201).json(c)
})
app.patch('/api/comments/:id', authStub, async (req:any,res)=> {
  const parsed = z.object({
    content: z.string().min(1).max(MAX_COMMENT_CONTENT).optional(),
    resolved: z.boolean().optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (parsed.data.content === undefined && parsed.data.resolved === undefined) {
    return res.status(400).json({ error: 'Nothing to update (content|resolved)' })
  }
  if (usingPg) {
    try {
      const cur = await pgQuery('SELECT * FROM comments WHERE id=$1', [req.params.id])
      if (!cur[0]) return res.status(404).json({ error:'Not found' })
      const isAuthor = (cur[0] as any).author_id === (req as any).userId
      if (!isAuthor) {
        // Non-authors need editor rights in the owning workspace (when known).
        const wsId = await workspaceIdForPage((cur[0] as any).page_id)
        if (wsId) {
          const { role } = await getWorkspaceRole(wsId, (req as any).userId)
          if (!role || !canDoPageAction(role, 'edit')) return res.status(403).json({ error: 'Only the author or an editor can update this comment' })
        } else if (parsed.data.content !== undefined) {
          return res.status(403).json({ error: 'Only the author can edit this comment' })
        }
      }
      const sets: string[] = []
      const vals: any[] = []
      if (parsed.data.content !== undefined) { vals.push(parsed.data.content); sets.push(`content=$${vals.length}`) }
      if (parsed.data.resolved !== undefined) { vals.push(parsed.data.resolved); sets.push(`resolved=$${vals.length}`) }
      vals.push(req.params.id)
      const rows = await pgQuery(`UPDATE comments SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
      return res.json(mapComment(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const c = db.comments.find(x=> x.id===req.params.id)
  if (!c) return res.status(404).json({ error:'Not found' })
  if (c.authorId !== (req as any).userId && parsed.data.content !== undefined) {
    return res.status(403).json({ error: 'Only the author can edit this comment' })
  }
  Object.assign(c, parsed.data, { updatedAt: new Date().toISOString() })
  saveDB()
  res.json(c)
})
app.delete('/api/comments/:id', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const cur = await pgQuery('SELECT author_id, page_id FROM comments WHERE id=$1', [req.params.id])
      if (!cur[0]) return res.status(404).json({ error:'Not found' })
      const isAuthor = (cur[0] as any).author_id === (req as any).userId
      if (!isAuthor) {
        const wsId = await workspaceIdForPage((cur[0] as any).page_id)
        if (wsId) {
          const { role } = await getWorkspaceRole(wsId, (req as any).userId)
          if (!role || !canDoPageAction(role, 'delete')) return res.status(403).json({ error: 'Only the author or an admin can delete this comment' })
        } else {
          return res.status(403).json({ error: 'Only the author can delete this comment' })
        }
      }
      await pgQuery('DELETE FROM comments WHERE id=$1', [req.params.id])
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const idx = db.comments.findIndex(x=> x.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  if (db.comments[idx].authorId && db.comments[idx].authorId !== (req as any).userId) {
    return res.status(403).json({ error: 'Only the author can delete this comment' })
  }
  db.comments.splice(idx,1); saveDB()
  res.json({ ok:true })
})

// Files — metadata only (bytes live in the storage provider). Reads need
// viewer+, uploads need editor+. Unfiltered lists are scoped to accessible
// workspaces.
app.get('/api/files', authStub, async (req:any,res)=> {
  const workspaceId = req.query.workspaceId as string | undefined
  const userId = (req as any).userId as string
  if (workspaceId && !await requireWorkspaceAction(res, workspaceId, userId, 'view')) return
  const allowed = workspaceId ? null : await accessibleWorkspaceIds(userId)
  if (usingPg) {
    try {
      const rows = workspaceId
        ? await pgQuery('SELECT * FROM files WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100', [workspaceId])
        : await pgQuery('SELECT * FROM files ORDER BY created_at DESC LIMIT 100')
      const mapped = rows.map(mapFile)
      return res.json(allowed ? mapped.filter((f: any)=> f.workspaceId == null || allowed.has(String(f.workspaceId))) : mapped)
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  let files = db.files
  if (workspaceId) files = files.filter((f: any)=> f.workspaceId===workspaceId)
  else if (allowed) files = files.filter((f: any)=> f.workspaceId == null || allowed.has(String(f.workspaceId)))
  res.json(files)
})
app.post('/api/files', authStub, async (req:any,res)=> {
  const fileError = validateFileInput(req.body)
  if (fileError) return res.status(400).json({ error: fileError })
  if (req.body.workspaceId && !await requireWorkspaceAction(res, req.body.workspaceId, (req as any).userId, 'edit')) return
  const filename = sanitizeFilename(req.body.filename)
  const mimeType = (typeof req.body.mimeType === 'string' && req.body.mimeType ? req.body.mimeType.toLowerCase().split(';')[0].trim() : 'application/octet-stream')
  const size = req.body.size === undefined ? 0 : Number(req.body.size)
  const clientId = typeof req.body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.id) ? req.body.id : null
  if (usingPg) {
    try {
      const rows = clientId
        ? await pgQuery(
            'INSERT INTO files(id, workspace_id, filename, mime_type, size, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING *',
            [clientId, req.body.workspaceId ?? null, filename, mimeType, size, `files/${uuid()}`, (req as any).userId],
          )
        : await pgQuery(
            'INSERT INTO files(workspace_id, filename, mime_type, size, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [req.body.workspaceId ?? null, filename, mimeType, size, `files/${uuid()}`, (req as any).userId],
          )
      if (!rows[0] && clientId) {
        const existing = await pgQuery('SELECT * FROM files WHERE id=$1', [clientId])
        if (existing[0]) return res.status(200).json(mapFile(existing[0]))
      }
      return res.status(201).json(mapFile(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  if (clientId && db.files.some((f: any)=> f.id===clientId)) return res.status(200).json(db.files.find((f: any)=> f.id===clientId))
  const f = { id: clientId ?? uuid(), workspaceId: req.body.workspaceId, filename, mimeType, size, storageKey:`files/${uuid()}`, uploadedBy: (req as any).userId, createdAt: new Date().toISOString() }
  db.files.push(f); saveDB()
  res.status(201).json(f)
})
app.delete('/api/files/:id', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const cur = await pgQuery('SELECT workspace_id FROM files WHERE id=$1', [req.params.id])
      if (!cur[0]) return res.status(404).json({ error:'Not found' })
      const wsId = (cur[0] as any).workspace_id as string | null
      if (wsId && !await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
      await pgQuery('DELETE FROM files WHERE id=$1', [req.params.id])
      return res.json({ ok:true })
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const idx = db.files.findIndex((f: any)=> f.id===req.params.id)
  if (idx===-1) return res.status(404).json({ error:'Not found' })
  const wsId = db.files[idx].workspaceId
  if (wsId && !await requireWorkspaceAction(res, wsId, (req as any).userId, 'edit')) return
  db.files.splice(idx,1); saveDB()
  res.json({ ok:true })
})

// Activities — workspace feed. Clients push lightweight events (page/record/
// comment actions); the server stamps userId from auth (no spoofing).
// Pull is newest-first, capped (same contract on both backends). Reads need
// viewer+; unfiltered pulls are scoped to accessible workspaces.
app.get('/api/activities', authStub, async (req:any,res)=> {
  const ws = req.query.workspaceId as string | undefined
  const userId = (req as any).userId as string
  if (ws && !await requireWorkspaceAction(res, ws, userId, 'view')) return
  const allowed = ws ? null : await accessibleWorkspaceIds(userId)
  if (usingPg) {
    try {
      const rows = ws
        ? await pgQuery('SELECT * FROM activities WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50', [ws])
        : await pgQuery('SELECT * FROM activities ORDER BY created_at DESC LIMIT 50')
      const mapped = rows.map(mapActivity)
      return res.json(allowed ? mapped.filter((a: any)=> a.workspaceId == null || allowed.has(String(a.workspaceId))) : mapped)
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  let acts = db.activities
  if (ws) acts = acts.filter(a=> a.workspaceId===ws)
  else if (allowed) acts = acts.filter((a: any)=> a.workspaceId == null || allowed.has(String(a.workspaceId)))
  res.json(acts.slice(0,50))
})
app.post('/api/activities', authStub, async (req:any,res)=> {
  const parsed = z.object({
    id: uuidOrAbsent,
    workspaceId: z.string().min(1),
    action: z.enum(['page_created','page_updated','block_created','block_deleted','record_created','record_updated','comment_added','file_uploaded','page_shared','page_archived','page_favorited','database_created','database_deleted','task_assigned','mention']),
    targetId: z.string().min(1).max(100),
    targetType: z.string().min(1).max(50),
    metadata: z.record(z.any()).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { role, missing } = await getWorkspaceRole(parsed.data.workspaceId, (req as any).userId)
  if (missing) return res.status(404).json({ error: 'Workspace not found' })
  if (!role) return res.status(403).json({ error: 'Not a workspace member' })
  if (usingPg) {
    try {
      const withId = !!parsed.data.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO activities(id, workspace_id, user_id, action, target_id, target_type, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING RETURNING *'
          : 'INSERT INTO activities(workspace_id, user_id, action, target_id, target_type, metadata) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        withId
          ? [parsed.data.id, parsed.data.workspaceId, (req as any).userId, parsed.data.action, parsed.data.targetId, parsed.data.targetType, parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null]
          : [parsed.data.workspaceId, (req as any).userId, parsed.data.action, parsed.data.targetId, parsed.data.targetType, parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null],
      )
      if (!rows[0] && withId) {
        const existing = await pgQuery('SELECT * FROM activities WHERE id=$1', [parsed.data.id])
        if (existing[0]) return res.status(200).json(mapActivity(existing[0]))
      }
      return res.status(201).json(mapActivity(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  if (parsed.data.id && db.activities.some(a=> a.id===parsed.data.id)) {
    return res.status(200).json(db.activities.find(a=> a.id===parsed.data.id))
  }
  const a = { id: parsed.data.id ?? uuid(), workspaceId: parsed.data.workspaceId, userId: (req as any).userId, action: parsed.data.action, targetId: parsed.data.targetId, targetType: parsed.data.targetType, metadata: parsed.data.metadata, createdAt: new Date().toISOString() }
  db.activities.unshift(a); db.activities = db.activities.slice(0, 200); saveDB()
  res.status(201).json(a)
})

// Auth: bcrypt + JWT when Postgres is configured, stub-compatible otherwise.
// Login accepts legacy users without password_hash (returns demo-token path);
// new registrations always store bcrypt hashes. Clients send
// `Authorization: Bearer <jwt>`; `demo-token` + `x-user-id` still works.
app.post('/api/auth/login', authLimiter, async (req,res)=> {
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
app.post('/api/auth/register', authLimiter, async (req,res)=> {
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

// Notifications — per-user inbox fed by the automation bus (slice 4).
// userId is always the caller (no spoofing); automation targets resolve
// client-side to the actor for v1, with link carrying the shared target so
// any member opening it lands on the right page/record.
const notificationSchema = z.object({
  id: uuidOrAbsent,
  type: z.enum(['mention', 'comment', 'share', 'task_assigned', 'system']),
  title: z.string().min(1).max(140),
  body: z.string().max(500).optional(),
  link: z.string().max(300).optional(),
})
app.get('/api/notifications', authStub, async (req:any,res)=> {
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [(req as any).userId])
      return res.json(rows.map(mapNotification))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  res.json(db.notifications.filter(n=> n.userId===(req as any).userId).slice(0,50))
})
app.post('/api/notifications', authStub, async (req:any,res)=> {
  const parsed = notificationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const withId = !!parsed.data.id
      const rows = await pgQuery(
        withId
          ? 'INSERT INTO notifications(id, user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING *'
          : 'INSERT INTO notifications(user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        withId
          ? [parsed.data.id, (req as any).userId, parsed.data.type, parsed.data.title, parsed.data.body ?? null, parsed.data.link ?? null]
          : [(req as any).userId, parsed.data.type, parsed.data.title, parsed.data.body ?? null, parsed.data.link ?? null],
      )
      if (!rows[0] && withId) {
        const existing = await pgQuery('SELECT * FROM notifications WHERE id=$1 AND user_id=$2', [parsed.data.id, (req as any).userId])
        if (existing[0]) return res.status(200).json(mapNotification(existing[0]))
      }
      return res.status(201).json(mapNotification(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  if (parsed.data.id && db.notifications.some(n=> n.id===parsed.data.id)) {
    return res.status(200).json(db.notifications.find(n=> n.id===parsed.data.id))
  }
  const n = { id: parsed.data.id ?? uuid(), userId: (req as any).userId, type: parsed.data.type, title: parsed.data.title, body: parsed.data.body, link: parsed.data.link, read: false, createdAt: new Date().toISOString() }
  db.notifications.unshift(n); db.notifications = db.notifications.slice(0, 200); saveDB()
  res.status(201).json(n)
})
app.patch('/api/notifications/:id', authStub, async (req:any,res)=> {
  const parsed = z.object({ read: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  if (usingPg) {
    try {
      const rows = await pgQuery('UPDATE notifications SET read=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [parsed.data.read, req.params.id, (req as any).userId])
      if (!rows[0]) return res.status(404).json({ error:'Not found' })
      return res.json(mapNotification(rows[0]))
    } catch (e) { return res.status(500).json({ error: String((e as Error)?.message || e) }) }
  }
  const n = db.notifications.find(x=> x.id===req.params.id && x.userId===(req as any).userId)
  if (!n) return res.status(404).json({ error:'Not found' })
  n.read = parsed.data.read
  saveDB()
  res.json(n)
})

// Templates
app.get('/api/templates', (_req,res)=> {
  res.json([
    { id: uuid(), name:'Project', category:'Work', icon:'◈', description:'Kick off a new project' },
    { id: uuid(), name:'Meeting Notes', category:'Work', icon:'◐', description:'Structured notes' },
  ])
})

// AI stub
app.post('/api/ai/generate', aiLimiter, async (req,res)=> {
  const parsed = z.object({
    prompt: z.string().min(1).max(MAX_AI_PROMPT),
    task: z.string().max(100).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })
  const { prompt, task } = parsed.data
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
