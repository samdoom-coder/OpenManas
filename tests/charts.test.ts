import { describe, it, expect } from 'vitest'
import {
  parseChartContent, chartStats, pieSlices, arcPath, chartColor,
  isChartType, defaultChartData, CHART_PALETTE,
} from '../src/lib/charts'

describe('parseChartContent', () => {
  it('falls back to starter data on empty/invalid content', () => {
    const a = parseChartContent('')
    expect(a.title).toBe('My chart')
    expect(a.type).toBe('bar')
    expect(a.rows.length).toBeGreaterThan(0)
    expect(parseChartContent('not json{{{')).toEqual(defaultChartData())
  })
  it('parses valid chart JSON', () => {
    const d = parseChartContent(JSON.stringify({ title: 'Sales', type: 'pie', rows: [{ label: 'A', value: 3 }, { label: 'B', value: 7 }] }))
    expect(d.title).toBe('Sales')
    expect(d.type).toBe('pie')
    expect(d.rows).toHaveLength(2)
  })
  it('drops non-numeric rows, falls back when none valid', () => {
    const d = parseChartContent(JSON.stringify({ title: 'X', type: 'bar', rows: [{ label: 'A', value: 'NaN' }, { label: 'B' }] }))
    expect(d.rows.length).toBeGreaterThan(0) // starter fallback
    const ok = parseChartContent(JSON.stringify({ rows: [{ label: 'A', value: '5' }, { label: 'B', value: -2.5 }] }))
    expect(ok.rows).toEqual([{ label: 'A', value: 5 }, { label: 'B', value: -2.5 }])
  })
  it('rejects unknown chart types', () => {
    const d = parseChartContent(JSON.stringify({ type: '3d-hologram', rows: [{ label: 'A', value: 1 }] }))
    expect(d.type).toBe('bar')
    expect(isChartType('donut')).toBe(true)
    expect(isChartType('nope')).toBe(false)
  })
})

describe('chartStats', () => {
  it('computes total/avg/max/min', () => {
    const s = chartStats({ title: 'T', type: 'bar', rows: [{ label: 'A', value: 10 }, { label: 'B', value: 30 }, { label: 'C', value: 20 }] })
    expect(s.total).toBe(60)
    expect(s.average).toBe(20)
    expect(s.max).toEqual({ label: 'B', value: 30 })
    expect(s.min).toEqual({ label: 'A', value: 10 })
    expect(s.count).toBe(3)
  })
  it('handles empty rows', () => {
    expect(chartStats({ title: 'T', type: 'bar', rows: [] })).toMatchObject({ total: 0, average: 0, max: null, min: null, count: 0 })
  })
})

describe('pieSlices', () => {
  it('fractions sum to 1 and angles sum to 360', () => {
    const slices = pieSlices({ title: 'T', type: 'pie', rows: [{ label: 'A', value: 1 }, { label: 'B', value: 3 }] })
    expect(slices[0].fraction).toBeCloseTo(0.25)
    expect(slices[1].fraction).toBeCloseTo(0.75)
    expect(slices.reduce((n, s) => n + s.angle, 0)).toBeCloseTo(360)
    expect(slices[1].cumulative).toBeCloseTo(90)
  })
  it('zero total yields zero fractions without NaN', () => {
    const slices = pieSlices({ title: 'T', type: 'pie', rows: [{ label: 'A', value: 0 }] })
    expect(slices[0].fraction).toBe(0)
    expect(slices[0].angle).toBe(0)
  })
})

describe('arcPath + palette', () => {
  it('builds an SVG path string', () => {
    const p = arcPath(100, 100, 88, 0, 90)
    expect(p.startsWith('M 100 100 L')).toBe(true)
    expect(p).toContain('A 88 88')
  })
  it('cycles palette colors', () => {
    expect(chartColor(0)).toBe(CHART_PALETTE[0])
    expect(chartColor(CHART_PALETTE.length)).toBe(CHART_PALETTE[0])
  })
})
