import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { Card, CardContent, CardHeader } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { storageService } from '@/lib/storageService'
import type { ThemeMode, DatabaseDefaultView } from '@/lib/settings'

type TabId = 'account' | 'workspace' | 'appearance' | 'editor' | 'databases' | 'notifications' | 'storage' | 'collaboration' | 'data'

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'account', label: 'Account', hint: 'Profile' },
  { id: 'workspace', label: 'Workspace', hint: 'Name, members' },
  { id: 'appearance', label: 'Appearance', hint: 'Theme, font' },
  { id: 'editor', label: 'Editor', hint: 'Defaults' },
  { id: 'databases', label: 'Databases', hint: 'Views, paging' },
  { id: 'notifications', label: 'Notifications', hint: 'Prefs' },
  { id: 'storage', label: 'Storage & Export', hint: 'Provider, backup' },
  { id: 'collaboration', label: 'Collaboration', hint: 'Phase 7 ready' },
  { id: 'data', label: 'Security & Data', hint: 'Backend, danger' },
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full p-1 transition-colors ${checked ? 'bg-primary' : 'bg-muted border'}`}
    >
      <span className={`block w-4 h-4 rounded-full bg-background shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function Row({ label, desc, right }: { label: string; desc?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  )
}

export function Settings() {
  const {
    user, workspace, pages, databases, records, notifications,
    theme, themeMode, settings, sidebarCollapsed,
    setThemeMode, toggleSidebar, updateUser, updateWorkspace, updateSettings,
    markAllNotificationsRead, emptyTrash,
  } = useAppStore()
  const { push } = useToast()
  const [tab, setTab] = useState<TabId>('account')

  // drafts (Save applies to store)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [wsName, setWsName] = useState(workspace.name)
  const [wsIcon, setWsIcon] = useState(workspace.icon ?? '')
  const [wsUrl, setWsUrl] = useState(settings.collaboration.wsUrl)

  const stats = useMemo(() => ({
    pages: pages.length,
    trashed: pages.filter(p => p.isTrashed).length,
    databases: databases.length,
    records: records.length,
    unread: notifications.filter(n => !n.read).length,
  }), [pages, databases, records, notifications])

  const storageUsage = useMemo(() => {
    const size = (k: string) => {
      try { return (localStorage.getItem(k) ?? '').length } catch { return 0 }
    }
    const bytes = size('nexus_state_v1') + size('nexus_files') + size('nexus_settings_v1')
    return { kb: (bytes / 1024).toFixed(1), bytes }
  }, [pages, records, settings])

  const saveAccount = () => {
    if (!name.trim()) { push({ title: 'Name is required' }); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { push({ title: 'Enter a valid email' }); return }
    updateUser({ name: name.trim(), email: email.trim() })
    push({ title: 'Account saved', desc: 'Profile persists across reloads.' })
  }

  const saveWorkspace = () => {
    if (!wsName.trim()) { push({ title: 'Workspace name is required' }); return }
    updateWorkspace({ name: wsName.trim(), icon: wsIcon.trim() || undefined })
    push({ title: 'Workspace saved' })
  }

  const exportWorkspace = () => {
    const s = useAppStore.getState()
    const dump = {
      exportedAt: new Date().toISOString(),
      user: s.user, workspace: s.workspace,
      pages: s.pages, blocks: s.blocks,
      databases: s.databases, records: s.records,
      settings: s.settings,
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nexus-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    push({ title: 'Workspace exported', desc: `${stats.pages} pages, ${stats.records} records.` })
  }

  return (
    <div className="max-w-[900px] mx-auto p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {stats.pages} pages · {stats.databases} databases · {stats.records} records · {storageUsage.kb} KB local
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <nav aria-label="Settings sections" className="rounded-2xl border bg-card p-2 space-y-1 lg:sticky lg:top-4">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${tab === t.id ? 'bg-accent font-medium' : 'hover:bg-accent text-muted-foreground'}`}
              >
                <span className="flex-1">{t.label}</span>
                <span className="text-[11px] text-muted-foreground hidden xl:inline">{t.hint}</span>
              </button>
            ))}
          </nav>
          <div className="rounded-2xl border bg-card p-4 text-xs text-muted-foreground">
            Backend: <span className="font-medium text-foreground">local JSON</span> (server/db.json).
            Postgres-ready via migrations/001_initial.sql + DATABASE_URL (Phase 1).
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {tab === 'account' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Account</h3></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <img src={`https://i.pravatar.cc/100?u=${user.id}`} className="w-16 h-16 rounded-2xl" alt="avatar" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">ID {user.id} · demo auth stub (bcrypt/JWT in Phase 1)</div>
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto" onClick={() => push({ title: 'Avatar upload coming soon', desc: 'Uses Storage provider when wired.' })}>Change avatar</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium" htmlFor="set-name">Name</label><Input id="set-name" value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
                  <div><label className="text-xs font-medium" htmlFor="set-email">Email</label><Input id="set-email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveAccount}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setName(user.name); setEmail(user.email) }}>Reset</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'workspace' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Workspace</h3></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
                  <div><label className="text-xs font-medium" htmlFor="ws-name">Workspace name</label><Input id="ws-name" value={wsName} onChange={e => setWsName(e.target.value)} className="mt-1" /></div>
                  <div><label className="text-xs font-medium" htmlFor="ws-icon">Icon</label><Input id="ws-icon" value={wsIcon} onChange={e => setWsIcon(e.target.value)} className="mt-1" maxLength={4} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveWorkspace}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => push({ title: 'Invites land in Phase 5', desc: 'Role hierarchy owner>admin>editor>commenter>viewer is already in permissions.ts.' })}>Invite members</Button>
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs font-medium mb-2">Members (stub for permission enforcement)</div>
                  <div className="flex items-center gap-3 p-2 rounded-xl border">
                    <img src={`https://i.pravatar.cc/40?u=${user.id}`} className="w-8 h-8 rounded-lg" alt="" />
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{user.name}</div><div className="text-xs text-muted-foreground truncate">{user.email}</div></div>
                    <Badge>owner</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'appearance' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Appearance</h3></CardHeader>
              <CardContent className="space-y-2 divide-y">
                <Row label="Theme" desc={`Currently ${theme} (${themeMode}) · system follows OS`} right={
                  <div className="flex items-center gap-1 p-1 rounded-xl border bg-muted" role="radiogroup" aria-label="Theme">
                    {(['light', 'dark', 'system'] as ThemeMode[]).map(t => (
                      <button key={t} role="radio" aria-checked={themeMode === t} onClick={() => { setThemeMode(t); push({ title: `Theme: ${t}` }) }} className={`px-3 py-1.5 rounded-lg text-xs capitalize ${themeMode === t ? 'bg-background shadow border' : 'hover:bg-accent'}`}>{t}</button>
                    ))}
                  </div>
                } />
                <Row label="Compact mode" desc="Tighter radius + denser layout (CSS var --radius)" right={
                  <Toggle label="Compact mode" checked={settings.compactMode} onChange={v => updateSettings({ compactMode: v })} />
                } />
                <Row label="Sidebar" desc={sidebarCollapsed ? 'Currently collapsed' : 'Currently expanded'} right={
                  <div className="flex items-center gap-2">
                    <select aria-label="Default sidebar" value={settings.sidebarDefault} onChange={e => { updateSettings({ sidebarDefault: e.target.value as 'expanded' | 'collapsed' }); push({ title: 'Sidebar default saved' }) }} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                      <option value="expanded">Expanded</option>
                      <option value="collapsed">Collapsed</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={() => toggleSidebar()}>{sidebarCollapsed ? 'Expand now' : 'Collapse now'}</Button>
                  </div>
                } />
                <Row label="Font" desc="Global font (per-block fonts stay in editor)" right={
                  <select aria-label="Global font" value={settings.fontFamily} onChange={e => { updateSettings({ fontFamily: e.target.value as typeof settings.fontFamily }); push({ title: 'Font applied' }) }} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                    <option value="inter">Inter</option>
                    <option value="system">System</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Mono</option>
                  </select>
                } />
              </CardContent>
            </Card>
          )}

          {tab === 'editor' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Editor defaults</h3><p className="text-xs text-muted-foreground">Applies to new pages/blocks. Realtime collab (Yjs) + nested blocks land in Phase 2.</p></CardHeader>
              <CardContent className="space-y-2 divide-y">
                <Row label="Default block" desc="Block created on Enter / new page" right={
                  <select aria-label="Default block" value={settings.editor.defaultBlock} onChange={e => updateSettings({ editor: { defaultBlock: e.target.value as typeof settings.editor.defaultBlock } })} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                    <option value="paragraph">Paragraph</option>
                    <option value="heading1">Heading 1</option>
                    <option value="bulleted_list">Bulleted list</option>
                    <option value="todo">Todo</option>
                  </select>
                } />
                <Row label="Spellcheck" desc="Passed to contentEditable" right={
                  <Toggle label="Spellcheck" checked={settings.editor.spellcheck} onChange={v => updateSettings({ editor: { spellcheck: v } })} />
                } />
                <Row label="Word count" desc="Show counts in editor (future)" right={
                  <Toggle label="Word count" checked={settings.editor.wordCount} onChange={v => updateSettings({ editor: { wordCount: v } })} />
                } />
                <Row label="Autosave delay" desc="Debounce for persist (current default 400ms)" right={
                  <select aria-label="Autosave delay" value={settings.editor.autoSaveDelayMs} onChange={e => updateSettings({ editor: { autoSaveDelayMs: Number(e.target.value) } })} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                    {[200, 400, 800, 1500].map(ms => <option key={ms} value={ms}>{ms}ms</option>)}
                  </select>
                } />
              </CardContent>
            </Card>
          )}

          {tab === 'databases' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Databases</h3><p className="text-xs text-muted-foreground">Defaults for new databases. Virtualization + rollups land in Phase 3.</p></CardHeader>
              <CardContent className="space-y-2 divide-y">
                <Row label="Default view" desc="Used when creating a database" right={
                  <select aria-label="Default view" value={settings.databases.defaultView} onChange={e => updateSettings({ databases: { defaultView: e.target.value as DatabaseDefaultView } })} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                    {(['table', 'board', 'calendar', 'gallery', 'list', 'timeline'] as const).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                } />
                <Row label="Rows per page" desc="Pagination target (10k-record virtualization future)" right={
                  <select aria-label="Rows per page" value={settings.databases.pageSize} onChange={e => updateSettings({ databases: { pageSize: Number(e.target.value) } })} className="border rounded-xl px-2 py-1.5 text-sm bg-background">
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                } />
                <Row label="Relation rollups" desc="Phase 3: count/sum across relations" right={
                  <div className="flex items-center gap-2"><Badge>Phase 3</Badge><Toggle label="Relation rollups" checked={settings.databases.rollupFormulas} onChange={v => updateSettings({ databases: { rollupFormulas: v } })} /></div>
                } />
                <Row label="Linked embeds" desc="Phase 3: per-embed filter/sort (now preview only)" right={
                  <div className="flex items-center gap-2"><Badge>Phase 3</Badge><Toggle label="Linked embeds" checked={settings.databases.linkedEmbeds} onChange={v => updateSettings({ databases: { linkedEmbeds: v } })} /></div>
                } />
              </CardContent>
            </Card>
          )}

          {tab === 'notifications' && (
            <Card className="rounded-2xl">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold flex-1">Notifications</h3>
                  <Badge>{stats.unread} unread</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 divide-y">
                <Row label="Mentions" desc="You were mentioned" right={<Toggle label="Mentions" checked={settings.notifications.mentions} onChange={v => updateSettings({ notifications: { mentions: v } })} />} />
                <Row label="Comments" desc="Replies on followed pages" right={<Toggle label="Comments" checked={settings.notifications.comments} onChange={v => updateSettings({ notifications: { comments: v } })} />} />
                <Row label="Shares" desc="Page shared with you" right={<Toggle label="Shares" checked={settings.notifications.shares} onChange={v => updateSettings({ notifications: { shares: v } })} />} />
                <Row label="Tasks" desc="Task assigned (automation bus in Phase 5)" right={<Toggle label="Tasks" checked={settings.notifications.tasks} onChange={v => updateSettings({ notifications: { tasks: v } })} />} />
                <div className="pt-3"><Button variant="outline" size="sm" onClick={() => { markAllNotificationsRead(); push({ title: 'All notifications marked read' }) }}>Mark all read</Button></div>
              </CardContent>
            </Card>
          )}

          {tab === 'storage' && (
            <div className="space-y-6">
              <Card className="rounded-2xl">
                <CardHeader><h3 className="font-semibold">Storage provider</h3><p className="text-xs text-muted-foreground">Abstraction in storageService.ts — local now, S3/R2/Supabase later.</p></CardHeader>
                <CardContent className="space-y-2">
                  {storageService.list().map(s => {
                    const active = s.id === settings.storageProviderId
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border">
                        <div><div className="text-sm font-medium">{s.name}</div><div className="text-xs text-muted-foreground">id: {s.id}</div></div>
                        {active
                          ? <Badge>Active</Badge>
                          : <Button size="sm" variant="outline" onClick={() => { try { storageService.setActive(s.id) } catch { /* stub throws on use, not switch */ } updateSettings({ storageProviderId: s.id }); push({ title: `Storage: ${s.name}` }) }}>Switch</Button>}
                      </div>
                    )
                  })}
                  <div className="text-xs text-muted-foreground">Local usage ~{storageUsage.kb} KB. S3 stub throws until configured — switching is safe, uploads stay local.</div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader><h3 className="font-semibold">Import / Export</h3><p className="text-xs text-muted-foreground">Markdown/CSV/PDF per project.md §31 — JSON available now, CSV lives in Table view.</p></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={exportWorkspace}>Export workspace JSON</Button>
                  <Button size="sm" variant="outline" onClick={() => push({ title: 'Import lands with CSV phase', desc: 'Use Table → Import/Export for databases today.' })}>Import</Button>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'collaboration' && (
            <Card className="rounded-2xl">
              <CardHeader><h3 className="font-semibold">Collaboration</h3><p className="text-xs text-muted-foreground">Live Yjs sync is ready — run <code>npm run collab</code> (or <code>dev:all</code>), set the sync URL, enable presence. Empty URL = offline editing only.</p></CardHeader>
              <CardContent className="space-y-2 divide-y">
                <Row label="Presence" desc="Avatars + live cursors (WebSocket)" right={
                  <div className="flex items-center gap-2"><Badge>Phase 7</Badge><Toggle label="Presence" checked={settings.collaboration.presence} onChange={v => updateSettings({ collaboration: { presence: v } })} /></div>
                } />
                <Row label="Offline queue" desc="localStorage → sync queue → backend (§43)" right={
                  <div className="flex items-center gap-2"><Badge>Phase 2</Badge><Toggle label="Offline queue" checked={settings.collaboration.offlineQueue} onChange={v => updateSettings({ collaboration: { offlineQueue: v } })} /></div>
                } />
                <div className="pt-3">
                  <label className="text-xs font-medium" htmlFor="ws-url">Sync server (Yjs WebSocket)</label>
                  <div className="flex gap-2 mt-1">
                    <Input id="ws-url" placeholder="ws://localhost:3002" value={wsUrl} onChange={e => setWsUrl(e.target.value)} />
                    <Button size="sm" onClick={() => { updateSettings({ collaboration: { wsUrl: wsUrl.trim() } }); push({ title: 'Sync URL saved', desc: 'Editor connects live on next page open.' }) }}>Save</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'data' && (
            <div className="space-y-6">
              <Card className="rounded-2xl">
                <CardHeader><h3 className="font-semibold">Security & backend</h3></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span>Persistence</span><Badge>server/db.json</Badge></div>
                  <div className="flex items-center justify-between"><span>Postgres migration</span><Badge>001_initial.sql ready</Badge></div>
                  <div className="flex items-center justify-between"><span>Auth</span><Badge>stub · demo-token</Badge></div>
                  <div className="text-xs text-muted-foreground">Next: bcrypt + JWT via DATABASE_URL, Zod on server, rate limits, file validation (project.md §55).</div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-destructive/40">
                <CardHeader><h3 className="font-semibold text-destructive">Danger zone</h3></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { const n = emptyTrash(); push({ title: n === 0 ? 'Trash already empty' : `Permanently deleted ${n} page(s)` }) }}>Empty trash ({stats.trashed})</Button>
                  <Button size="sm" variant="outline" onClick={exportWorkspace}>Backup first</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm('Reset demo data? Local pages/blocks will be replaced by seed.')) { localStorage.removeItem('nexus_state_v1'); location.reload() } }}>Reset demo data</Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
