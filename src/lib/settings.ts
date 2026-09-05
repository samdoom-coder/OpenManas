// Central Settings model — future-proofed for roadmap (DB, collab, storage, perf, security).
// AI intentionally excluded for now (see FUTURE_UPDATES Phase 6 — stub only).
// Persisted to localStorage `openmanas_settings_v1`, applied on boot (theme/font/compact).

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
export type SidebarDefault = 'expanded' | 'collapsed'
export type DatabaseDefaultView = 'table' | 'board' | 'calendar' | 'gallery' | 'list' | 'timeline'

export interface EditorPrefs {
  defaultBlock: 'paragraph' | 'heading1' | 'bulleted_list' | 'todo'
  spellcheck: boolean
  wordCount: boolean
  autoSaveDelayMs: number // future: drives BlockEditor debounce (currently 400ms)
}

export interface DatabasePrefs {
  defaultView: DatabaseDefaultView
  pageSize: number // future: drives pagination/virtualization (10k records)
  rollupFormulas: boolean // future: Phase 3 relation rollup evaluation
  linkedEmbeds: boolean // future: Phase 3 linked database per-embed filter/sort
}

export interface NotificationPrefs {
  mentions: boolean
  comments: boolean
  shares: boolean
  tasks: boolean
}

export interface CollaborationPrefs {
  presence: boolean // future Phase 7: avatars/cursors
  offlineQueue: boolean // future Phase 2: localStorage → sync queue → backend
  wsUrl: string // future Phase 2/7: Yjs WebSocket endpoint
}

export interface AppSettings {
  themeMode: ThemeMode
  compactMode: boolean
  sidebarDefault: SidebarDefault
  fontFamily: 'inter' | 'system' | 'serif' | 'mono'
  editor: EditorPrefs
  databases: DatabasePrefs
  notifications: NotificationPrefs
  collaboration: CollaborationPrefs
  storageProviderId: string // mirrors storageService active id
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'dark',
  compactMode: false,
  sidebarDefault: 'expanded',
  fontFamily: 'inter',
  editor: { defaultBlock: 'paragraph', spellcheck: true, wordCount: false, autoSaveDelayMs: 400 },
  databases: { defaultView: 'table', pageSize: 50, rollupFormulas: false, linkedEmbeds: false },
  notifications: { mentions: true, comments: true, shares: true, tasks: true },
  collaboration: { presence: false, offlineQueue: true, wsUrl: '' },
  storageProviderId: 'local',
}

const KEY = 'openmanas_settings_v1'
const LEGACY_KEY = 'nexus_settings_v1' // pre-rebrand — migrated on first save

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor }, databases: { ...DEFAULT_SETTINGS.databases }, notifications: { ...DEFAULT_SETTINGS.notifications }, collaboration: { ...DEFAULT_SETTINGS.collaboration } }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      editor: { ...DEFAULT_SETTINGS.editor, ...(parsed.editor ?? {}) },
      databases: { ...DEFAULT_SETTINGS.databases, ...(parsed.databases ?? {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications ?? {}) },
      collaboration: { ...DEFAULT_SETTINGS.collaboration, ...(parsed.collaboration ?? {}) },
    }
  } catch {
    return { ...DEFAULT_SETTINGS, editor: { ...DEFAULT_SETTINGS.editor }, databases: { ...DEFAULT_SETTINGS.databases }, notifications: { ...DEFAULT_SETTINGS.notifications }, collaboration: { ...DEFAULT_SETTINGS.collaboration } }
  }
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    localStorage.removeItem(LEGACY_KEY)
  } catch { /* quota */ }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    return 'dark'
  }
  return mode
}

export function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }
  return resolved
}

export function applyFont(font: AppSettings['fontFamily']) {
  if (typeof document === 'undefined') return
  const map: Record<string, string> = {
    inter: `'Inter', system-ui, sans-serif`,
    system: `system-ui, -apple-system, sans-serif`,
    serif: `Georgia, 'Times New Roman', serif`,
    mono: `'JetBrains Mono', ui-monospace, monospace`,
  }
  document.body.style.fontFamily = map[font] ?? map.inter
}

export function applyCompact(compact: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.compact = compact ? '1' : '0'
  document.documentElement.style.setProperty('--radius', compact ? '0.6rem' : '0.9rem')
}

export function applyAllSettings(s: AppSettings) {
  applyThemeMode(s.themeMode)
  applyFont(s.fontFamily)
  applyCompact(s.compactMode)
}
