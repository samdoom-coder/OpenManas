import { create } from 'zustand'
import type { Page, Block, Database, DatabaseProperty, DatabaseRecord, PropertyType, Workspace, User, Activity, Notification, Comment, FileAsset, PageVersion } from '@/lib/types'
import { generateSeed, templatesSeed } from '@/data/seed'
import { uid } from '@/lib/utils'
import { getRecordTitle } from '@/lib/propertyDefs'
import type { AppSettings, ThemeMode } from '@/lib/settings'
import { loadSettings, saveSettings, applyAllSettings, applyThemeMode, resolveTheme, applyFont, applyCompact } from '@/lib/settings'
import { storageService } from '@/lib/storageService'
import { loadSession, saveSession, clearSession, signInRequest, signUpRequest } from '@/lib/api'
import { migrateStateIds } from '@/lib/ids'
import type { SyncStatus } from '@/lib/sync'
import { buildNotificationsForEvent, isDoneTransition, loadAutomationRules, parseMentions, type AutomationEvent } from '@/lib/automation'
import { loadVersions, saveVersions, buildVersion, nextVersionNumber, appendVersion, snapshotsEqual, AUTO_CAPTURE_MIN_MS, type VersionMap } from '@/lib/versions'
import {
  onSyncStatus, queuePush, pushNow,
  fetchWorkspaces, createRemoteWorkspace, pullWorkspace,
  postPage, patchPage, deletePageRemote,
  postBlock, patchBlock, deleteBlockRemote, reorderRemoteBlocks, reconcilePageBlocks,
  postDatabase, patchDatabase, deleteDatabaseRemote,
  postRecord, patchRecord, deleteRecordRemote,
  postComment, patchCommentRemote, deleteCommentRemote,
  postActivity, postNotification, patchNotificationRemote,
  postFileMeta, deleteFileRemote, fetchFiles,
} from '@/lib/sync'

/** True when mutations should also hit the API (slice 2). */
function serverMode(): boolean {
  try {
    const s = useAppStore.getState()
    return !!s.token && s.backendMode === 'server'
  } catch {
    return false
  }
}

/** Push a database's full schema (properties/views) after column edits. */
function pushDbSchema(dbId: string) {
  if (!serverMode()) return
  const d = useAppStore.getState().databases.find((x) => x.id === dbId)
  if (!d) return
  queuePush(`dbschema:${dbId}`, () => patchDatabase(dbId, { properties: d.properties, views: d.views }))
}

/** Version history: event → snapshot (auto throttled, manual always). */
const lastAutoCapture = new Map<string, number>()
function maybeAutoCapture(pageId: string) {
  try {
    const now = Date.now()
    if (now - (lastAutoCapture.get(pageId) ?? 0) < AUTO_CAPTURE_MIN_MS) return
    const s = useAppStore.getState()
    const blocks = s.blocks.filter((b) => b.pageId === pageId)
    const latest = s.versions[pageId]?.[s.versions[pageId].length - 1]
    if (latest && snapshotsEqual(latest.blocksSnapshot, blocks)) return
    lastAutoCapture.set(pageId, now)
    s.captureVersion(pageId)
  } catch { /* versioning never breaks editing */ }
}

/** Automation bus: event → notifications (prefs + rule toggles gate delivery). */
function emitAutomation(event: AutomationEvent) {
  try {
    const s = useAppStore.getState()
    const drafts = buildNotificationsForEvent(event, s.settings?.notifications, loadAutomationRules())
    if (drafts.length === 0) return
    const now = new Date().toISOString()
    const notifs: Notification[] = drafts.map((d) => ({
      id: uid(), userId: s.user.id, read: false, createdAt: now,
      type: d.type, title: d.title.slice(0, 140), body: d.body?.slice(0, 500), link: d.link,
    }))
    useAppStore.setState((st) => ({ notifications: [...notifs, ...st.notifications].slice(0, 100) }))
    persist(useAppStore.getState())
    // Slice 4: persist the inbox server-side so it survives across devices.
    // userId is stamped from auth; fire-and-forget so the bus never breaks.
    if (serverMode()) for (const n of notifs) pushNow(() => postNotification(n))
  } catch { /* bus never breaks mutations */ }
}

