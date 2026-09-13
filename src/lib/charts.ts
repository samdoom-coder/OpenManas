// Chart block data model + pure helpers (framework-free, see tests/charts.test.ts).
// A chart block stores JSON in `block.content` (same convention as TableBlock):
//   { title: string, type: 'bar'|'line'|'pie'|'donut', rows: [{label, value}] }

export type ChartType = 'bar' | 'line' | 'pie' | 'donut'

export interface ChartRow {
  label: string
  value: number
}

export interface ChartData {
  title: string
  type: ChartType
  rows: ChartRow[]
}

export const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'donut']

/** Slice colors, cycled for rows beyond the palette length. */
export const CHART_PALETTE = [
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
] as const

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

export function isChartType(v: unknown): v is ChartType {
  return typeof v === 'string' && (CHART_TYPES as string[]).includes(v)
}

export function defaultChartData(): ChartData {
  return {
    title: 'My chart',
    type: 'bar',
    rows: [
      { label: 'Mon', value: 12 },
      { label: 'Tue', value: 19 },
      { label: 'Wed', value: 8 },
      { label: 'Thu', value: 15 },
      { label: 'Fri', value: 22 },
    ],
  }
}

function cleanRow(r: unknown): ChartRow | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const value = Number(o.value)
  if (!Number.isFinite(value)) return null
  const label = String(o.label ?? '').slice(0, 40)
  return { label, value }
}

/**
 * Parse chart JSON from block content. Never throws — invalid/empty content
 * falls back to starter data so a new chart always renders something.
 */
export function parseChartContent(content: string): ChartData {
  const fallback = defaultChartData()
  if (!content || !content.trim()) return fallback
  try {
    const p = JSON.parse(content) as Partial<ChartData>
    const rows = Array.isArray(p.rows) ? p.rows.map(cleanRow).filter((r): r is ChartRow => r !== null) : []
    return {
      title: typeof p.title === 'string' ? p.title.slice(0, 120) : fallback.title,
      type: isChartType(p.type) ? p.type : fallback.type,
      rows: rows.length > 0 ? rows.slice(0, 60) : fallback.rows,
    }
  } catch {
    return fallback
  }
}

export interface ChartStats {
  total: number
  average: number
  max: { label: string; value: number } | null
  min: { label: string; value: number } | null
  count: number
}

export function chartStats(data: ChartData): ChartStats {
  const rows = data.rows
  if (rows.length === 0) return { total: 0, average: 0, max: null, min: null, count: 0 }
  let total = 0
  let max = rows[0]
  let min = rows[0]
  for (const r of rows) {
    total += r.value
    if (r.value > max.value) max = r
    if (r.value < min.value) min = r
  }
  return { total, average: total / rows.length, max, min, count: rows.length }
}

export interface PieSlice {
  label: string
  value: number
  fraction: number // 0..1 of total
  angle: number // degrees swept by this slice
  cumulative: number // degrees where this slice starts
  color: string
}

/** Slice geometry for pie/donut (fractions sum to 1 when total > 0). */
export function pieSlices(data: ChartData): PieSlice[] {
  const total = data.rows.reduce((n, r) => n + r.value, 0)
  let acc = 0
  return data.rows.map((r, i) => {
    const fraction = total > 0 ? r.value / total : 0
    const angle = fraction * 360
    const slice: PieSlice = { label: r.label, value: r.value, fraction, angle, cumulative: acc, color: chartColor(i) }
    acc += angle
    return slice
  })
}

/** SVG arc path for a pie slice (cx,cy center, r radius, degrees). */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180
  const endDeg = startDeg + sweepDeg
  const x1 = cx + r * Math.cos(rad(startDeg))
  const y1 = cy + r * Math.sin(rad(startDeg))
  const x2 = cx + r * Math.cos(rad(endDeg))
  const y2 = cy + r * Math.sin(rad(endDeg))
  const large = sweepDeg > 180 ? 1 : 0
  if (sweepDeg >= 360) {
    // Full circle needs two arcs (a single-arc full circle renders nothing).
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
  }
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
}
