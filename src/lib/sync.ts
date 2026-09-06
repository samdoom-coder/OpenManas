// Backend sync engine (slice 2 + slice 4) — pull shared state on login, push
// local mutations fire-and-forget. localStorage remains the offline cache; the
// API is the shared source of truth when backendMode === 'server'.
// Slice 4: comments/activities/files/notifications sync like pages/blocks;
// page iconType variants beyond emoji still degrade server-side (icon string
// is preserved).

import { apiFetch } from './api'
import type { Page, Block, Database, DatabaseRecord, Workspace, Comment, Activity, Notification, FileAsset } from './types'

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error'

type StatusFn = (s: SyncStatus, error?: string | null) => void
let statusFn: StatusFn | null = null
export function onSyncStatus(fn: StatusFn) {
  statusFn = fn
}
function setStatus(s: SyncStatus, error?: string | null) {
  try { statusFn?.(s, error) } catch { /* noop */ }
}

// --- debounced fire-and-forget pushes (updateBlock fires per keystroke) ---
const timers = new Map<string, ReturnType<typeof setTimeout>>()
export function queuePush(key: string, op: () => Promise<unknown>, ms = 1000) {
  if (timers.has(key)) clearTimeout(timers.get(key)!)
  timers.set(key, setTimeout(() => {
    timers.delete(key)
    op().catch((e) => setStatus('error', e instanceof Error ? e.message : 'Sync failed'))
  }, ms))
}

export function pushNow(op: () => Promise<unknown>) {
  op().catch((e) => setStatus('error', e instanceof Error ? e.message : 'Sync failed'))
}

// --- PULL ---
export interface PulledState {
  workspace: Workspace
  pages: Page[]
  blocks: Block[]
  databases: Database[]
  records: DatabaseRecord[]
  comments: Comment[]
  activities: Activity[]
  files: FileAsset[]
  notifications: Notification[]
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : (v as any)?.rows ?? [])

export async function fetchWorkspaces(): Promise<any[]> {
  return asArray(await apiFetch('/api/workspaces'))
}