interface AppState {
  user: User
  workspace: Workspace
  pages: Page[]
  blocks: Block[]
  databases: Database[]
  records: DatabaseRecord[]
  activities: Activity[]
  notifications: Notification[]
  comments: Comment[]
  files: FileAsset[]
  selectedPageId: string | null
  selectedDatabaseId: string | null
  sidebarCollapsed: boolean
  commandOpen: boolean
  searchOpen: boolean
  theme: 'dark' | 'light'
  themeMode: ThemeMode
  settings: AppSettings
  /** Bumped every time blocks are restored from history (undo/redo) so editors can force-sync even when focused. */
  historyRev: number
  // actions
  setSelectedPage: (id: string | null) => void
  setSelectedDatabase: (id: string | null) => void
  toggleSidebar: () => void
  setCommandOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  toggleTheme: () => void
  setThemeMode: (mode: ThemeMode) => void
  updateUser: (patch: Partial<User>) => void
  updateWorkspace: (patch: Partial<Workspace>) => void
  updateSettings: (patch: Partial<Omit<AppSettings, 'editor' | 'databases' | 'notifications' | 'collaboration'>> & { editor?: Partial<AppSettings['editor']>, databases?: Partial<AppSettings['databases']>, notifications?: Partial<AppSettings['notifications']>, collaboration?: Partial<AppSettings['collaboration']> }) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  emptyTrash: () => number
  createPage: (title: string, parentId?: string | null, icon?: string) => Page
  createPageFromTemplate: (templateName: string, parentId?: string | null) => Page
  movePage: (id: string, newParentId: string | null) => boolean
  updatePage: (id: string, patch: Partial<Page>) => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  toggleFavorite: (id: string) => void
  archivePage: (id: string) => void
  restorePage: (id: string) => void
  // blocks
  addBlock: (pageId: string, type: any, content?: string, pos?: number) => Block
  restorePageBlocks: (pageId: string, snapshot: Block[]) => void
  updateBlock: (id: string, patch: Partial<Block>) => void
  deleteBlock: (id: string) => void
  moveBlock: (id: string, newPos: number) => void
  duplicateBlock: (id: string) => void
  // databases
  createDatabase: (name: string) => Database
  updateDatabase: (id: string, patch: Partial<Pick<Database, 'name' | 'icon' | 'description' | 'isFavorite'>>) => void
  toggleDatabaseFavorite: (id: string) => void
  deleteDatabase: (id: string) => void
  createRecord: (dbId: string, props: Record<string, unknown>) => DatabaseRecord
  importRecords: (dbId: string, rows: Record<string, unknown>[]) => DatabaseRecord[]
  updateRecord: (id: string, props: Record<string, unknown>) => void
  deleteRecord: (id: string) => void
  /** Get (creating if needed) the full page backing a record. Null if record missing. */
  ensureRecordPage: (recordId: string) => Page | null
  // database schema (Notion-like columns)
  addProperty: (dbId: string, prop: { name: string; type: PropertyType; options?: string[] }) => DatabaseProperty
  updateProperty: (dbId: string, propId: string, patch: Partial<DatabaseProperty>) => void
  deleteProperty: (dbId: string, propId: string) => void
  reorderProperty: (dbId: string, propId: string, direction: 'left' | 'right' | number) => void
  duplicateProperty: (dbId: string, propId: string) => void
  // session (slice 1: login against the API; data sync lands in slice 2)
  token: string | null
  backendMode: 'local' | 'server'
  backendDb: string | null
  signIn: (email: string, password?: string) => Promise<void>
  signUp: (email: string, name: string, password?: string) => Promise<void>
  signOut: () => void
  setBackendStatus: (mode: 'local' | 'server', db: string | null) => void
  // backend sync (slice 2: API is shared source of truth, localStorage is cache)
  syncStatus: SyncStatus
  lastSyncError: string | null
  /** Pull shared state (or upload local on first run). No-op when logged out. */
  pullFromServer: () => Promise<'up-to-date' | 'uploaded' | 'error' | 'local'>
  // other
  addActivity: (action: Activity['action'], targetId: string, targetType: string) => void
  addComment: (c: Omit<Comment,'id'|'createdAt'|'updatedAt'>) => void
  updateComment: (id: string, patch: { content?: string; resolved?: boolean }) => void
  deleteComment: (id: string) => void
  // version history (local-first snapshots + restore via restorePageBlocks)
  versions: VersionMap
  captureVersion: (pageId: string, message?: string) => PageVersion | null
  restoreVersion: (pageId: string, versionId: string) => boolean
  // files (FileManager records; bytes live in the storage provider)
  addFile: (meta: { filename: string; mimeType: string; size: number; storageKey: string; url?: string }) => FileAsset
  removeFile: (id: string) => void
  refreshFiles: () => Promise<void>
}

const defaultUser: User = { id: 'u1', email: 'alex@openmanas.app', name: 'Alex Rivera', avatar: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
const defaultWorkspace: Workspace = { id: 'w1', name: 'Acme Workspace', icon: '⬢', ownerId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }

function defaultForProperty(p: DatabaseProperty): unknown {
  switch (p.type) {
    case 'checkbox': return false
    case 'number': return ''
    case 'select':
    case 'status': return p.options?.[0] ?? ''
    case 'multi_select': return []
    case 'date':
    case 'date_range': return ''
    default: return ''
  }
}

function normalizePageIcon(p: Page): Page {  if (p.iconType) return p
  if ((p as Page).customIcon) return { ...p, iconType: 'custom' as const }
  if (!p.icon) return { ...p, iconType: 'none' as const }
  // Lucide names are ASCII PascalCase; emojis are non-ASCII
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(p.icon)) return { ...p, iconType: 'lucide' as const }
  return { ...p, iconType: 'emoji' as const }
}

const STATE_KEY = 'openmanas_state_v1'
const STATE_BACKUP_KEY = 'openmanas_state_backup'
const LEGACY_STATE_KEY = 'nexus_state_v1' // pre-rebrand — read once, then dropped
const IDS_FLAG = 'openmanas_ids_v2'

function loadOrSeed() {
  const saved = localStorage.getItem(STATE_KEY) ?? localStorage.getItem(LEGACY_STATE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (parsed?.pages) parsed.pages = (parsed.pages as Page[]).map(normalizePageIcon)
      return ensureUuidIds(parsed)
    } catch {}
  }
  const seed = generateSeed(defaultWorkspace.id, defaultUser.id)
  seed.pages = (seed.pages as Page[]).map(normalizePageIcon)
  return ensureUuidIds(seed)
}

/** One-time rewrite of legacy non-UUID entity ids (Postgres needs UUIDs). */
function ensureUuidIds<T>(state: T): T {
  try {
    if (localStorage.getItem(IDS_FLAG)) return state
    const { state: next, changed } = migrateStateIds(state as any)
    if (changed) {
      try { localStorage.setItem(STATE_KEY, JSON.stringify(next)) } catch { /* quota */ }
    }
    localStorage.setItem(IDS_FLAG, '1')
    return next as T
  } catch {
    return state
  }
}

const seedData = loadOrSeed()
const initialSettings = loadSettings()
// restore persisted API session (slice 1); data sync lands in slice 2
const storedSession = (() => { try { return loadSession() } catch { return null } })()
// restore profile (persisted going forward inside openmanas_state_v1)
const initialUser: User = (seedData.user as User) ?? defaultUser
const initialWorkspace: Workspace = (seedData.workspace as Workspace) ?? defaultWorkspace
const initialThemeMode: ThemeMode = (seedData.themeMode as ThemeMode) ?? initialSettings.themeMode ?? 'dark'
// apply on boot (fixes never-applied dark class + font/compact)
try {
  applyAllSettings({ ...initialSettings, themeMode: initialThemeMode })
  storageService.setActive(initialSettings.storageProviderId ?? 'local')
} catch { /* ssr guard */ }
// follow OS changes while in system mode
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && initialThemeMode === 'system') {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (useAppStore.getState().themeMode === 'system') {
        const resolved = resolveTheme('system')
        document.documentElement.classList.toggle('dark', resolved === 'dark')
        useAppStore.setState({ theme: resolved })
      }
    })
  } catch { /* older browsers */ }
}

