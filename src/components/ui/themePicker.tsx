import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PAGE_THEMES, type PageThemeId } from '@/lib/pageThemes'

/**
 * Per-page theme picker popup. Parent persists via `updatePage(page.id, { theme })`.
 * Values are `PageThemeId` strings; 'default' inherits the global light/dark theme.
 */
export function ThemePicker({
  value,
  onSelect,
  onClose,
}: {
  value?: string | null
  onSelect: (theme: PageThemeId) => void
  onClose: () => void
}) {
  const current = value ?? 'default'

  return (
    <div className="w-[320px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Page theme</span>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="max-h-[320px] space-y-1 overflow-auto p-2">
        {PAGE_THEMES.map((t) => {
          const selected = current === t.id
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors',
                selected ? 'border-violet-500 bg-violet-500/10' : 'hover:bg-accent',
              )}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-sm"
                style={{ background: t.swatch }}
                aria-hidden
              >
                {selected && (
                  <span
                    className={cn(
                      'grid h-5 w-5 place-items-center rounded-full',
                      t.dark ? 'bg-white text-black' : 'bg-black/70 text-white',
                    )}
                  >
                    <Check size={12} />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight">{t.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.description}</span>
              </span>
              {t.id === 'default' && (
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  System
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="border-t p-2">
        <span className="px-1 text-[10px] text-muted-foreground">
          Theme applies to this page only. “Default” follows Appearance in Settings.
        </span>
      </div>
    </div>
  )
}