export async function createRemoteWorkspace(name: string, icon?: string): Promise<any> {
  return apiFetch('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, icon }) })
}

export async function pullWorkspace(workspaceId: string): Promise<Omit<PulledState, 'workspace'>> {
  const [pages, databases] = await Promise.all([
    apiFetch<any[]>(`/api/pages?workspaceId=${encodeURIComponent(workspaceId)}`),
    apiFetch<any[]>(`/api/databases?workspaceId=${encodeURIComponent(workspaceId)}`),
  ])
  const blockLists = await Promise.all(
    (pages as any[]).map((p) => apiFetch<any[]>(`/api/pages/${p.id}/blocks`).catch(() => [])),
  )
  const recordLists = await Promise.all(
    (databases as any[]).map((d) => apiFetch<unknown>(`/api/databases/${d.id}/records`).catch(() => [])),
  )
  // Slice 4: shared social slices. Each is best-effort (older servers 404 →
  // empty) so pulls never fail because one slice is missing.
  const [comments, activities, files, notifications] = await Promise.all([
    apiFetch<Comment[]>('/api/comments').catch(() => []),
    apiFetch<Activity[]>(`/api/activities?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => []),
    apiFetch<FileAsset[]>(`/api/files?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => []),
    apiFetch<Notification[]>('/api/notifications').catch(() => []),
  ])
  return {
    pages: pages as Page[],
    blocks: blockLists.flat() as Block[],
    databases: databases as Database[],
    records: recordLists.map(asArray<DatabaseRecord>).flat(),
    comments: asArray<Comment>(comments),
    activities: asArray<Activity>(activities),
    files: asArray<FileAsset>(files),
    notifications: asArray<Notification>(notifications),
  }
}

// --- PUSH: pages ---
const pagePayload = (p: Page) => ({
  id: p.id,
  workspaceId: p.workspaceId,
  parentId: p.parentId,
  title: p.title,
  icon: p.icon,
  cover: p.cover,
  description: p.description,
  theme: (p as any).theme,
  properties: p.properties ?? {},
})

export const postPage = (p: Page) => apiFetch('/api/pages', { method: 'POST', body: JSON.stringify(pagePayload(p)) })
export const patchPage = (id: string, patch: Partial<Page>) =>
  apiFetch(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deletePageRemote = (id: string) => apiFetch(`/api/pages/${id}`, { method: 'DELETE' })

// --- PUSH: blocks ---
const blockPayload = (b: Block) => ({
  id: b.id,
  pageId: b.pageId,
  parentId: b.parentId,
  type: b.type,
  content: b.content,
  properties: b.properties ?? {},
  position: b.position,
})

export const postBlock = (b: Block) => apiFetch('/api/blocks', { method: 'POST', body: JSON.stringify(blockPayload(b)) })
export const patchBlock = (id: string, patch: Partial<Block>) =>
  apiFetch(`/api/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteBlockRemote = (id: string) => apiFetch(`/api/blocks/${id}`, { method: 'DELETE' })
export const reorderRemoteBlocks = (pageId: string, orderedIds: string[]) =>
  apiFetch('/api/blocks/reorder', { method: 'POST', body: JSON.stringify({ pageId, orderedIds }) })

/** Upsert one block: PATCH, re-POST on 404 (e.g. undo resurrected it). */
export async function upsertBlock(b: Block) {
  try {
    await patchBlock(b.id, { type: b.type, content: b.content, properties: b.properties, position: b.position, parentId: b.parentId })
  } catch (e: any) {
    if (e?.status === 404) await postBlock(b)
    else throw e
  }
}

/** Reconcile a page's blocks after bulk restore (undo): upsert local, delete remote extras. */
export async function reconcilePageBlocks(pageId: string, local: Block[]) {
  const remote = await apiFetch<any[]>(`/api/pages/${pageId}/blocks`).catch(() => null)
  if (!remote) return
  const localIds = new Set(local.map((b) => b.id))
  for (const b of [...local].sort((a, b) => a.position - b.position)) {
    await upsertBlock(b).catch(() => {})
  }
  for (const r of remote) {
    if (!localIds.has(r.id)) await deleteBlockRemote(r.id).catch(() => {})
  }
  await reorderRemoteBlocks(pageId, [...local].sort((a, b) => a.position - b.position).map((b) => b.id)).catch(() => {})
}

// --- PUSH: databases + records ---
const dbPayload = (d: Database) => ({
  id: d.id,
  workspaceId: d.workspaceId,
  name: d.name,
  icon: d.icon,
  description: d.description,
  properties: d.properties,
  views: d.views,
})

export const postDatabase = (d: Database) => apiFetch('/api/databases', { method: 'POST', body: JSON.stringify(dbPayload(d)) })
export const patchDatabase = (id: string, patch: Record<string, unknown>) =>
  apiFetch(`/api/databases/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteDatabaseRemote = (id: string) => apiFetch(`/api/databases/${id}`, { method: 'DELETE' })

export const postRecord = (r: DatabaseRecord) =>
  apiFetch(`/api/databases/${r.databaseId}/records`, {
    method: 'POST',
    body: JSON.stringify({ id: r.id, properties: r.properties, pageId: r.pageId }),
  })
export const patchRecord = (id: string, patch: Record<string, unknown>) =>
  apiFetch(`/api/records/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteRecordRemote = (id: string) => apiFetch(`/api/records/${id}`, { method: 'DELETE' })

// --- PUSH/PULL: comments (synced, authorId stamped server-side) ---
const commentPayload = (c: Comment) => ({
  id: c.id,
  pageId: c.pageId,
  blockId: c.blockId,
  recordId: c.recordId,
  content: c.content,
  mentions: c.mentions,
  parentId: c.parentId ?? null,
})

export const fetchComments = (filters?: { pageId?: string; blockId?: string; recordId?: string }) => {
  const q = new URLSearchParams()
  if (filters?.pageId) q.set('pageId', filters.pageId)
  if (filters?.blockId) q.set('blockId', filters.blockId)
  if (filters?.recordId) q.set('recordId', filters.recordId)
  const suffix = q.toString() ? `?${q.toString()}` : ''
  return apiFetch<Comment[]>(`/api/comments${suffix}`)
}
export const postComment = (c: Comment) =>
  apiFetch('/api/comments', { method: 'POST', body: JSON.stringify(commentPayload(c)) })
export const patchCommentRemote = (id: string, patch: { content?: string; resolved?: boolean }) =>
  apiFetch(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteCommentRemote = (id: string) => apiFetch(`/api/comments/${id}`, { method: 'DELETE' })

// --- PUSH/PULL: activities (workspace feed) ---
export const fetchActivities = (workspaceId: string) =>
  apiFetch<Activity[]>(`/api/activities?workspaceId=${encodeURIComponent(workspaceId)}`)
export const postActivity = (a: Activity) =>
  apiFetch('/api/activities', {
    method: 'POST',
    body: JSON.stringify({
      id: a.id, workspaceId: a.workspaceId, action: a.action,
      targetId: a.targetId, targetType: a.targetType, metadata: (a as any).metadata,
    }),
  })

// --- PUSH/PULL: files (metadata only; bytes live in the storage provider) ---
export const fetchFiles = (workspaceId: string) =>
  apiFetch<FileAsset[]>(`/api/files?workspaceId=${encodeURIComponent(workspaceId)}`)
export const postFileMeta = (f: FileAsset) =>
  apiFetch('/api/files', {
    method: 'POST',
    body: JSON.stringify({
      id: f.id, workspaceId: f.workspaceId, filename: f.filename,
      mimeType: f.mimeType, size: f.size,
    }),
  })
export const deleteFileRemote = (id: string) => apiFetch(`/api/files/${id}`, { method: 'DELETE' })

// --- PUSH/PULL: notifications (per-user inbox, fed by the automation bus) ---
export const fetchNotifications = () => apiFetch<Notification[]>('/api/notifications')
export const postNotification = (n: Notification) =>
  apiFetch('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link }),
  })
export const patchNotificationRemote = (id: string, read: boolean) =>
  apiFetch(`/api/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read }) })

