import { create } from 'zustand'
import type { Page, Block, Database, DatabaseRecord, Workspace, User, Activity, Notification, Comment, FileAsset } from '@/lib/types'
import { generateSeed } from '@/data/seed'
import { uid } from '@/lib/utils'

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
  // actions
  setSelectedPage: (id: string | null) => void
  setSelectedDatabase: (id: string | null) => void
  toggleSidebar: () => void
  setCommandOpen: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  toggleTheme: () => void
  createPage: (title: string, parentId?: string | null, icon?: string) => Page
  updatePage: (id: string, patch: Partial<Page>) => void
  deletePage: (id: string) => void
  duplicatePage: (id: string) => void
  toggleFavorite: (id: string) => void
  archivePage: (id: string) => void
  restorePage: (id: string) => void
  // blocks
  addBlock: (pageId: string, type: any, content?: string, pos?: number) => Block
  updateBlock: (id: string, patch: Partial<Block>) => void
  deleteBlock: (id: string) => void
  moveBlock: (id: string, newPos: number) => void
  duplicateBlock: (id: string) => void
  // databases
  createDatabase: (name: string) => Database
  createRecord: (dbId: string, props: Record<string, unknown>) => void
  updateRecord: (id: string, props: Record<string, unknown>) => void
  deleteRecord: (id: string) => void
  // other
  addActivity: (action: Activity['action'], targetId: string, targetType: string) => void
  addComment: (c: Omit<Comment,'id'|'createdAt'|'updatedAt'>) => void
}

const defaultUser: User = { id: 'u1', email: 'alex@nexus.so', name: 'Alex Rivera', avatar: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
const defaultWorkspace: Workspace = { id: 'w1', name: 'Acme Workspace', icon: '⬢', ownerId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }

function loadOrSeed() {
  const saved = localStorage.getItem('nexus_state_v1')
  if (saved) {
    try { return JSON.parse(saved) } catch {}
  }
  const seed = generateSeed(defaultWorkspace.id, defaultUser.id)
  return seed
}

const seedData = loadOrSeed()

export const useAppStore = create<AppState>((set, get) => ({
  user: defaultUser,
  workspace: defaultWorkspace,
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
  sidebarCollapsed: false,
  commandOpen: false,
  searchOpen: false,
  theme: 'dark',

  setSelectedPage: (id) => set({ selectedPageId: id, selectedDatabaseId: null }),
  setSelectedDatabase: (id) => set({ selectedDatabaseId: id, selectedPageId: null }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    return { theme: next }
  }),

  createPage: (title, parentId=null, icon) => {
    const p: Page = { id: uid(), workspaceId: get().workspace.id, parentId: parentId ?? null, title, icon, isFavorite: false, isArchived: false, isTrashed: false, isShared: false, createdBy: get().user.id, updatedBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const firstBlockId = uid()
    const firstBlock: Block = { id: firstBlockId, pageId: p.id, parentId: null, type: 'paragraph', content: '', properties: {}, position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s => ({ pages: [...s.pages, p], blocks: [...s.blocks, firstBlock], selectedPageId: p.id }))
    get().addActivity('page_created', p.id, 'page')
    persist(get())
    return p
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
    const db: Database = { id: uid(), workspaceId: get().workspace.id, name, icon: '▦', properties: [
      { id: 'prop_name', name: 'Name', type: 'text', visible: true },
      { id: 'prop_status', name: 'Status', type: 'status', options: ['Todo','Doing','Done'], visible: true },
    ], views: [{ id: uid(), name: 'Table', type: 'table' }, { id: uid(), name: 'Board', type: 'board', groupBy: 'prop_status'}], createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ databases: [...s.databases, db], selectedDatabaseId: db.id }))
    persist(get())
    return db
  },
  createRecord: (dbId, props) => {
    const r: DatabaseRecord = { id: uid(), databaseId: dbId, properties: props, position: get().records.filter(x=>x.databaseId===dbId).length, createdBy: get().user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    set(s=> ({ records: [...s.records, r]}))
    get().addActivity('record_created', r.id, 'record')
    persist(get())
  },
  updateRecord: (id, props) => {
    set(s=> ({ records: s.records.map(r=> r.id===id ? { ...r, properties: { ...r.properties, ...props }, updatedAt: new Date().toISOString() }:r)}))
    persist(get())
  },
  deleteRecord: (id) => {
    set(s=> ({ records: s.records.filter(r=>r.id!==id)}))
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
    const toSave = { pages: state.pages, blocks: state.blocks, databases: state.databases, records: state.records }
    localStorage.setItem('nexus_state_v1', JSON.stringify(toSave))
    localStorage.setItem('nexus_state_backup', JSON.stringify({ ...toSave, at: new Date().toISOString()}))
  } catch {}
}

// autosave debounce wrapper
let saveTimer:any
useAppStore.subscribe((state)=>{
  clearTimeout(saveTimer)
  saveTimer = setTimeout(()=> persist(state), 400)
})
