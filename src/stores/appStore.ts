import { create } from 'zustand'
import type { Page, Block, Database, DatabaseProperty, DatabaseRecord, PropertyType, Workspace, User, Activity, Notification, Comment, FileAsset } from '@/lib/types'
import { generateSeed, templatesSeed } from '@/data/seed'
import { uid } from '@/lib/utils'
import { getRecordTitle } from '@/lib/propertyDefs'
import type { AppSettings, ThemeMode } from '@/lib/settings'
import { loadSettings, saveSettings, applyAllSettings, applyThemeMode, resolveTheme, applyFont, applyCompact } from '@/lib/settings'
import { storageService } from '@/lib/storageService'

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
  // other
  addActivity: (action: Activity['action'], targetId: string, targetType: string) => void
  addComment: (c: Omit<Comment,'id'|'createdAt'|'updatedAt'>) => void
}

const defaultUser: User = { id: 'u1', email: 'alex@nexus.so', name: 'Alex Rivera', avatar: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
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

function loadOrSeed() {
  const saved = localStorage.getItem('nexus_state_v1')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (parsed?.pages) parsed.pages = (parsed.pages as Page[]).map(normalizePageIcon)
      return parsed
    } catch {}
  }
  const seed = generateSeed(defaultWorkspace.id, defaultUser.id)
  seed.pages = (seed.pages as Page[]).map(normalizePageIcon)
  return seed
}

