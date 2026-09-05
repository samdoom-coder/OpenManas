// Postgres pool — active only when DATABASE_URL is set.
// Falls back to JSON file persistence otherwise, so `npm run server`
// and tests work with zero setup. Matches migrations/001 + 002.
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

export const usingPg = Boolean(process.env.DATABASE_URL)

let pool: pg.Pool | null = null
export function getPool(): pg.Pool | null {
  if (!usingPg) return null
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
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
  properties: r.properties ?? {},
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
  pageId: r.page_id ?? undefined, position: r.position ?? 0,
  createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
}
