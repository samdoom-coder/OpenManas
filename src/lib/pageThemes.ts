import type { CSSProperties } from 'react'

export type PageThemeId =
  | 'default'
  | 'paper'
  | 'cream'
  | 'sage'
  | 'sky'
  | 'lavender'
  | 'rose'
  | 'midnight'
  | 'forest'
  | 'mono'

export interface PageTheme {
  id: PageThemeId
  name: string
  description: string
  /** preview swatch (css background) shown in the picker */
  swatch: string
  /** dark text on light bg vs light text on dark bg — used for picker check contrast */
  dark: boolean
  /** scoped CSS-variable overrides (HSL triplets, same format as index.css). Empty = inherit global theme. */
  vars: Record<string, string>
  fontFamily?: string
}

export const PAGE_THEMES: PageTheme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Follows workspace theme (light / dark)',
    swatch: 'linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--accent)) 100%)',
    dark: false,
    vars: {},
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Clean white, serif-friendly',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #f5f1e8 100%)',
    dark: false,
    vars: {
      '--background': '40 20% 99%',
      '--foreground': '24 10% 10%',
      '--card': '0 0% 100%',
      '--card-foreground': '24 10% 10%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '24 10% 10%',
      '--primary': '24 10% 12%',
      '--primary-foreground': '40 20% 99%',
      '--secondary': '40 12% 94%',
      '--secondary-foreground': '24 10% 12%',
      '--muted': '40 12% 94%',
      '--muted-foreground': '24 6% 42%',
      '--accent': '40 14% 92%',
      '--accent-foreground': '24 10% 12%',
      '--border': '30 10% 88%',
      '--input': '30 10% 88%',
      '--ring': '24 10% 12%',
    },
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  {
    id: 'cream',
    name: 'Cream',
    description: 'Warm amber tint',
    swatch: 'linear-gradient(135deg, #fffbeb 0%, #fde68a 100%)',
    dark: false,
    vars: {
      '--background': '38 60% 96%',
      '--foreground': '20 25% 12%',
      '--card': '36 40% 99%',
      '--card-foreground': '20 25% 12%',
      '--popover': '36 40% 99%',
      '--popover-foreground': '20 25% 12%',
      '--primary': '20 60% 22%',
      '--primary-foreground': '38 60% 98%',
      '--secondary': '34 35% 90%',
      '--secondary-foreground': '20 25% 14%',
      '--muted': '34 30% 90%',
      '--muted-foreground': '22 12% 42%',
      '--accent': '34 40% 88%',
      '--accent-foreground': '20 25% 14%',
      '--border': '32 25% 82%',
      '--input': '32 25% 82%',
      '--ring': '20 60% 22%',
    },
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Soft green focus',
    swatch: 'linear-gradient(135deg, #f0fdf4 0%, #86efac 100%)',
    dark: false,
    vars: {
      '--background': '140 25% 96%',
      '--foreground': '150 25% 10%',
      '--card': '0 0% 100%',
      '--card-foreground': '150 25% 10%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '150 25% 10%',
      '--primary': '150 40% 18%',
      '--primary-foreground': '140 25% 98%',
      '--secondary': '140 20% 89%',
      '--secondary-foreground': '150 25% 12%',
      '--muted': '140 18% 89%',
      '--muted-foreground': '150 10% 38%',
      '--accent': '140 22% 86%',
      '--accent-foreground': '150 25% 12%',
      '--border': '140 14% 80%',
      '--input': '140 14% 80%',
      '--ring': '150 40% 18%',
    },
  },
  {
    id: 'sky',
    name: 'Ocean',
    description: 'Calm blue tint',
    swatch: 'linear-gradient(135deg, #eff6ff 0%, #7dd3fc 100%)',
    dark: false,
    vars: {
      '--background': '210 45% 97%',
      '--foreground': '215 30% 12%',
      '--card': '0 0% 100%',
      '--card-foreground': '215 30% 12%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '215 30% 12%',
      '--primary': '215 60% 22%',
      '--primary-foreground': '210 45% 99%',
      '--secondary': '210 35% 90%',
      '--secondary-foreground': '215 30% 14%',
      '--muted': '210 30% 90%',
      '--muted-foreground': '215 14% 42%',
      '--accent': '210 35% 87%',
      '--accent-foreground': '215 30% 14%',
      '--border': '212 22% 82%',
      '--input': '212 22% 82%',
      '--ring': '215 60% 22%',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft purple tint',
    swatch: 'linear-gradient(135deg, #faf5ff 0%, #c4b5fd 100%)',
    dark: false,
    vars: {
      '--background': '260 35% 97%',
      '--foreground': '260 25% 12%',
      '--card': '0 0% 100%',
      '--card-foreground': '260 25% 12%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '260 25% 12%',
      '--primary': '260 50% 28%',
      '--primary-foreground': '260 35% 99%',
      '--secondary': '260 25% 91%',
      '--secondary-foreground': '260 25% 14%',
      '--muted': '260 22% 91%',
      '--muted-foreground': '260 12% 44%',
      '--accent': '260 28% 88%',
      '--accent-foreground': '260 25% 14%',
      '--border': '260 18% 83%',
      '--input': '260 18% 83%',
      '--ring': '260 50% 28%',
    },
  },
  {
    id: 'rose',
    name: 'Sunset',
    description: 'Warm rose tint',
    swatch: 'linear-gradient(135deg, #fff1f2 0%, #fda4af 100%)',
    dark: false,
    vars: {
      '--background': '350 45% 97%',
      '--foreground': '350 30% 12%',
      '--card': '0 0% 100%',
      '--card-foreground': '350 30% 12%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '350 30% 12%',
      '--primary': '350 60% 28%',
      '--primary-foreground': '350 45% 99%',
      '--secondary': '350 35% 91%',
      '--secondary-foreground': '350 30% 14%',
      '--muted': '350 30% 91%',
      '--muted-foreground': '350 12% 44%',
      '--accent': '350 35% 88%',
      '--accent-foreground': '350 30% 14%',
      '--border': '350 20% 83%',
      '--input': '350 20% 83%',
      '--ring': '350 60% 28%',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep blue-black, always dark',
    swatch: 'linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)',
    dark: true,
    vars: {
      '--background': '222 47% 7%',
      '--foreground': '0 0% 98%',
      '--card': '222 35% 11%',
      '--card-foreground': '0 0% 98%',
      '--popover': '222 35% 12%',
      '--popover-foreground': '0 0% 98%',
      '--primary': '0 0% 98%',
      '--primary-foreground': '222 47% 10%',
      '--secondary': '222 25% 16%',
      '--secondary-foreground': '0 0% 98%',
      '--muted': '222 22% 16%',
      '--muted-foreground': '220 12% 65%',
      '--accent': '222 25% 17%',
      '--accent-foreground': '0 0% 98%',
      '--border': '222 18% 22%',
      '--input': '222 18% 22%',
      '--ring': '220 12% 80%',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green night, always dark',
    swatch: 'linear-gradient(135deg, #052e1b 0%, #16a34a 100%)',
    dark: true,
    vars: {
      '--background': '160 35% 7%',
      '--foreground': '0 0% 96%',
      '--card': '160 28% 10%',
      '--card-foreground': '0 0% 96%',
      '--popover': '160 28% 11%',
      '--popover-foreground': '0 0% 96%',
      '--primary': '140 40% 82%',
      '--primary-foreground': '160 35% 8%',
      '--secondary': '160 20% 15%',
      '--secondary-foreground': '0 0% 96%',
      '--muted': '160 18% 15%',
      '--muted-foreground': '150 10% 62%',
      '--accent': '160 22% 16%',
      '--accent-foreground': '0 0% 96%',
      '--border': '160 15% 20%',
      '--input': '160 15% 20%',
      '--ring': '140 30% 75%',
    },
  },
  {
    id: 'mono',
    name: 'Stone',
    description: 'Neutral grayscale',
    swatch: 'linear-gradient(135deg, #fafafa 0%, #a3a3a3 100%)',
    dark: false,
    vars: {
      '--background': '0 0% 96%',
      '--foreground': '0 0% 10%',
      '--card': '0 0% 100%',
      '--card-foreground': '0 0% 10%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '0 0% 10%',
      '--primary': '0 0% 12%',
      '--primary-foreground': '0 0% 98%',
      '--secondary': '0 0% 90%',
      '--secondary-foreground': '0 0% 12%',
      '--muted': '0 0% 90%',
      '--muted-foreground': '0 0% 42%',
      '--accent': '0 0% 87%',
      '--accent-foreground': '0 0% 12%',
      '--border': '0 0% 82%',
      '--input': '0 0% 82%',
      '--ring': '0 0% 12%',
    },
  },
]

export const DEFAULT_PAGE_THEME: PageThemeId = 'default'

export function getPageTheme(id?: string | null): PageTheme {
  return PAGE_THEMES.find((t) => t.id === id) ?? PAGE_THEMES[0]
}

export function isValidPageTheme(id: unknown): id is PageThemeId {
  return typeof id === 'string' && PAGE_THEMES.some((t) => t.id === id)
}

export function normalizePageTheme(id: unknown): PageThemeId {
  return isValidPageTheme(id) ? id : DEFAULT_PAGE_THEME
}

/**
 * Scoped style for a page wrapper. Uses CSS-variable overrides so every
 * Tailwind `bg-card / text-muted-foreground / border` child inside the page
 * automatically picks up the page theme without touching the global theme.
 * Returns `undefined` for `default` (inherit global light/dark).
 */
export function pageThemeStyle(id?: string | null): CSSProperties | undefined {
  const theme = getPageTheme(id)
  if (theme.id === 'default' || Object.keys(theme.vars).length === 0) return undefined
  return {
    ...(theme.vars as CSSProperties),
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
  } as CSSProperties
}