const seedData = loadOrSeed()
const initialSettings = loadSettings()
// restore profile (persisted going forward inside nexus_state_v1)
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
  user: initialUser,
  workspace: initialWorkspace,
  pages: seedData.pages as Page[],
  blocks: seedData.blocks as Block[],
  databases: seedData.databases as Database[],
  records: seedData.records as DatabaseRecord[],
  activities: [
    { id: uid(), workspaceId: 'w1', userId: 'u1', action: 'page_created', targetId: 'p1', targetType: 'page', createdAt: new Date().toISOString() },
    { id: uid(), workspaceId: 'w1', userId: 'u1', action: 'database_created', targetId: 'db1', targetType: 'database', createdAt: new Date(Date.now()-3600000).toISOString() },
  ] as Activity[],
  notifications: [
    { id: uid(), userId: 'u1', type: 'mention', title: 'You were mentioned in Website Redesign', read: false, createdAt: new Date().toISOString() },
    { id: uid(), userId: 'u1', type: 'comment', title: 'Sam commented on Mobile App', read: false, createdAt: new Date(Date.now()-7200000).toISOString() },
  ] as Notification[],
  comments: [] as Comment[],
  files: [] as FileAsset[],
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
  markAllNotificationsRead: () => set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })) })),
  emptyTrash: () => {
    const trashed = get().pages.filter(p => p.isTrashed)
    if (trashed.length === 0) return 0
    const ids = new Set(trashed.map(p => p.id))
    set(s => ({
      pages: s.pages.filter(p => !p.isTrashed),
      blocks: s.blocks.filter(b => !ids.has(b.pageId)),
    }))
    persist(get())
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
    return true
  },
  updatePage: (id, patch) => {
    set(s => ({ pages: s.pages.map(p => p.id===id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)}))
    persist(get())
  },
  deletePage: (id) => {
    set(s => ({ pages: s.pages.map(p => p.id===id ? { ...p, isTrashed: true } : p)}))
    persist(get())
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
  },
  toggleFavorite: (id) => {
    set(s=> ({ pages: s.pages.map(p=> p.id===id ? { ...p, isFavorite: !p.isFavorite }:p)}))
    get().addActivity('page_favorited', id, 'page')
    persist(get())
  },
  archivePage: (id) => set(s=> ({ pages: s.pages.map(p=> p.id===id?{...p, isArchived:true}:p)})),
  restorePage: (id) => set(s=> ({ pages: s.pages.map(p=> p.id===id?{...p, isTrashed:false, isArchived:false}:p)})),

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
  },
  updateBlock: (id, patch) => {
    set(s=> ({ blocks: s.blocks.map(b=> b.id===id?{...b, ...patch, updatedAt: new Date().toISOString()}:b)}))
    // debounce persist happens via effect
  },
  deleteBlock: (id) => {
    set(s=> ({ blocks: s.blocks.filter(b=>b.id!==id)}))
    get().addActivity('block_deleted', id, 'block')
    persist(get())
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
  },
  duplicateBlock: (id) => {
    const bl = get().blocks.find(b=>b.id===id)
    if (!bl) return
    const copy = { ...bl, id: uid(), position: bl.position+1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ blocks: [...s.blocks.map(b=> b.pageId===bl.pageId && b.position>bl.position ? {...b, position:b.position+1}:b), copy]}))
    persist(get())
  },

  createDatabase: (name) => {
    // First view follows Settings → Databases → defaultView (Postgres: database_views row order).
    const preferred = get().settings?.databases?.defaultView ?? 'table'
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    const mkView = (type: typeof preferred) => ({ id: uid(), name: cap(type), type })
    const views = preferred === 'table'
      ? [mkView('table'), { id: uid(), name: 'Board', type: 'board' as const, groupBy: 'prop_status' }]
      : [mkView(preferred), mkView('table')]
    const db: Database = { id: uid(), workspaceId: get().workspace.id, name, icon: '▦', properties: [
      { id: 'prop_name', name: 'Name', type: 'text', visible: true },
      { id: 'prop_status', name: 'Status', type: 'status', options: ['Todo','Doing','Done'], visible: true },
    ], views, createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ databases: [...s.databases, db], selectedDatabaseId: db.id }))
    persist(get())
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
  },
  createRecord: (dbId, props) => {
    const r: DatabaseRecord = { id: uid(), databaseId: dbId, properties: props, position: get().records.filter(x=>x.databaseId===dbId).length, createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ records: [...s.records, r]}))
    get().addActivity('record_created', r.id, 'record')
    persist(get())
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
    return created
  },
  updateRecord: (id, props) => {
    const rec = get().records.find(r=> r.id===id)
    set(s=> ({ records: s.records.map(r=> r.id===id ? { ...r, properties: { ...r.properties, ...props }, updatedAt: new Date().toISOString() }:r)}))
    // keep linked record-page title in sync with the title property
    if (rec?.pageId) {
      const db = get().databases.find(d=> d.id===rec.databaseId)
      const titleProp = db?.properties[0]?.id
      if (titleProp && titleProp in props) {
        const t = getRecordTitle(db!, { properties: { ...rec.properties, ...props } })
        set(s=> ({ pages: s.pages.map(p=> p.id===rec.pageId ? { ...p, title: t, updatedAt: new Date().toISOString() } : p)}))
      }
    }
    persist(get())
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
    return p
  },

  addProperty: (dbId, prop) => {
    const p: DatabaseProperty = {
      id: `p_${uid()}`,
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
  },
  duplicateProperty: (dbId, propId) => {
    const db = get().databases.find(d => d.id === dbId)
    const orig = db?.properties.find(p => p.id === propId)
    if (!db || !orig) return
    const copy: DatabaseProperty = { ...orig, id: `p_${uid()}`, name: `${orig.name} (copy)` }
    set(s => ({
      databases: s.databases.map(d => d.id === dbId ? { ...d, properties: [...d.properties, copy], updatedAt: new Date().toISOString() } : d),
      records: s.records.map(r => r.databaseId === dbId ? { ...r, properties: { ...r.properties, [copy.id]: r.properties[propId] ?? defaultForProperty(copy) } } : r),
    }))
    persist(get())
  },

  addActivity: (action, targetId, targetType) => {
    const a: Activity = { id: uid(), workspaceId: get().workspace.id, userId: get().user.id, action, targetId, targetType, createdAt: new Date().toISOString() }
    set(s=> ({ activities: [a, ...s.activities].slice(0,50)}))
  },
  addComment: (c) => {
    const comment: Comment = { ...c, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Comment
    set(s=> ({ comments: [...s.comments, comment]}))
  }
}))

function persist(state: any) {
  try {
    const toSave = {
      pages: state.pages, blocks: state.blocks, databases: state.databases, records: state.records,
      user: state.user, workspace: state.workspace,
      themeMode: state.themeMode ?? state.settings?.themeMode,
    }
    localStorage.setItem('nexus_state_v1', JSON.stringify(toSave))
    localStorage.setItem('nexus_state_backup', JSON.stringify({ ...toSave, at: new Date().toISOString()}))
    if (state.settings) saveSettings(state.settings)
  } catch {}
}

// autosave debounce wrapper
let saveTimer:any
useAppStore.subscribe((state)=>{
  clearTimeout(saveTimer)
  saveTimer = setTimeout(()=> persist(state), 400)
})
