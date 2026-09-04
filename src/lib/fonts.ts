export interface FontFamilyOption {
  id: string
  name: string
  /** css font-family value */
  css: string
  /** tailwind/utility class for picker swatches */
  className: string
  handwriting?: boolean
}

export const FONT_FAMILIES: FontFamilyOption[] = [
  { id: 'sans', name: 'Sans (Inter)', css: "'Inter', system-ui, sans-serif", className: 'font-sans' },
  { id: 'serif', name: 'Serif (Georgia)', css: "Georgia, 'Times New Roman', serif", className: 'font-serif' },
  { id: 'mono', name: 'Mono (JetBrains)', css: "'JetBrains Mono', monospace", className: 'font-mono' },
  { id: 'caveat', name: 'Caveat — Handwriting', css: "'Caveat', cursive", className: 'font-caveat', handwriting: true },
  { id: 'kalam', name: 'Kalam — Marker', css: "'Kalam', cursive", className: 'font-kalam', handwriting: true },
  { id: 'patrick', name: 'Patrick Hand — Print', css: "'Patrick Hand', cursive", className: 'font-patrick', handwriting: true },
  { id: 'shadows', name: 'Shadows Into Light — Casual', css: "'Shadows Into Light', cursive", className: 'font-shadows', handwriting: true },
]

export function fontFamilyCSS(id?: string | null): string | undefined {
  if (!id || id === 'sans') return undefined // inherit Inter from body
  return FONT_FAMILIES.find((f) => f.id === id)?.css
}

export function isHandwritingFont(id?: string | null): boolean {
  return !!FONT_FAMILIES.find((f) => f.id === id)?.handwriting
}

export function fontFamilyName(id?: string | null): string {
  return FONT_FAMILIES.find((f) => f.id === id)?.name ?? 'Sans (Inter)'
}