// --- Workspace members (per-user ACL) ---
export interface WorkspaceMemberDTO {
  id: string
  workspaceId: string
  userId: string
  role: 'admin' | 'editor' | 'commenter' | 'viewer'
  joinedAt: string
}
export const listWorkspaceMembers = (workspaceId: string) =>
  apiFetch<WorkspaceMemberDTO[]>(`/api/workspaces/${workspaceId}/members`)
export const inviteWorkspaceMember = (workspaceId: string, input: { userId?: string; email?: string; role?: WorkspaceMemberDTO['role'] }) =>
  apiFetch<WorkspaceMemberDTO>(`/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

// --- Sharing: bearer invite links ---
export interface ShareLink {
  id: string
  pageId: string
  permission: 'view' | 'comment' | 'edit'
  visibility: 'private' | 'workspace' | 'public'
  token: string
  createdAt: string
}

export const createShareLink = (pageId: string, permission: ShareLink['permission'], visibility: ShareLink['visibility']) =>
  apiFetch<ShareLink>(`/api/pages/${pageId}/shares`, {
    method: 'POST',
    body: JSON.stringify({ permission, visibility }),
  })
export const listShareLinks = (pageId: string) => apiFetch<ShareLink[]>(`/api/pages/${pageId}/shares`)
export const revokeShareLink = (token: string) => apiFetch(`/api/shares/${token}`, { method: 'DELETE' })
export const resolveShareToken = (token: string) =>
  apiFetch<{ pageId: string; permission: string; visibility: string }>(`/api/shares/${token}`)

export function shareUrl(token: string): string {
  try {
    return `${window.location.origin}${window.location.pathname}#/join/${token}`
  } catch {
    return `#/join/${token}`
  }
}
