// Postgres pool — active only when DATABASE_URL is set.
// Falls back to JSON file persistence otherwise, so `npm run server`
// and tests work with zero setup. Matches migrations/001 + 002.
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

export const usingPg = Boolean(process.env.DATABASE_URL)

const num = (v: string | undefined, fallback: number) => {
  const n = v !== undefined ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Fail fast, never hang: without these, an unreachable DATABASE_URL makes
// every pgQuery wait on TCP/OS timeouts (minutes) while the client aborts at
// 15s with a generic "Server timed out". Env-overridable for slow networks.
export const PG_CONNECT_TIMEOUT_MS = num(process.env.PG_CONNECT_TIMEOUT_MS, 5_000)
export const PG_QUERY_TIMEOUT_MS = num(process.env.PG_QUERY_TIMEOUT_MS, 10_000)

let pool: pg.Pool | null = null
export function getPool(): pg.Pool | null {
  if (!usingPg) return null
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
      query_timeout: PG_QUERY_TIMEOUT_MS,
      statement_timeout: PG_QUERY_TIMEOUT_MS,
    })
    pool.on('error', (e) => console.error('[pg] pool error', e))
  }
  return pool
}

export async function pgQuery<T = any>(text: string, params?: any[]): Promise<T[]> {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured (DATABASE_URL missing)')
  const res = await p.query(text, params)
  return res.rows as T[]
}

// Cheap liveness probe for /health (never throws, never hangs past ~2s).
export async function pgOk(timeoutMs = 2_000): Promise<boolean> {
  if (!usingPg) return true
  try {
    await Promise.race([
      getPool()!.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('pg probe timeout')), timeoutMs)),
    ])
    return true
  } catch {
    return false
  }
}

// --- snake_case → camelCase mappers (API keeps JSON shapes) ---
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string))

export const mapUser = (r: any) => r && {
  id: r.id, email: r.email, name: r.name, avatar: r.avatar ?? '',
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}
export const mapWorkspace = (r: any) => r && {
  id: r.id, name: r.name, icon: r.icon, ownerId: r.owner_id,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}
export const mapPage = (r: any) => r && {
  id: r.id, workspaceId: r.workspace_id, parentId: r.parent_id ?? null,
  title: r.title, icon: r.icon, cover: r.cover, description: r.description,
  properties: r.properties ?? {}, theme: r.theme ?? 'default',
  isFavorite: r.is_favorite, isArchived: r.is_archived,
  isTrashed: r.is_trashed, isShared: r.is_shared, shareMode: r.share_mode,
  createdBy: r.created_by, updatedBy: r.updated_by,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}
export const mapBlock = (r: any) => r && {
  id: r.id, pageId: r.page_id, parentId: r.parent_id ?? null,
  type: r.type, content: r.content ?? '', properties: r.properties ?? {},
  position: r.position, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}
export const mapRecord = (r: any) => r && {
  id: r.id, databaseId: r.database_id, properties: r.properties ?? {},
  derived: r.derived ?? {},
  pageId: r.page_id ?? undefined, position: r.position ?? 0,
  createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}

export const mapFile = (r: any) => r && {
  id: r.id, workspaceId: r.workspace_id, filename: r.filename,
  mimeType: r.mime_type, size: r.size, storageKey: r.storage_key,
  uploadedBy: r.uploaded_by, createdAt: iso(r.created_at),
}

export const mapComment = (r: any) => r && {
  id: r.id, pageId: r.page_id ?? undefined, blockId: r.block_id ?? undefined,
  recordId: r.record_id ?? undefined, authorId: r.author_id,
  content: r.content ?? '', mentions: r.mentions ?? undefined,
  resolved: r.resolved ?? false, parentId: r.parent_id ?? null,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}

export const mapActivity = (r: any) => r && {
  id: r.id, workspaceId: r.workspace_id, userId: r.user_id,
  action: r.action, targetId: r.target_id, targetType: r.target_type,
  metadata: r.metadata ?? undefined, createdAt: iso(r.created_at),
}

export const mapNotification = (r: any) => r && {
  id: r.id, userId: r.user_id, type: r.type, title: r.title,
  body: r.body ?? undefined, read: r.read ?? false, link: r.link ?? undefined,
  createdAt: iso(r.created_at),
}
