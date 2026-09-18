import { z } from 'zod'
import { usingPg, pgQuery } from './pg.js'
import { authMiddleware } from './auth.js'
import { canDoPageAction, resolveWorkspaceRole, allowLegacyOpenAccess, type Role, type PageAction } from './acl.js'
import { MAX_BLOCK_CONTENT, MAX_COMMENT_CONTENT } from './security.js'
import { db } from './state.js'

// Middleware: JWT (Bearer) with stub fallback (x-user-id / demo-token)
export const authStub = authMiddleware

// --- Slice 4: per-user workspace ACL (v1) ---
// Resolves the caller's role in a workspace. Legacy single-user workspaces
// with zero explicit members stay open (editor-equivalent) so zero-setup dev,
// existing seeds, and old clients keep working. Returns null when the
// workspace doesn't exist (callers → 404) or when membership is required
// but missing (callers → 403).
export async function getWorkspaceRole(workspaceId: string | null | undefined, userId: string): Promise<{ role: Role | null, missing: boolean }> {
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
  // Ownerless legacy rows stay open (see accessibleWorkspaceIds); owned
  // workspaces are private to their owner on the JSON backend.
  if (!ws.ownerId) return { role: 'editor', missing: false }
  return { role: null, missing: false }
}

export async function workspaceIdForPage(pageId: string | null | undefined): Promise<string | null> {
  if (!pageId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT workspace_id FROM pages WHERE id=$1', [pageId])
      return ((rows[0] as any)?.workspace_id as string) ?? null
    } catch { return null }
  }
  return (db.pages.find((p: any) => p.id === pageId)?.workspaceId as string) ?? null
}

export async function workspaceIdForBlock(blockId: string | null | undefined): Promise<string | null> {
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

export async function workspaceIdForDatabase(dbId: string | null | undefined): Promise<string | null> {
  if (!dbId) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT workspace_id FROM databases WHERE id=$1', [dbId])
      return ((rows[0] as any)?.workspace_id as string) ?? null
    } catch { return null }
  }
  return (db.databases.find((d: any) => d.id === dbId)?.workspaceId as string) ?? null
}

export async function workspaceIdForRecord(recordId: string | null | undefined): Promise<string | null> {
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

// Sharing — public reads via bearer invite-link token (?token=).
// A valid (non-revoked) link for the exact page grants read access to that
// page + its blocks without workspace membership. All writes still require
// auth + membership. Returns the link, or null when the token doesn't match
// this page.
export async function shareLinkForPage(token: unknown, pageId: string): Promise<{ permission: string, visibility: string } | null> {
  if (typeof token !== 'string' || !token || token.length > 200) return null
  if (usingPg) {
    try {
      const rows = await pgQuery('SELECT page_id, permission, visibility FROM share_links WHERE token=$1', [token])
      const r = rows[0] as any
      if (!r || String(r.page_id) !== String(pageId)) return null
      return { permission: r.permission, visibility: r.visibility }
    } catch { return null }
  }
  const link = (db.shares ?? []).find((s: any) => s.token === token && String(s.pageId) === String(pageId))
  return link ? { permission: link.permission, visibility: link.visibility } : null
}

// Workspaces the caller may see: owned, explicitly membered, or legacy-open
// (zero members — single-user dev workspaces stay usable without invites).
export async function accessibleWorkspaceIds(userId: string): Promise<Set<string>> {
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
  // JSON fallback has no workspace_members table. Previously every workspace
  // was visible to every authenticated caller, and every `demo-token` caller
  // collapsed onto the shared 'u1' identity — so a second login in the same
  // browser saw the first account's data. Now: workspaces with an owner are
  // visible only to that owner (the client sends its identity via `x-user-id`
  // for demo-token sessions); ownerless legacy rows stay visible to all so
  // old single-user setups keep working. Real membership hiding applies on
  // the Postgres path once member rows exist.
  const all = db.workspaces as any[]
  return new Set(
    all
      .filter((w: any) => !w.ownerId || String(w.ownerId) === String(userId))
      .map((w: any) => String(w.id)),
  )
}

// Enforce a page-action minimum inside a workspace. Sends 404 (unknown
// workspace) or 403 (not a member / role too low) and returns null, else the
// caller's role. Legacy-open workspaces resolve every caller to 'editor'.
export async function requireWorkspaceAction(
  res: any, workspaceId: string | null | undefined, userId: string, action: PageAction,
): Promise<Role | null> {
  const { role, missing } = await getWorkspaceRole(workspaceId, userId)
  if (missing) { res.status(404).json({ error: 'Workspace not found' }); return null }
  if (!role || !canDoPageAction(role, action)) { res.status(403).json({ error: 'Insufficient permission' }); return null }
  return role
}

export const isUuidLike = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Validation schemas
export const uuidOrAbsent = z.string().uuid().optional()
export const pageSchema = z.object({
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

export const blockSchema = z.object({
  id: uuidOrAbsent,
  pageId: z.string(),
  type: z.string(),
  content: z.string().max(MAX_BLOCK_CONTENT),
  position: z.number(),
  parentId: z.string().nullable().optional(),
  properties: z.record(z.any()).optional(),
})

export const versionBodySchema = z.object({
  id: uuidOrAbsent,
  blocksSnapshot: z.array(z.any()).max(2000).default([]),
  message: z.string().max(500).optional(),
})

export const MAX_VERSIONS_PER_PAGE_SERVER = 20

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  avatar: z.string().max(2_000_000).optional(),
}).refine((v) => v.name !== undefined || v.email !== undefined || v.avatar !== undefined, {
  message: 'Nothing to update',
})

export const notificationSchema = z.object({
  id: uuidOrAbsent,
  type: z.enum(['mention', 'comment', 'share', 'task_assigned', 'system']),
  title: z.string().min(1).max(140),
  body: z.string().max(500).optional(),
  link: z.string().max(300).optional(),
})

export function publicUser(u: any) {
  if (!u) return u
  const { passwordHash, password_hash, ...rest } = u as any
  return rest
}

export function validAvatarValue(v: unknown): boolean {
  if (typeof v !== 'string') return false
  if (v === '') return true // clearing the picture
  return v.startsWith('data:image/')
}

export { MAX_BLOCK_CONTENT, MAX_COMMENT_CONTENT }
