// Chart block: Bar / Line / Pie / Donut over editable label→value rows.
// Zero-dependency SVG (same convention as KnowledgeGraph) — works offline,
// no bundle cost. Data persists as JSON in `block.content` (see lib/charts.ts).
// `ChartSvg` is the pure read-only renderer, reused by SharedPage.

import { useState, useEffect, useId } from 'react'
import { BarChart3, LineChart, PieChart, Donut, Plus, Trash2, TableProperties } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseChartContent, chartStats, pieSlices, arcPath, chartColor,
  type ChartData, type ChartType,
} from '@/lib/charts'

const TYPE_META: { type: ChartType; label: string; Icon: typeof BarChart3 }[] = [
  { type: 'bar', label: 'Bar', Icon: BarChart3 },
  { type: 'line', label: 'Line', Icon: LineChart },
  { type: 'pie', label: 'Pie', Icon: PieChart },
  { type: 'donut', label: 'Donut', Icon: Donut },
]

/** Compact axis number: 1500 → "1.5k", 2.5M, else trimmed. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const trim = (v: number) => String(Math.round(v * 10) / 10)
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (abs >= 10_000) return `${trim(n / 1000)}k`
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return String(Math.round(n * 100) / 100)
}

export function ChartBlockView({ content, onChange }: { content: string; onChange: (json: string) => void }) {
  const [data, setData] = useState<ChartData>(() => parseChartContent(content))
  const [editing, setEditing] = useState(true)
  // Persist every edit (same fire-and-remember pattern as TableBlock).
  useEffect(() => { onChange(JSON.stringify(data)) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = chartStats(data)
  const setType = (type: ChartType) => setData(d => ({ ...d, type }))
  const setTitle = (title: string) => setData(d => ({ ...d, title: title.slice(0, 120) }))
  const setRow = (i: number, patch: Partial<{ label: string; value: number }>) =>
    setData(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const addRow = () =>
    setData(d => (d.rows.length >= 60 ? d : { ...d, rows: [...d.rows, { label: `Item ${d.rows.length + 1}`, value: 0 }] }))
  const deleteRow = (i: number) =>
    setData(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }))

  return (
    <div className="rounded-xl border bg-background w-full max-w-full">
      {/* Header: title + viz switcher + data toggle */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
        <span className="text-muted-foreground">📊</span>
        <input
          value={data.title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Chart title"
          aria-label="Chart title"
          className="flex-1 min-w-[120px] bg-transparent outline-none font-semibold text-sm placeholder:text-muted-foreground/50 px-1 py-1 rounded-md focus:bg-muted/50"
        />
        <div className="flex items-center gap-1 p-0.5 rounded-xl border bg-muted/20">
          {TYPE_META.map(({ type, label, Icon }) => (
            <button
              key={type}
              onClick={() => setType(type)}
              title={`Show as ${label}`}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium',
                data.type === type ? 'bg-background shadow border' : 'hover:bg-accent text-muted-foreground',
              )}
            >
              <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className={cn('flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium', editing ? 'bg-accent border-violet-500/30' : 'bg-card hover:bg-accent')}
          title={editing ? 'Hide data editor' : 'Edit chart data'}
        >
          <TableProperties size={13} /> {editing ? 'Done' : 'Data'}
        </button>
      </div>

      {/* Chart canvas */}
      <div className="px-3 pt-1">
        <ChartSvg data={data} />
      </div>

      {/* Stats footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[11px] text-muted-foreground border-t border-border/50 mt-1">
        <span className="tabular-nums">Total <b className="text-foreground">{fmtNum(stats.total)}</b></span>
        <span className="tabular-nums">Avg <b className="text-foreground">{fmtNum(stats.average)}</b></span>
        {stats.max && <span className="truncate">Top <b className="text-foreground">{stats.max.label || '(blank)'} ({fmtNum(stats.max.value)})</b></span>}
        <span className="ml-auto tabular-nums">{stats.count} row{stats.count === 1 ? '' : 's'}</span>
      </div>

      {/* Data editor */}
      {editing && (
        <div className="px-3 pb-3 pt-1">
          <div className="rounded-xl border bg-muted/20 p-2 space-y-1 max-h-[220px] overflow-auto">
            {data.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: chartColor(i) }} />
                <input
                  value={r.label}
                  onChange={e => setRow(i, { label: e.target.value.slice(0, 40) })}
                  placeholder={`Item ${i + 1}`}
                  aria-label={`Label for row ${i + 1}`}
                  className="flex-1 min-w-0 h-8 rounded-lg border bg-background px-2 text-[13px] outline-none focus:border-violet-500"
                />
                <input
                  type="number"
                  value={r.value}
                  onChange={e => setRow(i, { value: Number(e.target.value) })}
                  aria-label={`Value for row ${i + 1}`}
                  className="w-24 h-8 rounded-lg border bg-background px-2 text-[13px] font-mono text-right outline-none focus:border-violet-500"
                />
                <button onClick={() => deleteRow(i)} disabled={data.rows.length <= 1} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-red-600 disabled:opacity-30" title="Delete row">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button onClick={addRow} disabled={data.rows.length >= 60} className="flex items-center gap-1.5 px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 disabled:opacity-40">
              <Plus size={13} /> Add row
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Pure read-only SVG renderer — no editing state, safe for embeds/shares. */
export function ChartSvg({ data }: { data: ChartData }) {
  if (data.type === 'pie' || data.type === 'donut') return <PieSvg data={data} donut={data.type === 'donut'} />
  if (data.type === 'line') return <LineSvg data={data} />
  return <BarSvg data={data} />
}

function ChartEmpty() {
  return <div className="py-10 text-center text-sm text-muted-foreground">No data — add rows below.</div>
}

/* ------------------------------- Bar ---------------------------------- */

function BarSvg({ data }: { data: ChartData }) {
  const rows = data.rows
  if (rows.length === 0) return <ChartEmpty />
  const W = Math.max(320, rows.length * 56 + 48)
  const H = 240
  const padL = 40, padB = 30, padT = 18, padR = 10
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxV = Math.max(0, ...rows.map(r => r.value))
  const y = (v: number) => (maxV > 0 ? padT + plotH - (Math.max(0, v) / maxV) * plotH : padT + plotH)
  const slot = plotW / rows.length
  const bw = Math.min(44, slot * 0.58)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => maxV * f)
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[320px] w-full" role="img" aria-label={`Bar chart: ${data.title}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray={i === 0 ? '' : '3 3'} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} className="fill-muted-foreground">{fmtNum(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const h = padT + plotH - y(r.value)
          const x = padL + slot * i + (slot - bw) / 2
          return (
            <g key={i}>
              <rect x={x} y={y(r.value)} width={bw} height={Math.max(0, h)} rx={4} fill={chartColor(i)} opacity={0.9}>
                <title>{`${r.label || `Item ${i + 1}`}: ${fmtNum(r.value)}`}</title>
              </rect>
              {h > 14 && (
                <text x={x + bw / 2} y={y(r.value) + 12} textAnchor="middle" fontSize={10} fontWeight={600} fill="white">{fmtNum(r.value)}</text>
              )}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
                {(r.label || `Item ${i + 1}`).length > 10 ? `${(r.label || `Item ${i + 1}`).slice(0, 9)}…` : (r.label || `Item ${i + 1}`)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------- Line --------------------------------- */

function LineSvg({ data }: { data: ChartData }) {
  const rows = data.rows
  const gid = useId()
  if (rows.length === 0) return <ChartEmpty />
  const W = Math.max(320, rows.length * 56 + 48)
  const H = 240
  const padL = 40, padB = 30, padT = 18, padR = 14
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const vals = rows.map(r => r.value)
  const maxV = Math.max(...vals, 0)
  const minV = Math.min(...vals, 0)
  const span = maxV - minV || 1
  const x = (i: number) => (rows.length === 1 ? padL + plotW / 2 : padL + (i / (rows.length - 1)) * plotW)
  const y = (v: number) => padT + plotH - ((v - minV) / span) * plotH
  const pts = rows.map((r, i) => `${x(i)},${y(r.value)}`).join(' ')
  const area = `${padL},${padT + plotH} ${pts} ${x(rows.length - 1)},${padT + plotH}`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => minV + span * f)
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[320px] w-full" role="img" aria-label={`Line chart: ${data.title}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 3" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} className="fill-muted-foreground">{fmtNum(t)}</text>
          </g>
        ))}
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((r, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(r.value)} r={4} fill={chartColor(i)} stroke="white" strokeWidth={1.5}>
              <title>{`${r.label || `Item ${i + 1}`}: ${fmtNum(r.value)}`}</title>
            </circle>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
              {(r.label || `Item ${i + 1}`).length > 10 ? `${(r.label || `Item ${i + 1}`).slice(0, 9)}…` : (r.label || `Item ${i + 1}`)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ---------------------------- Pie / Donut ------------------------------ */

function PieSvg({ data, donut }: { data: ChartData; donut: boolean }) {
  const rows = data.rows
  if (rows.length === 0) return <ChartEmpty />
  const slices = pieSlices(data)
  const total = rows.reduce((n, r) => n + r.value, 0)
  const R = 88
  const CX = 100, CY = 100
  const ring = (s: (typeof slices)[number]) => {
    if (s.angle <= 0) return null
    if (s.angle >= 360) {
      // Single 100% slice: full disc (pie) or full ring (donut).
      return donut ? (
        <g key={s.label}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={s.color} strokeWidth={R - 52}>
            <title>{`${s.label}: 100%`}</title>
          </circle>
        </g>
      ) : (
        <circle key={s.label} cx={CX} cy={CY} r={R} fill={s.color}>
          <title>{`${s.label}: 100%`}</title>
        </circle>
      )
    }
    if (!donut) {
      return (
        <path key={s.label + s.cumulative} d={arcPath(CX, CY, R, s.cumulative, s.angle)} fill={s.color} stroke="white" strokeWidth={1.5}>
          <title>{`${s.label}: ${fmtNum(s.value)} (${Math.round(s.fraction * 100)}%)`}</title>
        </path>
      )
    }
    // Annular sector: outer arc forward, inner arc back, closed.
    const rad = (d: number) => ((d - 90) * Math.PI) / 180
    const inner = 52
    const a0 = s.cumulative, a1 = s.cumulative + s.angle
    const large = s.angle > 180 ? 1 : 0
    const d = [
      `M ${CX + R * Math.cos(rad(a0))} ${CY + R * Math.sin(rad(a0))}`,
      `A ${R} ${R} 0 ${large} 1 ${CX + R * Math.cos(rad(a1))} ${CY + R * Math.sin(rad(a1))}`,
      `L ${CX + inner * Math.cos(rad(a1))} ${CY + inner * Math.sin(rad(a1))}`,
      `A ${inner} ${inner} 0 ${large} 0 ${CX + inner * Math.cos(rad(a0))} ${CY + inner * Math.sin(rad(a0))}`,
      'Z',
    ].join(' ')
    return (
      <path key={s.label + s.cumulative} d={d} fill={s.color} stroke="white" strokeWidth={1.5}>
        <title>{`${s.label}: ${fmtNum(s.value)} (${Math.round(s.fraction * 100)}%)`}</title>
      </path>
    )
  }
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 py-1">
      <svg viewBox="0 0 200 200" className="w-[200px] h-[200px] shrink-0" role="img" aria-label={`${donut ? 'Donut' : 'Pie'} chart: ${data.title}`}>
        {total <= 0 ? (
          <circle cx={CX} cy={CY} r={R} className="fill-muted" />
        ) : (
          slices.map(ring)
        )}
        {donut && total > 0 && (
          <text x={CX} y={CY - 2} textAnchor="middle" fontSize={17} fontWeight={700} className="fill-foreground">{fmtNum(total)}</text>
        )}
        {donut && total > 0 && (
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize={10} className="fill-muted-foreground">total</text>
        )}
      </svg>
      <div className="flex-1 min-w-0 w-full space-y-1 max-h-[200px] overflow-auto">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="flex-1 min-w-0 truncate font-medium">{s.label || `Item ${i + 1}`}</span>
            <span className="tabular-nums text-muted-foreground shrink-0">{fmtNum(s.value)}</span>
            <span className="tabular-nums font-semibold shrink-0 w-10 text-right">{total > 0 ? `${Math.round(s.fraction * 100)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