export const useAppStore = create<AppState>((set, get) => ({
  user: storedSession ? { ...initialUser, ...storedSession.user } : initialUser,
  token: storedSession?.token ?? null,
  backendMode: storedSession ? 'server' : 'local',
  backendDb: null,
  workspace: initialWorkspace,
  pages: seedData.pages as Page[],
  blocks: seedData.blocks as Block[],
  databases: seedData.databases as Database[],
  records: seedData.records as DatabaseRecord[],
  activities: ((seedData as any).activities as Activity[] | undefined) ?? [
    { id: uid(), workspaceId: 'w1', userId: 'u1', action: 'page_created', targetId: 'p1', targetType: 'page', createdAt: new Date().toISOString() },
    { id: uid(), workspaceId: 'w1', userId: 'u1', action: 'database_created', targetId: 'db1', targetType: 'database', createdAt: new Date(Date.now()-3600000).toISOString() },
  ] as Activity[],
  notifications: ((seedData as any).notifications as Notification[] | undefined)?.length ? (seedData as any).notifications as Notification[] : [
    { id: uid(), userId: 'u1', type: 'mention', title: 'You were mentioned in Website Redesign', read: false, createdAt: new Date().toISOString() },
    { id: uid(), userId: 'u1', type: 'comment', title: 'Sam commented on Mobile App', read: false, createdAt: new Date(Date.now()-7200000).toISOString() },
  ] as Notification[],
  comments: ((seedData as any).comments as Comment[] | undefined) ?? [] as Comment[],
  files: ((seedData as any).files as FileAsset[] | undefined) ?? [] as FileAsset[],
  versions: loadVersions(),
  selectedPageId: (seedData.pages as Page[])[1]?.id || null,
  selectedDatabaseId: null,
  sidebarCollapsed: initialSettings.sidebarDefault === 'collapsed',
  commandOpen: false,
  searchOpen: false,
  theme: resolveTheme(initialThemeMode),
  themeMode: initialThemeMode,
  settings: { ...initialSettings, themeMode: initialThemeMode },
  historyRev: 0,

  setSelectedPage: (id) => set({ selectedPageId: id, selectedDatabaseId: null }),
  setSelectedDatabase: (id) => set({ selectedDatabaseId: id, selectedPageId: null }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    const merged = { ...s.settings, themeMode: next as ThemeMode }
    saveSettings(merged)
    return { theme: next, themeMode: next, settings: merged }
  }),
  setThemeMode: (mode) => set(s => {
    const resolved = applyThemeMode(mode)
    // attach OS listener lazily when entering system mode
    if (mode === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const mq = window.matchMedia('(prefers-color-scheme: light)')
        const handler = () => {
          if (useAppStore.getState().themeMode === 'system') {
            const r = resolveTheme('system')
            document.documentElement.classList.toggle('dark', r === 'dark')
            useAppStore.setState({ theme: r })
          }
        }
        mq.addEventListener('change', handler)
      } catch { /* noop */ }
    }
    const merged = { ...s.settings, themeMode: mode }
    saveSettings(merged)
    persist({ ...get(), themeMode: mode, settings: merged, theme: resolved })
    return { themeMode: mode, theme: resolved, settings: merged }
  }),
  updateUser: (patch) => {
    set(s => ({ user: { ...s.user, ...patch, updatedAt: new Date().toISOString() } }))
    persist(get())
  },
  updateWorkspace: (patch) => {
    set(s => ({ workspace: { ...s.workspace, ...patch, updatedAt: new Date().toISOString() } }))
    persist(get())
  },
  signIn: async (email, password) => {
    const r = await signInRequest(email.trim(), password)
    saveSession({ user: r.user, token: r.token })
    set(s => ({ user: { ...s.user, ...r.user, updatedAt: new Date().toISOString() }, token: r.token, backendMode: 'server' as const }))
    persist(get())
    void get().pullFromServer()
  },
  signUp: async (email, name, password) => {
    const r = await signUpRequest(email.trim(), name.trim(), password)
    saveSession({ user: r.user, token: r.token })
    set(s => ({ user: { ...s.user, ...r.user, updatedAt: new Date().toISOString() }, token: r.token, backendMode: 'server' as const }))
    persist(get())
    void get().pullFromServer()
  },
  signOut: () => {
    clearSession()
    set({ user: { ...defaultUser }, token: null, backendMode: 'local' as const, backendDb: null, selectedPageId: null, selectedDatabaseId: null })
    persist(get())
  },
  setBackendStatus: (mode, db) => set({ backendMode: mode, backendDb: db }),
  syncStatus: 'local',
  lastSyncError: null,
  pullFromServer: async () => {
    if (!get().token) return 'local'
    set({ syncStatus: 'syncing', lastSyncError: null })
    try {
      const workspaces = await fetchWorkspaces()
      let ws = workspaces[0]
      if (!ws) {
        // First run against this backend: create workspace, upload local state.
        ws = await createRemoteWorkspace(get().workspace.name, get().workspace.icon)
        const s = get()
        for (const p of s.pages) {
          await postPage({ ...p, workspaceId: ws.id } as Page).catch(() => {})
          for (const b of s.blocks.filter((x) => x.pageId === p.id)) {
            await postBlock(b).catch(() => {})
          }
        }
        for (const d of s.databases) {
          await postDatabase({ ...d, workspaceId: ws.id } as Database).catch(() => {})
        }
        for (const r of s.records) {
          await postRecord(r).catch(() => {})
        }
        for (const c of s.comments) {
          await postComment(c).catch(() => {})
        }
        for (const a of s.activities.slice(0, 50)) {
          await postActivity({ ...a, workspaceId: ws.id } as Activity).catch(() => {})
        }
        for (const n of s.notifications.slice(0, 50)) {
          await postNotification(n).catch(() => {})
        }
        set({
          workspace: { ...get().workspace, id: ws.id, name: ws.name ?? get().workspace.name },
          syncStatus: 'synced',
        })
        persist(get())
        return 'uploaded'
      }
      const pulled = await pullWorkspace(ws.id)
      set({
        workspace: { ...get().workspace, id: ws.id, name: ws.name ?? get().workspace.name, icon: ws.icon ?? get().workspace.icon },
        pages: (pulled.pages as Page[]).map(normalizePageIcon),
        blocks: pulled.blocks,
        databases: pulled.databases,
        records: pulled.records,
        comments: (pulled as any).comments ?? get().comments,
        activities: (pulled as any).activities?.length ? (pulled as any).activities : get().activities,
        files: (pulled as any).files ?? get().files,
        notifications: (pulled as any).notifications?.length ? (pulled as any).notifications : get().notifications,
        selectedPageId: null,
        selectedDatabaseId: null,
        syncStatus: 'synced',
      })
      persist(get())
      return 'up-to-date'
    } catch (e) {
      set({ syncStatus: 'error', lastSyncError: e instanceof Error ? e.message : 'Sync failed' })
      return 'error'
    }
  },
  updateSettings: (patch) => {
    const s = get()
    const merged: AppSettings = {
      ...s.settings,
      ...patch,
      editor: { ...s.settings.editor, ...(patch.editor ?? {}) },
      databases: { ...s.settings.databases, ...(patch.databases ?? {}) },
      notifications: { ...s.settings.notifications, ...(patch.notifications ?? {}) },
      collaboration: { ...s.settings.collaboration, ...(patch.collaboration ?? {}) },
    }
    const themeChanged = merged.themeMode !== s.settings.themeMode
    set({ settings: merged, themeMode: merged.themeMode })
    // apply visual prefs immediately
    try {
      applyFont(merged.fontFamily)
      applyCompact(merged.compactMode)
      if (themeChanged) {
        const resolved = applyThemeMode(merged.themeMode)
        set({ theme: resolved })
      }
      try { storageService.setActive(merged.storageProviderId) } catch { /* unknown provider */ }
    } catch { /* ssr */ }
    saveSettings(merged)
    persist({ ...get(), settings: merged })
  },
  markNotificationRead: (id) => {
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }))
    persist(get())
    if (serverMode()) queuePush(`notif:${id}`, () => patchNotificationRemote(id, true))
  },
  markAllNotificationsRead: () => {
    const unread = get().notifications.filter(n => !n.read)
    set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) }))
    persist(get())
    if (serverMode()) for (const n of unread) queuePush(`notif:${n.id}`, () => patchNotificationRemote(n.id, true))
  },
  emptyTrash: () => {
    const trashed = get().pages.filter(p => p.isTrashed)
    if (trashed.length === 0) return 0
    const ids = new Set(trashed.map(p => p.id))
    set(s => ({
      pages: s.pages.filter(p => !p.isTrashed),
      blocks: s.blocks.filter(b => !ids.has(b.pageId)),
    }))
    persist(get())
    if (serverMode()) for (const id of ids) pushNow(() => deletePageRemote(id))
    return trashed.length
  },

  createPage: (title, parentId=null, icon) => {
    const iconType = !icon ? 'none' as const : /^[A-Za-z][A-Za-z0-9]*$/.test(icon) ? 'lucide' as const : 'emoji' as const
    const p: Page = { id: uid(), workspaceId: get().workspace.id, parentId: parentId ?? null, title, icon, iconType, isFavorite: false, isArchived: false, isTrashed: false, isShared: false, createdBy: get().user.id, updatedBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const firstBlockId = uid()
    const firstBlock: Block = { id: firstBlockId, pageId: p.id, parentId: null, type: 'paragraph', content: '', properties: {}, position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s => ({ pages: [...s.pages, p], blocks: [...s.blocks, firstBlock], selectedPageId: p.id }))
    get().addActivity('page_created', p.id, 'page')
    persist(get())
    if (serverMode()) pushNow(async () => { await postPage(p); await postBlock(firstBlock) })
    return p
  },
  createPageFromTemplate: (templateName, parentId=null) => {
    const tpl = templatesSeed.find(t => t.name === templateName)
    const now = new Date().toISOString()
    const p: Page = {
      id: uid(), workspaceId: get().workspace.id, parentId: parentId ?? null,
      title: tpl ? tpl.name : 'Untitled',
      icon: tpl?.icon, iconType: tpl?.icon ? 'emoji' as const : 'none' as const,
      isFavorite: false, isArchived: false, isTrashed: false, isShared: false,
      createdBy: get().user.id, updatedBy: get().user.id, createdAt: now, updatedAt: now,
    }
    const tplBlocks = (tpl?.blocks && tpl.blocks.length > 0)
      ? tpl.blocks
      : [{ type: 'paragraph', content: '' }]
    const newBlocks: Block[] = tplBlocks.map((b, idx) => ({
      id: uid(), pageId: p.id, parentId: null,
      type: b.type as Block['type'], content: b.content ?? '',
      properties: { ...(b.properties ?? {}) },
      position: idx, createdAt: now, updatedAt: now,
    }))
    set(s => ({ pages: [...s.pages, p], blocks: [...s.blocks, ...newBlocks], selectedPageId: p.id }))
    get().addActivity('page_created', p.id, 'page')
    persist(get())
    if (serverMode()) pushNow(async () => { await postPage(p); for (const b of newBlocks) await postBlock(b) })
    return p
  },
  movePage: (id, newParentId) => {
    const pages = get().pages
    const page = pages.find(p => p.id === id)
    if (!page) return false
    if (newParentId === id) return false
    if (newParentId) {
      const target = pages.find(p => p.id === newParentId)
      if (!target || target.isTrashed) return false
      // prevent cycles: new parent must not be a descendant of the moved page
      let cursor: Page | undefined = target
      const seen = new Set<string>()
      while (cursor && cursor.parentId) {
        if (seen.has(cursor.id)) break
        seen.add(cursor.id)
        if (cursor.parentId === id) return false
        cursor = pages.find(p => p.id === cursor!.parentId)
      }
    }
    if ((page.parentId ?? null) === (newParentId ?? null)) return true
    set(s => ({ pages: s.pages.map(p => p.id === id ? { ...p, parentId: newParentId ?? null, updatedAt: new Date().toISOString() } : p) }))
    get().addActivity('page_updated', id, 'page')
    persist(get())
    if (serverMode()) queuePush(`page:${id}`, () => patchPage(id, { parentId: newParentId ?? null }))
    return true
  },
  updatePage: (id, patch) => {
    const before = get().pages.find(p => p.id===id)
    set(s => ({ pages: s.pages.map(p => p.id===id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)}))
    // share transition → activity + automation (page_shared)
    if (before && (patch.shareMode !== undefined || (patch as Partial<Page>).isShared !== undefined)) {
      const after = get().pages.find(p => p.id===id)
      const visBefore = before.shareMode ?? (before.isShared ? 'workspace' : 'private')
      const visAfter = after?.shareMode ?? (after?.isShared ? 'workspace' : 'private')
      if (visBefore === 'private' && visAfter !== 'private' && after) {
        get().addActivity('page_shared', id, 'page')
        emitAutomation({ type: 'page_shared', actorId: get().user.id, pageId: id, title: after.title, visibility: visAfter })
      }
    }
    persist(get())
    if (serverMode()) queuePush(`page:${id}`, () => patchPage(id, patch))
  },
  deletePage: (id) => {
    set(s => ({ pages: s.pages.map(p => p.id===id ? { ...p, isTrashed: true } : p)}))
    persist(get())
    if (serverMode()) queuePush(`page:${id}`, () => patchPage(id, { isTrashed: true }))
  },
  duplicatePage: (id) => {
    const p = get().pages.find(x=>x.id===id)
    if (!p) return
    const copy: Page = { ...p, id: uid(), title: p.title + ' (copy)', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s => ({ pages: [...s.pages, copy]}))
    // duplicate blocks
    const blks = get().blocks.filter(b=>b.pageId===id)
    const newBlocks = blks.map(b=> ({ ...b, id: uid(), pageId: copy.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    set(s=> ({ blocks: [...s.blocks, ...newBlocks]}))
    persist(get())
    if (serverMode()) pushNow(async () => { await postPage(copy); for (const b of newBlocks) await postBlock(b) })
  },
  toggleFavorite: (id) => {
    set(s=> ({ pages: s.pages.map(p=> p.id===id ? { ...p, isFavorite: !p.isFavorite }:p)}))
    get().addActivity('page_favorited', id, 'page')
    persist(get())
    if (serverMode()) {
      const fav = get().pages.find(p=> p.id===id)?.isFavorite
      queuePush(`page:${id}`, () => patchPage(id, { isFavorite: fav }))
    }
  },
  archivePage: (id) => { set(s=> ({ pages: s.pages.map(p=> p.id===id?{...p, isArchived:true}:p)})); if (serverMode()) queuePush(`page:${id}`, () => patchPage(id, { isArchived: true })) },
  restorePage: (id) => { set(s=> ({ pages: s.pages.map(p=> p.id===id?{...p, isTrashed:false, isArchived:false}:p)})); if (serverMode()) queuePush(`page:${id}`, () => patchPage(id, { isTrashed: false, isArchived: false } as any)) },

  addBlock: (pageId, type, content='', pos) => {
    const blocksForPage = get().blocks.filter(b=>b.pageId===pageId)
    const position = pos ?? blocksForPage.length
    const b: Block = { id: uid(), pageId, parentId: null, type, content, properties: {}, position, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> {
      // shift positions
      const updated = s.blocks.map(bl=> bl.pageId===pageId && bl.position >= position ? { ...bl, position: bl.position+1 } : bl)
      return { blocks: [...updated, b].sort((a,b)=> a.pageId===b.pageId ? a.position-b.position : 0) }
    })
    get().addActivity('block_created', b.id, 'block')
    persist(get())
    if (serverMode()) pushNow(() => postBlock(b))
    maybeAutoCapture(pageId)
    return b
  },
  restorePageBlocks: (pageId, snapshot) => {
    const now = new Date().toISOString()
    const normalized = [...snapshot]
      .sort((a, b) => a.position - b.position)
      .map((b, i) => ({ ...b, pageId, position: i, updatedAt: now }))
    set(s => ({
      blocks: [...s.blocks.filter(b => b.pageId !== pageId), ...normalized],
      historyRev: s.historyRev + 1,
    }))
    persist(get())
    if (serverMode()) queuePush(`reconcile:${pageId}`, () => reconcilePageBlocks(pageId, get().blocks.filter(b => b.pageId === pageId)), 1500)
  },
  updateBlock: (id, patch) => {
    const pageId = get().blocks.find(b=> b.id===id)?.pageId
    set(s=> ({ blocks: s.blocks.map(b=> b.id===id?{...b, ...patch, updatedAt: new Date().toISOString()}:b)}))
    // debounce persist happens via effect
    if (serverMode()) queuePush(`block:${id}`, () => patchBlock(id, patch))
    if (pageId) maybeAutoCapture(pageId)
  },
  deleteBlock: (id) => {
    const pageId = get().blocks.find(b=>b.id===id)?.pageId
    set(s=> ({ blocks: s.blocks.filter(b=>b.id!==id)}))
    get().addActivity('block_deleted', id, 'block')
    persist(get())
    if (serverMode()) pushNow(() => deleteBlockRemote(id))
    if (pageId) maybeAutoCapture(pageId)
  },
  moveBlock: (id, newPos) => {
    const bl = get().blocks.find(b=>b.id===id)
    if (!bl) return
    const pageBlocks = get().blocks.filter(b=>b.pageId===bl.pageId).sort((a,b)=>a.position-b.position)
    const filtered = pageBlocks.filter(b=>b.id!==id)
    filtered.splice(newPos, 0, { ...bl, position: newPos })
    const reindexed = filtered.map((b,i)=> ({...b, position:i}))
    set(s=> ({ blocks: [...s.blocks.filter(b=>b.pageId!==bl.pageId), ...reindexed]}))
    persist(get())
    if (serverMode()) queuePush(`reorder:${bl.pageId}`, () => reorderRemoteBlocks(bl.pageId, reindexed.map(b=> b.id)))
    maybeAutoCapture(bl.pageId)
  },
  duplicateBlock: (id) => {
    const bl = get().blocks.find(b=>b.id===id)
    if (!bl) return
    const copy = { ...bl, id: uid(), position: bl.position+1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ blocks: [...s.blocks.map(b=> b.pageId===bl.pageId && b.position>bl.position ? {...b, position:b.position+1}:b), copy]}))
    persist(get())
    if (serverMode()) pushNow(() => postBlock(copy))
    maybeAutoCapture(bl.pageId)
  },

  createDatabase: (name) => {
    // First view follows Settings → Databases → defaultView (Postgres: database_views row order).
    const preferred = get().settings?.databases?.defaultView ?? 'table'
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    const mkView = (type: typeof preferred) => ({ id: uid(), name: cap(type), type })
    const propNameId = uid()
    const propStatusId = uid()
    const views = preferred === 'table'
      ? [mkView('table'), { id: uid(), name: 'Board', type: 'board' as const, groupBy: propStatusId }]
      : [mkView(preferred), mkView('table')]
    const db: Database = { id: uid(), workspaceId: get().workspace.id, name, icon: '▦', properties: [
      { id: propNameId, name: 'Name', type: 'text', visible: true },
      { id: propStatusId, name: 'Status', type: 'status', options: ['Todo','Doing','Done'], visible: true },
    ], views, createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ databases: [...s.databases, db], selectedDatabaseId: db.id }))
    persist(get())
    if (serverMode()) pushNow(() => postDatabase(db))
    return db
  },
  updateDatabase: (id, patch) => {
    const clean: Partial<Database> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, 100)
      if (!name) return
      clean.name = name
    }
    if (patch.icon !== undefined) clean.icon = patch.icon.slice(0, 50)
    if (patch.description !== undefined) clean.description = patch.description.slice(0, 2000)
    if (patch.isFavorite !== undefined) clean.isFavorite = patch.isFavorite
    if (Object.keys(clean).length === 0) return
    set(s=> ({ databases: s.databases.map(d=> d.id===id ? { ...d, ...clean, updatedAt: new Date().toISOString() } : d)}))
    persist(get())
    if (serverMode()) queuePush(`db:${id}`, () => patchDatabase(id, clean))
  },
  toggleDatabaseFavorite: (id) => {
    const db = get().databases.find(d=> d.id===id)
    if (!db) return
    get().updateDatabase(id, { isFavorite: !db.isFavorite })
  },
  deleteDatabase: (id) => {
    set(s=> ({
      databases: s.databases.filter(d=> d.id!==id),
      records: s.records.filter(r=> r.databaseId!==id),
      selectedDatabaseId: s.selectedDatabaseId===id ? null : s.selectedDatabaseId,
    }))
    get().addActivity('database_deleted', id, 'database')
    persist(get())
    if (serverMode()) pushNow(() => deleteDatabaseRemote(id))
  },
  createRecord: (dbId, props) => {
    const r: DatabaseRecord = { id: uid(), databaseId: dbId, properties: props, position: get().records.filter(x=>x.databaseId===dbId).length, createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ records: [...s.records, r]}))
    get().addActivity('record_created', r.id, 'record')
    persist(get())
    if (serverMode()) pushNow(() => postRecord(r))
    return r
  },
  importRecords: (dbId, rows) => {
    if (rows.length === 0) return []
    const base = get().records.filter(x => x.databaseId === dbId).length
    const now = new Date().toISOString()
    const userId = get().user.id
    const created: DatabaseRecord[] = rows.map((props, i) => ({
      id: uid(), databaseId: dbId, properties: props,
      position: base + i, createdBy: userId, createdAt: now, updatedAt: now,
    }))
    set(s => ({ records: [...s.records, ...created] }))
    get().addActivity('record_created', dbId, 'database')
    persist(get())
    if (serverMode()) pushNow(async () => { for (const r of created) await postRecord(r) })
    return created
  },
  updateRecord: (id, props) => {
    const rec = get().records.find(r=> r.id===id)
    const db = rec ? get().databases.find(d=> d.id===rec.databaseId) : undefined
    set(s=> ({ records: s.records.map(r=> r.id===id ? { ...r, properties: { ...r.properties, ...props }, updatedAt: new Date().toISOString() }:r)}))
    // keep linked record-page title in sync with the title property
    if (rec?.pageId) {
      const dbForTitle = get().databases.find(d=> d.id===rec.databaseId)
      const titleProp = dbForTitle?.properties[0]?.id
      if (titleProp && titleProp in props) {
        const t = getRecordTitle(dbForTitle!, { properties: { ...rec.properties, ...props } })
        set(s=> ({ pages: s.pages.map(p=> p.id===rec.pageId ? { ...p, title: t, updatedAt: new Date().toISOString() } : p)}))
        if (serverMode()) queuePush(`page:${rec.pageId}`, () => patchPage(rec.pageId!, { title: t }))
      }
    }
    // automation: status → Done + person assignment (Activity → Notification)
    if (rec && db) {
      const titleProp = db.properties[0]?.id
      const title = titleProp ? String(rec.properties[titleProp] ?? (props[titleProp] as string) ?? 'Untitled') : 'Untitled record'
      for (const [propId, newVal] of Object.entries(props)) {
        const prop = db.properties.find(p => p.id === propId)
        if (!prop) continue
        if ((prop.type === 'status' || prop.type === 'select') && isDoneTransition(rec.properties[propId], newVal)) {
          get().addActivity('record_updated', id, 'record')
          emitAutomation({ type: 'status_done', actorId: get().user.id, databaseId: rec.databaseId, recordId: id, title })
        } else if (prop.type === 'person' && newVal && String(newVal).trim() && String(rec.properties[propId] ?? '') !== String(newVal)) {
          get().addActivity('task_assigned', id, 'record')
          emitAutomation({ type: 'task_assigned', actorId: get().user.id, databaseId: rec.databaseId, recordId: id, assignee: String(newVal), title })
        }
      }
    }
    persist(get())
    if (serverMode()) queuePush(`record:${id}`, () => patchRecord(id, { properties: props }))
  },
  deleteRecord: (id) => {
    const rec = get().records.find(r=> r.id===id)
    set(s=> ({
      records: s.records.filter(r=>r.id!==id),
      // clean up the linked record-page (blocks, page, record comments) so no orphans remain
      pages: rec?.pageId ? s.pages.filter(p=> p.id!==rec.pageId) : s.pages,
      blocks: rec?.pageId ? s.blocks.filter(b=> b.pageId!==rec.pageId) : s.blocks,
      comments: s.comments.filter(c=> c.recordId!==id),
    }))
    persist(get())
    if (serverMode()) {
      pushNow(() => deleteRecordRemote(id))
      if (rec?.pageId) pushNow(() => deletePageRemote(rec.pageId!))
    }
  },
  ensureRecordPage: (recordId) => {
    const rec = get().records.find(r=> r.id===recordId)
    if (!rec) return null
    if (rec.pageId) {
      const existing = get().pages.find(p=> p.id===rec.pageId)
      if (existing) return existing
    }
    const db = get().databases.find(d=> d.id===rec.databaseId)
    const now = new Date().toISOString()
    const p: Page = {
      id: uid(),
      workspaceId: db?.workspaceId ?? get().workspace.id,
      parentId: null,
      title: db ? getRecordTitle(db, rec) : 'Untitled',
      icon: '📄',
      iconType: 'emoji',
      isFavorite: false, isArchived: false, isTrashed: false, isShared: false,
      createdBy: get().user.id, updatedBy: get().user.id, createdAt: now, updatedAt: now,
    }
    const firstBlock: Block = { id: uid(), pageId: p.id, parentId: null, type: 'paragraph', content: '', properties: {}, position: 0, createdAt: now, updatedAt: now }
    set(s=> ({
      pages: [...s.pages, p],
      blocks: [...s.blocks, firstBlock],
      records: s.records.map(r=> r.id===recordId ? { ...r, pageId: p.id } : r),
    }))
    persist(get())
    if (serverMode()) pushNow(async () => { await postPage(p); await postBlock(firstBlock); await patchRecord(recordId, { pageId: p.id }) })
    return p
  },

  addProperty: (dbId, prop) => {
    const p: DatabaseProperty = {
      id: uid(),
      name: prop.name.trim() || 'Untitled',
      type: prop.type,
      options: prop.options ?? (['select', 'multi_select', 'status'].includes(prop.type) ? ['Option 1'] : undefined),
      visible: true,
      width: 160,
    }
    set(s => ({
      databases: s.databases.map(d => d.id === dbId ? { ...d, properties: [...d.properties, p], updatedAt: new Date().toISOString() } : d),
      // backfill default for existing records
      records: s.records.map(r => r.databaseId === dbId ? { ...r, properties: { ...r.properties, [p.id]: defaultForProperty(p) } } : r),
    }))
    persist(get())
    pushDbSchema(dbId)
    return p
  },
  updateProperty: (dbId, propId, patch) => {
    set(s => ({
      databases: s.databases.map(d => {
        if (d.id !== dbId) return d
        return {
          ...d,
          properties: d.properties.map(p => {
            if (p.id !== propId) return p
            const next = { ...p, ...patch }
            // ensure option-based types always have at least one option
            if (['select', 'multi_select', 'status'].includes(next.type) && (!next.options || next.options.length === 0)) {
              next.options = ['Option 1']
            }
            // drop options when switching away from option types
            if (!['select', 'multi_select', 'status'].includes(next.type)) delete (next as Partial<DatabaseProperty>).options
            return next
          }),
          updatedAt: new Date().toISOString(),
        }
      }),
    }))
    persist(get())
    pushDbSchema(dbId)
  },
  deleteProperty: (dbId, propId) => {
    set(s => ({
      databases: s.databases.map(d => d.id === dbId ? { ...d, properties: d.properties.filter(p => p.id !== propId), updatedAt: new Date().toISOString() } : d),
      records: s.records.map(r => {
        if (r.databaseId !== dbId) return r
        const next = { ...r.properties }
        delete next[propId]
        return { ...r, properties: next }
      }),
    }))
    persist(get())
    pushDbSchema(dbId)
  },
  reorderProperty: (dbId, propId, direction) => {
    set(s => ({
      databases: s.databases.map(d => {
        if (d.id !== dbId) return d
        const idx = d.properties.findIndex(p => p.id === propId)
        if (idx === -1) return d
        const next = [...d.properties]
        const target = typeof direction === 'number' ? direction : direction === 'left' ? idx - 1 : idx + 1
        if (target < 0 || target >= next.length) return d
        const [moved] = next.splice(idx, 1)
        next.splice(target, 0, moved)
        return { ...d, properties: next, updatedAt: new Date().toISOString() }
      }),
    }))
    persist(get())
    pushDbSchema(dbId)
  },
  duplicateProperty: (dbId, propId) => {
    const db = get().databases.find(d => d.id === dbId)
    const orig = db?.properties.find(p => p.id === propId)
    if (!db || !orig) return
    const copy: DatabaseProperty = { ...orig, id: uid(), name: `${orig.name} (copy)` }
    set(s => ({
      databases: s.databases.map(d => d.id === dbId ? { ...d, properties: [...d.properties, copy], updatedAt: new Date().toISOString() } : d),
      records: s.records.map(r => r.databaseId === dbId ? { ...r, properties: { ...r.properties, [copy.id]: r.properties[propId] ?? defaultForProperty(copy) } } : r),
    }))
    persist(get())
    pushDbSchema(dbId)
  },

  addActivity: (action, targetId, targetType) => {
    const a: Activity = { id: uid(), workspaceId: get().workspace.id, userId: get().user.id, action, targetId, targetType, createdAt: new Date().toISOString() }
    set(s=> ({ activities: [a, ...s.activities].slice(0,50)}))
    persist(get())
    if (serverMode()) queuePush(`activity:${a.id}`, () => postActivity(a))
  },
  addComment: (c) => {
    const comment: Comment = { ...c, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Comment
    set(s=> ({ comments: [...s.comments, comment]}))
    get().addActivity('comment_added', comment.pageId ?? comment.recordId ?? comment.blockId ?? comment.id, comment.recordId ? 'record' : 'page')
    emitAutomation({
      type: 'comment_added', actorId: get().user.id, commentId: comment.id,
      pageId: comment.pageId, recordId: comment.recordId, blockId: comment.blockId,
      snippet: comment.content,
    })
    const mentioned = [...(comment.mentions ?? []), ...parseMentions(comment.content ?? '')]
    if (mentioned.length > 0) {
      get().addActivity('mention', comment.id, 'comment')
      emitAutomation({
        type: 'mention', actorId: get().user.id, commentId: comment.id,
        pageId: comment.pageId, recordId: comment.recordId, blockId: comment.blockId,
        mentioned, snippet: comment.content,
      })
    }
    persist(get())
    if (serverMode()) pushNow(() => postComment(comment))
  },
  updateComment: async (id, patch) => {
    set(s => ({ comments: s.comments.map(x => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } as Comment : x) }))
    persist(get())
    if (serverMode()) queuePush(`comment:${id}`, () => patchCommentRemote(id, patch))
  },
  deleteComment: async (id) => {
    set(s => ({ comments: s.comments.filter(x => x.id !== id) }))
    persist(get())
    if (serverMode()) pushNow(() => deleteCommentRemote(id))
  },
  captureVersion: (pageId, message) => {
    const s = get()
    const blocks = s.blocks.filter((b) => b.pageId === pageId)
    const existing = s.versions[pageId] ?? []
    const v = buildVersion(pageId, blocks, nextVersionNumber(existing), {
      id: uid(), createdBy: s.user.id, createdAt: new Date().toISOString(), message,
    })
    const next = { ...s.versions, [pageId]: appendVersion(existing, v) }
    set({ versions: next })
    saveVersions(next)
    return v
  },
  restoreVersion: (pageId, versionId) => {
    const s = get()
    const v = s.versions[pageId]?.find((x) => x.id === versionId)
    if (!v) return false
    // Safety snapshot first so a restore is itself undoable via history.
    s.captureVersion(pageId, `Before restore to v${v.version}`)
    get().restorePageBlocks(pageId, v.blocksSnapshot.map((b) => ({ ...b })))
    return true
  },
  addFile: (meta) => {
    const now = new Date().toISOString()
    const f: FileAsset = {
      id: uid(), workspaceId: get().workspace.id, filename: meta.filename.slice(0, 255),
      mimeType: meta.mimeType || 'application/octet-stream', size: Math.max(0, Math.floor(meta.size) || 0),
      storageKey: meta.storageKey, url: meta.url, uploadedBy: get().user.id, createdAt: now,
    }
    set(s => ({ files: [f, ...s.files].slice(0, 500) }))
    get().addActivity('file_uploaded', f.id, 'file')
    persist(get())
    if (serverMode()) pushNow(() => postFileMeta(f))
    return f
  },
  removeFile: (id) => {
    const f = get().files.find((x) => x.id === id)
    set(s => ({ files: s.files.filter((x) => x.id !== id) }))
    persist(get())
    // Best-effort bytes cleanup; metadata delete is authoritative.
    if (f?.storageKey) storageService.getActive().delete(f.storageKey).catch(() => {})
    if (serverMode()) pushNow(() => deleteFileRemote(id))
  },
  refreshFiles: async () => {
    if (!serverMode()) return
    try {
      const remote = await fetchFiles(get().workspace.id)
      if (Array.isArray(remote)) {
        set({ files: (remote as FileAsset[]).slice(0, 500) })
        persist(get())
      }
    } catch { /* offline — keep local cache */ }
  },
}))

function persist(state: any) {
  try {
    const toSave = {
      pages: state.pages, blocks: state.blocks, databases: state.databases, records: state.records,
      comments: state.comments ?? [], files: state.files ?? [],
      activities: (state.activities ?? []).slice(0, 50),
      notifications: (state.notifications ?? []).slice(0, 100),
      user: state.user, workspace: state.workspace,
      themeMode: state.themeMode ?? state.settings?.themeMode,
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(toSave))
    localStorage.setItem(STATE_BACKUP_KEY, JSON.stringify({ ...toSave, at: new Date().toISOString()}))
    try { localStorage.removeItem(LEGACY_STATE_KEY) } catch { /* noop */ }
    if (state.settings) saveSettings(state.settings)
  } catch {}
}

// autosave debounce wrapper
let saveTimer:any
useAppStore.subscribe((state)=>{
  clearTimeout(saveTimer)
  saveTimer = setTimeout(()=> persist(state), 400)
})

// backend push failures surface as sync status (slice 2)
onSyncStatus((s, error) => {
  if (s === 'local' || s === 'syncing') return
  useAppStore.setState({ syncStatus: s, lastSyncError: s === 'error' ? (error ?? 'Sync failed') : null })
})
