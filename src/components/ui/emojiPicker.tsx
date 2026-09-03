import { useMemo, useState } from 'react'
import { EMOJI_CATEGORIES, searchEmojis, getRecentEmojis, addRecentEmoji } from '@/lib/emojiData'
import { cn } from '@/lib/utils'

/**
 * Emoji-only picker (used for inserting emoji into block content).
 * Upgraded from ~60 hardcoded emojis to the full categorized library.
 * For page icons (emoji + lucide + upload) use `IconPicker` instead.
 */
export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('smileys')
  const [recent, setRecent] = useState<string[]>(() => getRecentEmojis())

  const results = useMemo(() => (q.trim() ? searchEmojis(q, 120) : null), [q])
  const activeList = results ?? EMOJI_CATEGORIES.find((c) => c.id === cat)?.emojis ?? []

  const pick = (emoji: string) => {
    addRecentEmoji(emoji)
    setRecent(getRecentEmojis())
    onSelect(emoji)
    onClose()
  }

  return (
    <div className="absolute z-30 w-[320px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl">
      <div className="flex items-center gap-2 border-b p-2">
        <input
          autoFocus
          placeholder="Search emoji…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-7 flex-1 rounded-lg border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button onClick={onClose} className="rounded-lg p-1 text-xs hover:bg-accent">
          ✕
        </button>
      </div>
      {!q && (
        <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              title={c.label}
              onClick={() => setCat(c.id)}
              className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base hover:bg-accent', cat === c.id && 'bg-accent ring-1 ring-border')}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[220px] overflow-auto p-2">
        {!q && recent.length > 0 && (
          <div className="mb-2">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent</div>
            <div className="grid grid-cols-8 gap-1">
              {recent.slice(0, 16).map((e) => (
                <button key={'r' + e} onClick={() => pick(e)} className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-accent">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {results && <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{results.length} results</div>}
        {activeList.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No emoji found.</div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {activeList.slice(0, 200).map((item, idx) => {
              const char = typeof item === 'string' ? item : item.e
              const name = typeof item === 'string' ? item : item.n
              return (
                <button key={`${char}-${idx}`} title={name} onClick={() => pick(char)} className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-accent">
                  {char}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="border-t px-2 py-1 text-center text-[10px] text-muted-foreground">
        {EMOJI_CATEGORIES.reduce((n, c) => n + c.emojis.length, 0)}+ emojis • Click to insert
      </div>
    </div>
  )
}
