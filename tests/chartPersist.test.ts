import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// appStore touches localStorage at module load — stub it in node env.
const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

const { useAppStore } = await import('../src/stores/appStore')
const { defaultChartData, parseChartContent } = await import('../src/lib/charts')
const { saveSession } = await import('../src/lib/api')

const CHART_JSON = JSON.stringify(defaultChartData())

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
  useAppStore.setState({ selectedPageId: null, selectedDatabaseId: null, token: null, backendMode: 'local', syncStatus: 'local' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('chart reload survival', () => {
  it('persists chart content to localStorage synchronously on updateBlock', () => {
    const s = useAppStore.getState()
    const page = s.createPage('ChartPersist')
    const b = useAppStore.getState().addBlock(page.id, 'chart', '')
    // Discrete save, as ChartBlockView does on mount/edits — must be in
    // localStorage immediately, not after the 400ms autosave debounce,
    // or a fast reload loses the chart.
    useAppStore.getState().updateBlock(b.id, { content: CHART_JSON })
    const raw = mem.get('openmanas_state_v1')
    expect(raw).toBeTruthy()
    const saved = (JSON.parse(raw!) as any).blocks.find((x: any) => x.id === b.id)
    expect(saved?.content).toBe(CHART_JSON)
  })

  it('persists a slash/turn-into type change to chart synchronously', () => {
    const s = useAppStore.getState()
    const page = s.createPage('ChartSlash')
    const b = useAppStore.getState().addBlock(page.id, 'paragraph', '')
    // handleSlashSelect('/chart') path: type flip + content init in one patch.
    useAppStore.getState().updateBlock(b.id, { type: 'chart' as any, content: CHART_JSON })
    const raw = mem.get('openmanas_state_v1')
    expect(raw).toBeTruthy()
    const saved = (JSON.parse(raw!) as any).blocks.find((x: any) => x.id === b.id)
    expect(saved?.type).toBe('chart')
    expect(saved?.content).toBe(CHART_JSON)
  })

  it('pushes chart edits to the server immediately in server mode', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        calls.push(`${init?.method || 'GET'} ${url}`)
        return { ok: true, json: async () => ({}) }
      }),
    )
    const s = useAppStore.getState()
    const page = s.createPage('ChartServer')
    const u = useAppStore.getState().user
    saveSession({ user: { id: u.id, email: u.email, name: u.name }, token: 'demo-token' })
    useAppStore.setState({ token: 'demo-token', backendMode: 'server' })
    const b = useAppStore.getState().addBlock(page.id, 'chart', '')
    calls.length = 0
    useAppStore.getState().updateBlock(b.id, { content: CHART_JSON })
    await new Promise((r) => setTimeout(r, 50))
    // Must PATCH now — a debounced (1000ms) push is cancelled by a fast
    // reload, and the boot pull then overwrites local with stale server
    // state, so the chart "disappears".
    expect(calls.some((c) => c === `PATCH /api/blocks/${b.id}`)).toBe(true)
  })

  it('default chart JSON round-trips through the parser (creation init)', () => {
    const parsed = parseChartContent(CHART_JSON)
    expect(parsed.title).toBe(defaultChartData().title)
    expect(parsed.type).toBe('bar')
    expect(parsed.rows.length).toBeGreaterThan(0)
  })
})
