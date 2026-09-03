// Page cover presets + value helpers.
// Cover value convention: `gradient:<id>` for a preset, otherwise an image
// URL (http/https, data:, blob:). Legacy plain strings fall back gracefully.

export interface CoverPreset {
  id: string
  label: string
  /** tailwind gradient classes */
  classes: string
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: 'violet', label: 'Violet', classes: 'from-violet-500 via-indigo-500 to-blue-500' },
  { id: 'sunset', label: 'Sunset', classes: 'from-orange-400 via-rose-500 to-purple-600' },
  { id: 'ocean', label: 'Ocean', classes: 'from-sky-400 via-blue-500 to-indigo-600' },
  { id: 'emerald', label: 'Emerald', classes: 'from-emerald-400 via-teal-500 to-cyan-600' },
  { id: 'amber', label: 'Amber', classes: 'from-amber-300 via-orange-400 to-rose-400' },
  { id: 'rose', label: 'Rose', classes: 'from-pink-400 via-rose-500 to-red-500' },
  { id: 'slate', label: 'Slate', classes: 'from-slate-500 via-slate-700 to-slate-900' },
  { id: 'candy', label: 'Candy', classes: 'from-fuchsia-400 via-purple-500 to-indigo-500' },
  { id: 'lime', label: 'Lime', classes: 'from-lime-300 via-emerald-400 to-teal-500' },
  { id: 'mono', label: 'Mono', classes: 'from-neutral-200 via-neutral-300 to-neutral-400' },
]

export const DEFAULT_COVER = 'gradient:violet'
export const DEFAULT_COVER_POSITION = 50

/** Clamp a cover focal position to 0-100 and round. */
export function clampCoverPosition(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return DEFAULT_COVER_POSITION
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function isImageCover(cover: string | undefined): boolean {
  if (!cover || cover.startsWith('gradient:')) return false
  return /^(https?:|data:|blob:)/.test(cover)
}

export function presetForCover(cover: string | undefined): CoverPreset {
  const id = (cover ?? '').startsWith('gradient:') ? cover!.slice('gradient:'.length) : ''
  return COVER_PRESETS.find((p) => p.id === id) ?? COVER_PRESETS[0]
}

/** Normalized rendering info for a cover value. */
export function resolveCover(cover: string | undefined): { kind: 'image' | 'gradient'; src?: string; preset: CoverPreset } {
  if (isImageCover(cover)) return { kind: 'image', src: cover, preset: COVER_PRESETS[0] }
  return { kind: 'gradient', preset: presetForCover(cover) }
}
